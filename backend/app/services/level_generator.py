"""Generates AI levels from a dataset's schema profile, then validates every
level by actually executing its reference_sql against the real DuckDB dataset.
Levels that error or return zero rows are discarded and regenerated (max 3
attempts) rather than ever being shown to a user.
"""

from __future__ import annotations

import hashlib
import json

import duckdb
from pydantic import BaseModel, Field

from app.services.gemini_client import generate_structured
from app.services.sql_safety import UnsafeQueryError, assert_select_only

MIN_LEVELS = 15
MAX_LEVELS = 20
MAX_REGENERATE_ATTEMPTS = 3

DIFFICULTY_PROGRESSION = (
    "1. bronze: basic SELECT / WHERE / ORDER BY / LIMIT\n"
    "2. silver: aggregates, GROUP BY, HAVING\n"
    "3. gold: multi-table JOINs (only if the schema has relationships)\n"
    "4. gold/platinum: subqueries and CTEs\n"
    "5. platinum: window functions\n"
    "6. platinum: query optimization challenges — given an intentionally "
    "inefficient query, ask the user to rewrite it"
)

SYSTEM_INSTRUCTION = (
    "You are a SQL curriculum designer. You generate SQL practice levels for a "
    "specific real dataset. Every reference_sql you write MUST be valid DuckDB "
    "SQL that references only the tables/columns given to you, and MUST return "
    "at least one row against the real data described. Never invent tables, "
    "columns, or values that are not in the provided schema."
)


class LevelDraft(BaseModel):
    level_number: int
    difficulty: str = Field(description="one of: bronze, silver, gold, platinum")
    concept_tags: list[str]
    question_text: str
    reference_sql: str
    hint_progression: list[str] = Field(description="2-3 hints, gentle to near-answer, never the full solution")


class LevelsBatch(BaseModel):
    levels: list[LevelDraft]


def _format_schema_for_prompt(schema_profile: dict) -> str:
    lines = []
    for table in schema_profile.get("tables", []):
        lines.append(f"\nTable: {table['name']} ({table['row_count']} rows)")
        for col in table["columns"]:
            lines.append(f"  - {col['name']}: {col['dtype']} (nulls={col['null_count']}, distinct={col['cardinality']})")
        lines.append(f"  Sample rows: {json.dumps(table['sample_rows'], default=str)}")

    relationships = schema_profile.get("relationships", [])
    if relationships:
        lines.append("\nDetected relationships:")
        for rel in relationships:
            lines.append(
                f"  - {rel['left_table']}.{rel['column']} <-> {rel['right_table']}.{rel['column']} "
                f"(overlap {rel['overlap_ratio']})"
            )

    return "\n".join(lines)


def _build_batch_prompt(schema_profile: dict) -> str:
    schema_text = _format_schema_for_prompt(schema_profile)
    return f"""Generate {MIN_LEVELS}-{MAX_LEVELS} SQL practice levels for the dataset below.

{schema_text}

Difficulty should progress roughly as:
{DIFFICULTY_PROGRESSION}

Only include JOIN-based levels if the schema shows a real relationship between tables.
Number levels sequentially starting at 1. Each level needs: level_number, difficulty
(bronze|silver|gold|platinum), concept_tags (e.g. ["WHERE", "ORDER BY"]), question_text
(a clear, specific question a learner should answer with one SQL query), reference_sql
(the correct DuckDB SQL answer), and hint_progression (2-3 hints from gentle nudge to
near-answer, never revealing the full query)."""


def _build_regenerate_prompt(schema_profile: dict, failed_draft: LevelDraft, failure_reason: str) -> str:
    schema_text = _format_schema_for_prompt(schema_profile)
    return f"""The following SQL level you generated was invalid: {failure_reason}

Failed level:
{failed_draft.model_dump_json(indent=2)}

Regenerate ONLY this one level (same level_number and difficulty and similar concept)
against this exact schema, fixing the problem. The reference_sql MUST be valid DuckDB
SQL that actually returns rows against this real data.

{schema_text}"""


def _hash_result_set(rows: list[tuple], columns: list[str]) -> str:
    """Order-insensitive, column-rename-tolerant hash: sorts rows by their
    stringified values (not column names) so shape/content is what's compared.
    """
    normalized = sorted(tuple(str(v) for v in row) for row in rows)
    payload = json.dumps(normalized)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _validate_draft(con: duckdb.DuckDBPyConnection, draft: LevelDraft) -> tuple[str | None, str | None]:
    """Returns (reference_result_hash, None) on success, or (None, failure_reason) on failure."""
    try:
        assert_select_only(draft.reference_sql)
    except UnsafeQueryError as e:
        return None, f"unsafe query: {e}"

    try:
        cursor = con.execute(draft.reference_sql)
        rows = cursor.fetchall()
        columns = [d[0] for d in cursor.description]
    except Exception as e:
        return None, f"execution error: {e}"

    if len(rows) == 0:
        return None, "query returned zero rows"

    return _hash_result_set(rows, columns), None


def generate_and_validate_levels(con: duckdb.DuckDBPyConnection, schema_profile: dict) -> list[dict]:
    """Generates a batch of levels via Gemini, validates each by real DuckDB
    execution, and regenerates (up to MAX_REGENERATE_ATTEMPTS) any that fail
    rather than discarding them outright. Returns only validated levels, each
    augmented with a `reference_result_hash` and `is_boss` flag.
    """
    batch = generate_structured(
        _build_batch_prompt(schema_profile),
        response_schema=LevelsBatch,
        system_instruction=SYSTEM_INSTRUCTION,
    )

    validated: list[dict] = []

    for draft in batch.levels:
        current = draft
        result_hash = None
        failure_reason = None

        for attempt in range(MAX_REGENERATE_ATTEMPTS):
            result_hash, failure_reason = _validate_draft(con, current)
            if result_hash is not None:
                break

            if attempt == MAX_REGENERATE_ATTEMPTS - 1:
                break

            try:
                current = generate_structured(
                    _build_regenerate_prompt(schema_profile, current, failure_reason),
                    response_schema=LevelDraft,
                    system_instruction=SYSTEM_INSTRUCTION,
                )
            except Exception:
                break

        if result_hash is None:
            continue

        validated.append(
            {
                "level_number": current.level_number,
                "difficulty": current.difficulty,
                "concept_tags": current.concept_tags,
                "question_text": current.question_text,
                "reference_sql": current.reference_sql,
                "hint_progression": current.hint_progression,
                "reference_result_hash": result_hash,
                "is_boss": current.level_number % 5 == 0,
            }
        )

    validated.sort(key=lambda lvl: lvl["level_number"])
    return validated
