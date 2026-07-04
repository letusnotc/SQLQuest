import uuid
from datetime import datetime

from sqlalchemy import ARRAY, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Level(Base):
    __tablename__ = "levels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("datasets.id"), nullable=False)

    level_number: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty: Mapped[str] = mapped_column(String, nullable=False)  # bronze|silver|gold|platinum
    concept_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    reference_sql: Mapped[str] = mapped_column(Text, nullable=False)
    hint_progression: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    reference_result_hash: Mapped[str] = mapped_column(String, nullable=False)
    is_boss: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    dataset = relationship("Dataset", back_populates="levels")
    attempts = relationship("Attempt", back_populates="level", cascade="all, delete-orphan")
