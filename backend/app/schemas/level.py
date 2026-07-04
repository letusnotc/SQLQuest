import uuid
from datetime import datetime

from pydantic import BaseModel


class LevelOut(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    level_number: int
    difficulty: str
    concept_tags: list[str]
    question_text: str
    hint_progression: list[str]
    is_boss: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class LevelWithReferenceOut(LevelOut):
    """Includes the reference SQL — only ever returned to the owning user
    for their own dataset, never exposed as part of the public level list."""

    reference_sql: str
