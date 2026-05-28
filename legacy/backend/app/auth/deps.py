from typing import Optional

from fastapi import Depends, HTTPException, Request
from jose import JWTError
from sqlmodel import Session

from app.auth.session import decode_session_token
from app.db import get_session
from app.models import ROLE_HIERARCHY, User, UserRole


async def get_current_user_optional(
    request: Request,
    session: Session = Depends(get_session),
) -> Optional[User]:
    token = request.cookies.get("session")
    if not token:
        return None
    try:
        payload = decode_session_token(token)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None

    user = session.get(User, user_id)
    return user  # None if deleted


async def get_current_user(
    request: Request,
    session: Session = Depends(get_session),
) -> User:
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_session_token(token)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")
    return user


def require_role(min_role: UserRole):
    """Returns a FastAPI dependency that enforces a minimum role."""
    async def dependency(
        user: User = Depends(get_current_user),
    ) -> User:
        if ROLE_HIERARCHY[UserRole(user.role)] < ROLE_HIERARCHY[min_role]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return dependency
