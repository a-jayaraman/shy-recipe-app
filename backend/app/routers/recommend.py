import os

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session

from app.db import engine
from app.llm.orchestrator import run_recommendation_stream

router = APIRouter(prefix="/recommend", tags=["recommend"])

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class RecommendRequest(BaseModel):
    messages: list[dict]
    model: str = "~anthropic/claude-haiku-latest"


@router.post("")
async def recommend(body: RecommendRequest):
    # Session is created inside the generator — Depends(get_session) would close before
    # the StreamingResponse generator runs.
    async def event_generator():
        with Session(engine) as session:
            async for event in run_recommendation_stream(body.messages, body.model, session):
                yield event

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/validate-model")
async def validate_model(model_id: str = Query(...)):
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                f"{OPENROUTER_BASE_URL}/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Could not reach OpenRouter: {exc}")

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter models endpoint returned {resp.status_code}",
        )

    data = resp.json()
    model_ids = {m["id"] for m in data.get("data", [])}

    # Support ~ aliases by also checking the bare id
    bare_id = model_id.lstrip("~")
    found_id = model_id if model_id in model_ids else (bare_id if bare_id in model_ids else None)

    if found_id:
        display = next(
            (m.get("name", found_id) for m in data["data"] if m["id"] == found_id),
            found_id,
        )
        return {"valid": True, "display_name": display}

    return {"valid": False, "display_name": None}
