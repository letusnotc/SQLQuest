"""Badge definitions and awarding. Badges are defined in code; earned badges are
rows in user_badges. Awarding is idempotent (unique on user_id+badge_key).
"""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.attempt import Attempt
from app.models.badge import UserBadge
from app.models.level import Level
from app.models.user import User

# key -> (name, description, icon)
BADGES: dict[str, dict[str, str]] = {
    "first_solve": {"name": "First Steps", "description": "Solve your very first level.", "icon": "🌱"},
    "speed_demon": {"name": "Speed Demon", "description": "Beat the reference query's runtime.", "icon": "⚡"},
    "boss_slayer": {"name": "Boss Slayer", "description": "Defeat a boss level.", "icon": "🦇"},
    "join_master": {"name": "Join Master", "description": "Solve a JOIN level.", "icon": "🔗"},
    "window_wizard": {"name": "Window Wizard", "description": "Solve a window-function level.", "icon": "🪟"},
    "subquery_sleuth": {"name": "Subquery Sleuth", "description": "Solve a subquery or CTE level.", "icon": "🕵️"},
    "aggregator": {"name": "Aggregator", "description": "Solve a GROUP BY / aggregate level.", "icon": "📊"},
    "gold_digger": {"name": "Gold Digger", "description": "Solve a Gold-tier level.", "icon": "🥇"},
    "platinum_pro": {"name": "Platinum Pro", "description": "Solve a Platinum-tier level.", "icon": "💎"},
    "on_fire": {"name": "On Fire", "description": "Reach a 3-day streak.", "icon": "🔥"},
    "clean_query": {"name": "Clean Query", "description": "Write an already-optimal query.", "icon": "✨"},
}


def _tag_match(tags: list[str], *needles: str) -> bool:
    joined = " ".join(tags).upper()
    return any(n.upper() in joined for n in needles)


def evaluate_submission_badges(
    db: Session,
    user: User,
    level: Level,
    passed: bool,
    runtime_ms: float | None,
    reference_runtime_ms: float | None,
) -> set[str]:
    """Returns the badge keys the user qualifies for from a just-committed passing
    submission (does not persist)."""
    if not passed:
        return set()

    keys: set[str] = set()
    tags = list(level.concept_tags or [])

    total_passed = (
        db.query(func.count(Attempt.id))
        .filter(Attempt.user_id == user.id, Attempt.passed.is_(True))
        .scalar()
    )
    if total_passed == 1:
        keys.add("first_solve")

    if runtime_ms is not None and reference_runtime_ms is not None and runtime_ms <= reference_runtime_ms:
        keys.add("speed_demon")

    if level.is_boss:
        keys.add("boss_slayer")
    if _tag_match(tags, "JOIN"):
        keys.add("join_master")
    if _tag_match(tags, "WINDOW"):
        keys.add("window_wizard")
    if _tag_match(tags, "SUBQUERY", "CTE"):
        keys.add("subquery_sleuth")
    if _tag_match(tags, "GROUP BY", "AGGREGATE"):
        keys.add("aggregator")
    if level.difficulty == "gold":
        keys.add("gold_digger")
    if level.difficulty == "platinum":
        keys.add("platinum_pro")
    if user.current_streak >= 3:
        keys.add("on_fire")

    return keys


def award_badges(db: Session, user: User, keys: set[str]) -> list[str]:
    """Persists any keys the user hasn't earned yet. Returns the newly-awarded keys."""
    if not keys:
        return []

    existing = {
        row.badge_key
        for row in db.query(UserBadge.badge_key).filter(
            UserBadge.user_id == user.id, UserBadge.badge_key.in_(keys)
        )
    }
    new_keys = [k for k in keys if k not in existing and k in BADGES]
    for key in new_keys:
        db.add(UserBadge(user_id=user.id, badge_key=key))
    if new_keys:
        db.commit()
    return new_keys
