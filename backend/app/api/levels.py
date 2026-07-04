import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.duckdb_session import get_connection
from app.db.session import get_db
from app.models.dataset import Dataset
from app.models.level import Level
from app.models.user import User
from app.schemas.level import LevelOut
from app.services.level_generator import generate_and_validate_levels

router = APIRouter(tags=["levels"])


@router.post(
    "/datasets/{dataset_id}/generate-levels",
    response_model=list[LevelOut],
    status_code=status.HTTP_201_CREATED,
)
def generate_levels(
    dataset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Level]:
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    existing_count = db.query(Level).filter(Level.dataset_id == dataset_id).count()
    if existing_count > 0:
        raise HTTPException(status_code=400, detail="Levels have already been generated for this dataset")

    con = get_connection(str(dataset_id), read_only=True)
    try:
        validated_levels = generate_and_validate_levels(con, dataset.schema_profile)
    finally:
        con.close()

    if not validated_levels:
        raise HTTPException(
            status_code=502,
            detail="Could not generate any valid levels for this dataset. Try again.",
        )

    level_rows = [Level(dataset_id=dataset_id, **level_data) for level_data in validated_levels]
    db.add_all(level_rows)
    db.commit()
    for level in level_rows:
        db.refresh(level)

    return level_rows


@router.get("/datasets/{dataset_id}/levels", response_model=list[LevelOut])
def list_levels(
    dataset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Level]:
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    return (
        db.query(Level)
        .filter(Level.dataset_id == dataset_id)
        .order_by(Level.level_number)
        .all()
    )
