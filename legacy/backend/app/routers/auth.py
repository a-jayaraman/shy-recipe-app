import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from jose import JWTError
from sqlmodel import Session, select

from app.auth.deps import get_current_user_optional
from app.auth.oauth import build_authorization_url, exchange_code, fetch_userinfo, generate_pkce_pair, generate_state
from app.auth.session import (
    clear_csrf_cookie,
    clear_oauth_state_cookie,
    clear_session_cookie,
    create_oauth_state_token,
    create_session_token,
    decode_oauth_state_token,
    generate_csrf_token,
    set_csrf_cookie,
    set_oauth_state_cookie,
    set_session_cookie,
)
from app.db import get_session
from app.models import User, UserRole
from app.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
async def login() -> JSONResponse:
    code_verifier, _ = generate_pkce_pair()
    state = generate_state()
    state_token = create_oauth_state_token(state, code_verifier)
    redirect_url = await build_authorization_url(state, code_verifier)

    response = JSONResponse({"redirect_url": redirect_url})
    set_oauth_state_cookie(response, state_token)
    return response


@router.get("/callback")
async def callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    session: Session = Depends(get_session),
) -> RedirectResponse:
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")

    if error:
        return RedirectResponse(f"{frontend_url}/login?error=oauth_denied")

    if not code or not state:
        return RedirectResponse(f"{frontend_url}/login?error=missing_params")

    # Read and immediately clear the oauth_state cookie (prevent replay)
    state_cookie = request.cookies.get("oauth_state")
    clear_response = Response()
    clear_oauth_state_cookie(clear_response)

    if not state_cookie:
        return RedirectResponse(f"{frontend_url}/login?error=missing_state")

    try:
        payload = decode_oauth_state_token(state_cookie)
        stored_state = payload["state"]
        code_verifier = payload["code_verifier"]
    except (JWTError, KeyError):
        return RedirectResponse(f"{frontend_url}/login?error=invalid_state")

    if state != stored_state:
        return RedirectResponse(f"{frontend_url}/login?error=state_mismatch")

    try:
        token_data = await exchange_code(code, code_verifier)
        access_token = token_data.get("access_token", "")
        userinfo = await fetch_userinfo(access_token)
    except Exception:
        return RedirectResponse(f"{frontend_url}/login?error=token_exchange_failed")

    google_sub = userinfo.get("sub")
    if not google_sub:
        return RedirectResponse(f"{frontend_url}/login?error=missing_sub")

    initial_admins = {
        e.strip().lower()
        for e in os.environ.get("INITIAL_ADMIN_EMAILS", "").split(",")
        if e.strip()
    }

    existing = session.exec(select(User).where(User.google_sub == google_sub)).first()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if existing:
        existing.email = userinfo.get("email", existing.email)
        existing.name = userinfo.get("name")
        existing.picture_url = userinfo.get("picture")
        existing.last_login_at = now
        user = existing
    else:
        email = userinfo.get("email", "")
        role = UserRole.admin.value if email.lower() in initial_admins else UserRole.viewer.value
        user = User(
            google_sub=google_sub,
            email=email,
            name=userinfo.get("name"),
            picture_url=userinfo.get("picture"),
            role=role,
            last_login_at=now,
        )
        session.add(user)

    session.commit()
    session.refresh(user)

    session_token = create_session_token(user.id, user.role)
    csrf_token = generate_csrf_token()

    response = RedirectResponse(frontend_url, status_code=302)
    clear_oauth_state_cookie(response)
    set_session_cookie(response, session_token)
    set_csrf_cookie(response, csrf_token)
    return response


@router.post("/logout", status_code=204)
async def logout(response: Response) -> None:
    clear_session_cookie(response)
    clear_csrf_cookie(response)


@router.get("/me", response_model=UserOut)
async def me(
    response: Response,
    user: Optional[User] = Depends(get_current_user_optional),
) -> UserOut:
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    # Refresh csrf cookie on /me so SPAs always have a fresh token after page load
    csrf_token = generate_csrf_token()
    set_csrf_cookie(response, csrf_token)
    return UserOut.model_validate(user)
