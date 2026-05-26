from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app import crud, schemas
from app.models import TAG_CATEGORIES

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=schemas.AllTagsResponse)
def get_all_tags(session: Session = Depends(get_session)):
    return schemas.AllTagsResponse(categories=crud.get_all_tags(session))


@router.get("/{category}", response_model=schemas.TagCategoryResponse)
def get_tags_by_category(category: str, session: Session = Depends(get_session)):
    if category not in TAG_CATEGORIES:
        raise HTTPException(
            422,
            detail=f"Invalid category. Must be one of: {sorted(TAG_CATEGORIES)}",
        )
    values = crud.get_tags_by_category(session, category)
    return schemas.TagCategoryResponse(
        category=category,
        values=[schemas.TagValue(**v) for v in values],
    )
