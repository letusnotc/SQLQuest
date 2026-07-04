"""Grades a user's submitted SQL against a level's reference SQL.

Pipeline: static safety check -> execute user query (timeout + row cap) ->
execute reference query -> compare result sets order-insensitively and
column-rename-tolerantly (by value shape, not exact column labels).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.duckdb_session import get_connection
from app.services.query_runner import (
    QueryExecutionError,
    QueryResult,
    QueryTimeoutError,
    QueryTooLargeError,
    execute_with_timeout,
)
from app.services.sql_safety import UnsafeQueryError, assert_select_only


@dataclass
class GradingResult:
    passed: bool
    runtime_ms: float | None
    reference_runtime_ms: float | None
    row_count: int | None
    error_message: str | None
    diff_message: str | None


def _run_safely(dataset_id: str, sql: str) -> tuple[QueryResult | None, str | None]:
    """Returns (result, None) on success or (None, error_message) on failure.
    Never raises — timeouts, execution errors, and oversized results are all
    surfaced as a graded failure rather than an exception.
    """
    con = get_connection(dataset_id, read_only=True)
    try:
        result = execute_with_timeout(con, sql)
        return result, None
    except QueryTimeoutError as e:
        return None, str(e)
    except QueryTooLargeError as e:
        return None, str(e)
    except QueryExecutionError as e:
        return None, str(e)
    finally:
        con.close()


def compare_result_sets(
    user_rows: list[tuple],
    user_columns: list[str],
    ref_rows: list[tuple],
    ref_columns: list[str],
) -> tuple[bool, str | None]:
    """Order-insensitive, column-rename-tolerant comparison: compares by
    value shape (sorted stringified row tuples), not exact column labels.
    """
    if len(user_columns) != len(ref_columns):
        return False, (
            f"Your query returned {len(user_columns)} column(s); expected {len(ref_columns)}."
        )

    def normalize(rows: list[tuple]) -> list[tuple]:
        return sorted(tuple(str(v) for v in row) for row in rows)

    user_norm = normalize(user_rows)
    ref_norm = normalize(ref_rows)

    if user_norm == ref_norm:
        return True, None

    row_diff = len(user_rows) - len(ref_rows)
    if row_diff > 0:
        return False, f"Your result has {row_diff} more row(s) than expected — check your JOIN type or filters."
    if row_diff < 0:
        return False, f"Your result has {-row_diff} fewer row(s) than expected — check your JOIN type or filters."
    return False, "Your result has the right number of rows, but different values — check your column selections and calculations."


def grade_submission(dataset_id: str, reference_sql: str, user_sql: str) -> GradingResult:
    try:
        assert_select_only(user_sql)
    except UnsafeQueryError as e:
        return GradingResult(
            passed=False,
            runtime_ms=None,
            reference_runtime_ms=None,
            row_count=None,
            error_message=str(e),
            diff_message=None,
        )

    user_result, user_error = _run_safely(dataset_id, user_sql)
    if user_error is not None:
        return GradingResult(
            passed=False,
            runtime_ms=None,
            reference_runtime_ms=None,
            row_count=None,
            error_message=user_error,
            diff_message=None,
        )

    ref_result, ref_error = _run_safely(dataset_id, reference_sql)
    if ref_error is not None:
        # The reference query was validated at level-generation time, so this
        # indicates a system/data integrity problem, not a user mistake.
        raise RuntimeError(f"Reference query failed to execute: {ref_error}")

    passed, diff_message = compare_result_sets(
        user_result.rows, user_result.columns, ref_result.rows, ref_result.columns
    )

    return GradingResult(
        passed=passed,
        runtime_ms=user_result.runtime_ms,
        reference_runtime_ms=ref_result.runtime_ms,
        row_count=user_result.row_count,
        error_message=None,
        diff_message=diff_message,
    )
