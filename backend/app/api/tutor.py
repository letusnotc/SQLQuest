import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.attempt import Attempt
from app.models.dataset import Dataset
from app.models.level import Level
from app.models.user import User
from app.services.gemini_client import stream_text
from app.services.tutor import SYSTEM_INSTRUCTION, build_prompt

router = APIRouter(tags=["tutor"])


class TutorRequest(BaseModel):
    mode: str = "nudge"  # nudge | teach | explain
    message: str | None = None


@router.post("/levels/{level_id}/tutor")
def tutor(
    level_id: uuid.UUID,
    payload: TutorRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    level = db.get(Level, level_id)
    if not level or level.dataset.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Level not found")

    dataset = db.get(Dataset, level.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    recent = (
        db.query(Attempt)
        .filter(Attempt.level_id == level_id, Attempt.user_id == current_user.id)
        .order_by(Attempt.created_at.desc())
        .first()
    )
    recent_query = recent.query_text if recent else None

    # Build the full prompt now, while the DB session is open. The generator that
    # streams the response runs after this function returns, so it must not touch
    # the DB or the ORM objects.
    prompt = build_prompt(
        mode=payload.mode,
        question_text=level.question_text,
        concept_tags=list(level.concept_tags or []),
        schema_profile=dataset.schema_profile,
        hint_progression=list(level.hint_progression or []),
        recent_query=recent_query,
        user_message=payload.message,
    )

    def generate():
        try:
            for token in stream_text(prompt, system_instruction=SYSTEM_INSTRUCTION):
                yield token
        except Exception:
            yield "\n\n(Sage lost their train of thought — please try again.)"

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")
