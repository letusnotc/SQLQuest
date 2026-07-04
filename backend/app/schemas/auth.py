import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str
    xp: int
    hearts: int
    current_streak: int

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProfileOut(BaseModel):
    display_name: str
    email: EmailStr
    created_at: datetime

    xp: int
    hearts: int
    current_streak: int

    worlds: int
    total_levels: int
    levels_solved: int

    total_attempts: int
    passed_attempts: int
    accuracy: float  # 0..1

    badges_earned: int
    badges_total: int

    avg_runtime_ms: float | None
    best_runtime_ms: float | None

    solved_by_difficulty: dict[str, int]
