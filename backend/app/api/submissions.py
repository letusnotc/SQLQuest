import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.attempt import Attempt
from app.models.level import Level
from app.models.user import User
from app.models.dataset import Dataset
from app.schemas.submission import (
    AnalysisOut,
    AttemptOut,
    BadgeOut,
    OptimizeResponse,
    SubmitRequest,
    SubmitResponse,
)
from app.services.analysis import explain_query, time_query
from app.services.badges import BADGES, award_badges, evaluate_submission_badges
from app.services.grading import grade_submission
from app.services.optimizer import optimize as run_optimize

router = APIRouter(tags=["submissions"])

DIFFICULTY_BASE_XP = {"bronze": 10, "silver": 20, "gold": 30, "platinum": 40}
SPEED_BONUS_XP = 5
FIRST_TRY_BONUS_XP = 5


def _get_owned_level(level_id: uuid.UUID, current_user: User, db: Session) -> Level:
    level = db.get(Level, level_id)
    if not level or level.dataset.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Level not found")
    return level


def _is_unlocked(level: Level, current_user: User, db: Session) -> bool:
    """A level is playable only once the immediately-previous level (by number,
    in the same dataset) has a passing attempt by this user. Level 1 is always open."""
    if level.level_number <= 1:
        return True
    prev = (
        db.query(Level)
        .filter(Level.dataset_id == level.dataset_id, Level.level_number == level.level_number - 1)
        .first()
    )
    if prev is None:
        return True
    passed = (
        db.query(Attempt)
        .filter(
            Attempt.level_id == prev.id,
            Attempt.user_id == current_user.id,
            Attempt.passed.is_(True),
        )
        .first()
    )
    return passed is not None


@router.post("/levels/{level_id}/submit", response_model=SubmitResponse)
def submit_query(
    level_id: uuid.UUID,
    payload: SubmitRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubmitResponse:
    level = _get_owned_level(level_id, current_user, db)

    if not _is_unlocked(level, current_user, db):
        raise HTTPException(
            status_code=403,
            detail=f"Locked — complete level {level.level_number - 1} first.",
        )

    prior_attempts = db.query(Attempt).filter(
        Attempt.level_id == level_id, Attempt.user_id == current_user.id
    )
    attempt_count_before = prior_attempts.count()
    already_passed_before = prior_attempts.filter(Attempt.passed.is_(True)).first() is not None

    result = grade_submission(str(level.dataset_id), level.reference_sql, payload.user_query)

    attempt = Attempt(
        user_id=current_user.id,
        level_id=level_id,
        query_text=payload.user_query,
        passed=result.passed,
        runtime_ms=result.runtime_ms,
        error_message=result.error_message,
        row_count=result.row_count,
    )
    db.add(attempt)

    xp_awarded = 0
    if result.passed and not already_passed_before:
        xp_awarded = DIFFICULTY_BASE_XP.get(level.difficulty, 10)
        if attempt_count_before == 0:
            xp_awarded += FIRST_TRY_BONUS_XP
        if (
            result.runtime_ms is not None
            and result.reference_runtime_ms is not None
            and result.runtime_ms <= result.reference_runtime_ms * 2
        ):
            xp_awarded += SPEED_BONUS_XP
        current_user.xp += xp_awarded

    db.commit()
    db.refresh(attempt)
    db.refresh(current_user)

    earned_keys = evaluate_submission_badges(
        db, current_user, level, result.passed, result.runtime_ms, result.reference_runtime_ms
    )
    new_keys = award_badges(db, current_user, earned_keys)
    new_badges = [BadgeOut(key=k, **BADGES[k]) for k in new_keys]

    return SubmitResponse(
        attempt_id=attempt.id,
        passed=result.passed,
        runtime_ms=result.runtime_ms,
        reference_runtime_ms=result.reference_runtime_ms,
        row_count=result.row_count,
        error_message=result.error_message,
        diff_message=result.diff_message,
        xp_awarded=xp_awarded,
        total_xp=current_user.xp,
        new_badges=new_badges,
    )


@router.get("/levels/{level_id}/attempts", response_model=list[AttemptOut])
def list_attempts(
    level_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Attempt]:
    _get_owned_level(level_id, current_user, db)

    return (
        db.query(Attempt)
        .filter(Attempt.level_id == level_id, Attempt.user_id == current_user.id)
        .order_by(Attempt.created_at.desc())
        .all()
    )


@router.get("/levels/{level_id}/analysis", response_model=AnalysisOut)
def get_analysis(
    level_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalysisOut:
    level = _get_owned_level(level_id, current_user, db)
    if not _is_unlocked(level, current_user, db):
        raise HTTPException(status_code=403, detail=f"Locked — complete level {level.level_number - 1} first.")
    dataset_id = str(level.dataset_id)

    attempts = (
        db.query(Attempt)
        .filter(Attempt.level_id == level_id, Attempt.user_id == current_user.id)
        .order_by(Attempt.created_at.desc())
        .all()
    )
    last_attempt = attempts[0] if attempts else None

    user_query = last_attempt.query_text if last_attempt else None
    user_plan = explain_query(dataset_id, user_query) if user_query else None
    # Re-measure the user's query now (grounded), falling back to the stored time.
    user_runtime = time_query(dataset_id, user_query) if user_query else None
    if user_runtime is None and last_attempt is not None:
        user_runtime = last_attempt.runtime_ms

    return AnalysisOut(
        level_number=level.level_number,
        difficulty=level.difficulty,
        question_text=level.question_text,
        reference_sql=level.reference_sql,
        reference_runtime_ms=time_query(dataset_id, level.reference_sql),
        reference_plan=explain_query(dataset_id, level.reference_sql),
        user_query=user_query,
        user_runtime_ms=user_runtime,
        user_plan=user_plan,
        last_passed=last_attempt.passed if last_attempt else None,
        attempts=[AttemptOut.model_validate(a) for a in attempts],
    )


@router.post("/levels/{level_id}/optimize", response_model=OptimizeResponse)
def optimize_query(
    level_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OptimizeResponse:
    level = _get_owned_level(level_id, current_user, db)

    # Optimization advice only makes sense once the level is solved correctly.
    passing = (
        db.query(Attempt)
        .filter(
            Attempt.level_id == level_id,
            Attempt.user_id == current_user.id,
            Attempt.passed.is_(True),
        )
        .order_by(Attempt.created_at.desc())
        .first()
    )
    if passing is None:
        raise HTTPException(status_code=400, detail="Solve this level correctly before optimizing.")

    dataset = db.get(Dataset, level.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")

    result = run_optimize(str(level.dataset_id), dataset.schema_profile, passing.query_text)

    # A verified-optimal query earns the Clean Query badge.
    if result.verdict == "optimal":
        award_badges(db, current_user, {"clean_query"})

    return OptimizeResponse(
        verdict=result.verdict,
        explanation=result.explanation,
        static_findings=result.static_findings,
        rewritten_query=result.rewritten_query,
        user_runtime_ms=result.user_runtime_ms,
        rewritten_runtime_ms=result.rewritten_runtime_ms,
        verified=result.verified,
    )
