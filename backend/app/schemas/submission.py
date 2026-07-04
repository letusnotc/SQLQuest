import uuid
from datetime import datetime

from pydantic import BaseModel


class SubmitRequest(BaseModel):
    user_query: str


class BadgeOut(BaseModel):
    key: str
    name: str
    description: str
    icon: str
    earned: bool = True


class SubmitResponse(BaseModel):
    attempt_id: uuid.UUID
    passed: bool
    runtime_ms: float | None
    reference_runtime_ms: float | None
    row_count: int | None
    error_message: str | None
    diff_message: str | None
    xp_awarded: int
    total_xp: int
    new_badges: list[BadgeOut] = []


class AttemptOut(BaseModel):
    id: uuid.UUID
    query_text: str
    passed: bool
    runtime_ms: float | None
    error_message: str | None
    row_count: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AnalysisOut(BaseModel):
    level_number: int
    difficulty: str
    question_text: str

    reference_sql: str
    reference_runtime_ms: float | None
    reference_plan: str | None

    user_query: str | None
    user_runtime_ms: float | None
    user_plan: str | None
    last_passed: bool | None

    attempts: list[AttemptOut]


class OptimizeResponse(BaseModel):
    verdict: str  # optimal | minor_improvement | significant_improvement
    explanation: str
    static_findings: list[str]
    rewritten_query: str | None
    user_runtime_ms: float | None
    rewritten_runtime_ms: float | None
    verified: bool
