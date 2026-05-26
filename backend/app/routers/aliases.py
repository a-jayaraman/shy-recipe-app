from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.db import get_session
from app import crud

router = APIRouter(prefix="/aliases", tags=["aliases"])


@router.get("/ingredients", response_model=dict[str, str])
def get_ingredient_aliases(session: Session = Depends(get_session)):
    return crud.get_ingredient_aliases(session)


@router.get("/tags", response_model=dict[str, str])
def get_tag_display_names(session: Session = Depends(get_session)):
    return crud.get_tag_display_names(session)
