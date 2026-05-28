from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.auth.deps import require_role
from app.db import get_session
from app.models import ROLE_HIERARCHY, User, UserRole
from app.schemas import UserOut, UserPatch

router = APIRouter(prefix="/admin", tags=["admin"])

_require_admin = require_role(UserRole.admin)


@router.get("/users", response_model=list[UserOut])
def list_users(
    current_user: Annotated[User, Depends(_require_admin)],
    session: Session = Depends(get_session),
) -> list[User]:
    return list(session.exec(select(User).order_by(User.created_at.desc())).all())


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserPatch,
    current_user: Annotated[User, Depends(_require_admin)],
    session: Session = Depends(get_session),
) -> User:
    target = session.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    if target.id == current_user.id:
        if data.role is not None and data.role != UserRole.admin.value:
            raise HTTPException(status_code=400, detail="Admins cannot demote themselves")
        if data.is_active is False:
            raise HTTPException(status_code=400, detail="Admins cannot deactivate themselves")

    if data.role is not None:
        if data.role not in {r.value for r in UserRole}:
            raise HTTPException(status_code=422, detail=f"Invalid role: {data.role}")
        target.role = data.role

    if data.is_active is not None:
        target.is_active = data.is_active

    session.add(target)
    session.commit()
    session.refresh(target)
    return target
