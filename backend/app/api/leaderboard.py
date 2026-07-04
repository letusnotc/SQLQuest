import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.attempt import Attempt
from app.models.dataset import Dataset
from app.models.level import Level
from app.models.user import User

router = APIRouter(tags=["leaderboard"])

TOP_N = 50


@router.get("/leaderboard")
def global_leaderboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Ranks all players by total XP."""
    users = db.query(User).order_by(User.xp.desc(), User.created_at.asc()).limit(TOP_N).all()
    entries = [
        {
            "rank": i + 1,
            "display_name": u.display_name,
            "xp": u.xp,
            "current_streak": u.current_streak,
            "is_me": u.id == current_user.id,
        }
        for i, u in enumerate(users)
    ]
    my_rank = db.query(func.count(User.id)).filter(User.xp > current_user.xp).scalar() + 1
    return {"entries": entries, "my_rank": my_rank, "my_xp": current_user.xp}


@router.get("/datasets/{dataset_id}/progress")
def world_progress(
    dataset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """The current player's progress through one world: which levels are solved
    and their best measured runtime on each."""
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    levels = (
        db.query(Level).filter(Level.dataset_id == dataset_id).order_by(Level.level_number).all()
    )

    rows = []
    solved = 0
    for level in levels:
        attempts = (
            db.query(Attempt)
            .filter(Attempt.level_id == level.id, Attempt.user_id == current_user.id)
            .all()
        )
        passed = [a for a in attempts if a.passed]
        is_solved = len(passed) > 0
        if is_solved:
            solved += 1
        best_runtime = min((a.runtime_ms for a in passed if a.runtime_ms is not None), default=None)
        rows.append(
            {
                "level_id": str(level.id),
                "level_number": level.level_number,
                "difficulty": level.difficulty,
                "is_boss": level.is_boss,
                "attempts": len(attempts),
                "passed": is_solved,
                "best_runtime_ms": best_runtime,
            }
        )

    return {
        "dataset_name": dataset.name,
        "total_levels": len(levels),
        "solved_levels": solved,
        "levels": rows,
    }
