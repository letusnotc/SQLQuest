import uuid
from datetime import datetime

from pydantic import BaseModel


class DatasetOut(BaseModel):
    id: uuid.UUID
    name: str
    schema_profile: dict
    created_at: datetime

    model_config = {"from_attributes": True}
