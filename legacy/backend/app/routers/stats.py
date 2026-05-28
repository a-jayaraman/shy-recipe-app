from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app import crud, schemas

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=schemas.StatsResponse)
def get_stats(session: Session = Depends(get_session)):
    return schemas.StatsResponse(**crud.get_stats(session))
