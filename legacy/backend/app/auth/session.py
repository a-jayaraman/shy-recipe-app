import os
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import Response
from jose import jwt, JWTError

SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
if not SESSION_SECRET:
    raise RuntimeError(
        "SESSION_SECRET env var is required and must not be empty. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )

_ALGORITHM = "HS256"
_SESSION_MAX_AGE = 60 * 60 * 24 * 7   # 7 days
_STATE_MAX_AGE = 60 * 10               # 10 minutes


def _cookie_kwargs() -> dict:
    explicit = os.environ.get("SESSION_COOKIE_SECURE", "")
    if explicit:
        secure = explicit.lower() == "true"
    else:
        # Auto-detect: use secure cookies whenever the frontend is served over HTTPS
        secure = os.environ.get("FRONTEND_URL", "").startswith("https://")
    domain = os.environ.get("SESSION_COOKIE_DOMAIN", "") or None
    return {"httponly": False, "samesite": "lax", "secure": secure, "domain": domain}


def create_session_token(user_id: int, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(seconds=_SESSION_MAX_AGE)
    return jwt.encode(
        {"sub": str(user_id), "role": role, "exp": exp},
        SESSION_SECRET,
        algorithm=_ALGORITHM,
    )


def decode_session_token(token: str) -> dict:
    return jwt.decode(token, SESSION_SECRET, algorithms=[_ALGORITHM])


def create_oauth_state_token(state: str, code_verifier: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(seconds=_STATE_MAX_AGE)
    return jwt.encode(
        {"state": state, "code_verifier": code_verifier, "exp": exp},
        SESSION_SECRET,
        algorithm=_ALGORITHM,
    )


def decode_oauth_state_token(token: str) -> dict:
    return jwt.decode(token, SESSION_SECRET, algorithms=[_ALGORITHM])


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_session_cookie(response: Response, token: str) -> None:
    kw = _cookie_kwargs()
    kw["httponly"] = True
    response.set_cookie("session", token, max_age=_SESSION_MAX_AGE, **kw)


def clear_session_cookie(response: Response) -> None:
    kw = _cookie_kwargs()
    kw["httponly"] = True
    response.delete_cookie("session", **kw)


def set_oauth_state_cookie(response: Response, token: str) -> None:
    kw = _cookie_kwargs()
    kw["httponly"] = True
    response.set_cookie("oauth_state", token, max_age=_STATE_MAX_AGE, **kw)


def clear_oauth_state_cookie(response: Response) -> None:
    kw = _cookie_kwargs()
    kw["httponly"] = True
    response.delete_cookie("oauth_state", **kw)


def set_csrf_cookie(response: Response, token: str) -> None:
    kw = _cookie_kwargs()
    # httponly=False so JS can read it
    response.set_cookie("csrf_token", token, max_age=_SESSION_MAX_AGE, **kw)


def clear_csrf_cookie(response: Response) -> None:
    kw = _cookie_kwargs()
    response.delete_cookie("csrf_token", **kw)
