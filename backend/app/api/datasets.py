import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.duckdb_session import get_connection
from app.db.session import get_db
from app.models.dataset import Dataset
from app.models.user import User
from app.schemas.dataset import DatasetOut
from app.services.ingestion import load_tables_into_duckdb, parse_uploaded_files
from app.services.schema_profiler import build_schema_profile

router = APIRouter(prefix="/datasets", tags=["datasets"])

ALLOWED_EXTENSIONS = (".csv", ".xlsx", ".xls")


@router.post("/upload", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    files: list[UploadFile],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dataset:
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    for f in files:
        if not f.filename or not f.filename.lower().endswith(ALLOWED_EXTENSIONS):
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {f.filename}")

    raw_files = [(f.filename, await f.read()) for f in files]

    try:
        tables = parse_uploaded_files(raw_files)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if not tables:
        raise HTTPException(status_code=400, detail="No tables could be parsed from the uploaded files")

    schema_profile = build_schema_profile(tables)

    dataset_id = uuid.uuid4()
    con = get_connection(str(dataset_id))
    try:
        load_tables_into_duckdb(con, tables)
    finally:
        con.close()

    dataset_name = files[0].filename.rsplit(".", 1)[0] if len(files) == 1 else f"Dataset ({len(files)} files)"

    dataset = Dataset(
        id=dataset_id,
        owner_id=current_user.id,
        name=dataset_name,
        schema_profile=schema_profile,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    return dataset


@router.get("/{dataset_id}", response_model=DatasetOut)
def get_dataset(
    dataset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dataset:
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@router.get("", response_model=list[DatasetOut])
def list_datasets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Dataset]:
    return db.query(Dataset).filter(Dataset.owner_id == current_user.id).order_by(Dataset.created_at.desc()).all()


PREVIEW_ROW_LIMIT = 10


@router.get("/{dataset_id}/preview")
def preview_dataset(
    dataset_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Returns the first N rows and full column list of every table in the
    dataset, for the data-preview panel on the level page."""
    dataset = db.get(Dataset, dataset_id)
    if not dataset or dataset.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    table_names = [t["name"] for t in dataset.schema_profile.get("tables", [])]

    con = get_connection(str(dataset_id), read_only=True)
    tables = []
    try:
        for name in table_names:
            cursor = con.execute(f'SELECT * FROM "{name}" LIMIT {PREVIEW_ROW_LIMIT}')
            rows = cursor.fetchall()
            columns = [d[0] for d in cursor.description]
            tables.append(
                {
                    "name": name,
                    "columns": columns,
                    "rows": [[None if v is None else str(v) for v in row] for row in rows],
                }
            )
    finally:
        con.close()

    return {"tables": tables}
