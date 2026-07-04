from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.attempt import Attempt
from app.models.badge import UserBadge
from app.models.dataset import Dataset
from app.models.level import Level
from app.models.user import User
from app.schemas.auth import ProfileOut, Token, UserCreate, UserLogin, UserOut
from app.schemas.submission import BadgeOut
from app.services.badges import BADGES

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> Token:
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return Token(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> Token:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return Token(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.get("/me/badges", response_model=list[BadgeOut])
def my_badges(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BadgeOut]:
    """All badge definitions with whether the current user has earned each."""
    earned = {
        row.badge_key for row in db.query(UserBadge.badge_key).filter(UserBadge.user_id == current_user.id)
    }
    return [BadgeOut(key=key, earned=key in earned, **meta) for key, meta in BADGES.items()]


@router.get("/me/profile", response_model=ProfileOut)
def my_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileOut:
    """Consolidated stats across every world/dataset the player owns."""
    uid = current_user.id

    total_attempts = db.query(func.count(Attempt.id)).filter(Attempt.user_id == uid).scalar() or 0
    passed_attempts = (
        db.query(func.count(Attempt.id)).filter(Attempt.user_id == uid, Attempt.passed.is_(True)).scalar() or 0
    )
    levels_solved = (
        db.query(func.count(distinct(Attempt.level_id)))
        .filter(Attempt.user_id == uid, Attempt.passed.is_(True))
        .scalar()
        or 0
    )
    worlds = db.query(func.count(Dataset.id)).filter(Dataset.owner_id == uid).scalar() or 0
    total_levels = (
        db.query(func.count(Level.id)).join(Dataset, Level.dataset_id == Dataset.id).filter(Dataset.owner_id == uid).scalar()
        or 0
    )
    badges_earned = db.query(func.count(UserBadge.id)).filter(UserBadge.user_id == uid).scalar() or 0

    avg_runtime = (
        db.query(func.avg(Attempt.runtime_ms))
        .filter(Attempt.user_id == uid, Attempt.passed.is_(True), Attempt.runtime_ms.isnot(None))
        .scalar()
    )
    best_runtime = (
        db.query(func.min(Attempt.runtime_ms))
        .filter(Attempt.user_id == uid, Attempt.passed.is_(True), Attempt.runtime_ms.isnot(None))
        .scalar()
    )

    diff_rows = (
        db.query(Level.difficulty, func.count(distinct(Attempt.level_id)))
        .join(Attempt, Attempt.level_id == Level.id)
        .filter(Attempt.user_id == uid, Attempt.passed.is_(True))
        .group_by(Level.difficulty)
        .all()
    )
    solved_by_difficulty = {difficulty: count for difficulty, count in diff_rows}

    return ProfileOut(
        display_name=current_user.display_name,
        email=current_user.email,
        created_at=current_user.created_at,
        xp=current_user.xp,
        hearts=current_user.hearts,
        current_streak=current_user.current_streak,
        worlds=worlds,
        total_levels=total_levels,
        levels_solved=levels_solved,
        total_attempts=total_attempts,
        passed_attempts=passed_attempts,
        accuracy=(passed_attempts / total_attempts) if total_attempts else 0.0,
        badges_earned=badges_earned,
        badges_total=len(BADGES),
        avg_runtime_ms=round(float(avg_runtime), 3) if avg_runtime is not None else None,
        best_runtime_ms=round(float(best_runtime), 3) if best_runtime is not None else None,
        solved_by_difficulty=solved_by_difficulty,
    )
