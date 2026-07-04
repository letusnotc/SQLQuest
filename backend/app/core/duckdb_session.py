import os
from pathlib import Path

import duckdb

from app.core.config import get_settings

settings = get_settings()


def _dataset_path(dataset_id: str) -> Path:
    root = Path(settings.duckdb_storage_path)
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{dataset_id}.duckdb"


def get_connection(dataset_id: str, read_only: bool = False) -> duckdb.DuckDBPyConnection:
    """Open an isolated DuckDB connection scoped to a single dataset.

    Never pass a shared/global connection across datasets or users.
    """
    path = _dataset_path(dataset_id)
    return duckdb.connect(str(path), read_only=read_only)


def dataset_exists(dataset_id: str) -> bool:
    return _dataset_path(dataset_id).exists()


def delete_dataset(dataset_id: str) -> None:
    path = _dataset_path(dataset_id)
    if path.exists():
        os.remove(path)
