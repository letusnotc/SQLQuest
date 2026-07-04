"""Grounded query analysis: real DuckDB EXPLAIN plans and measured runtimes.
Every number shown on the Analysis page comes from actually running the query
here — never estimated.
"""

from __future__ import annotations

import statistics

from app.core.duckdb_session import get_connection
from app.services.query_runner import execute_with_timeout
from app.services.sql_safety import UnsafeQueryError, assert_select_only


def explain_query(dataset_id: str, sql: str) -> str | None:
    try:
        assert_select_only(sql)
    except UnsafeQueryError:
        return None

    con = get_connection(dataset_id, read_only=True)
    try:
        cursor = con.execute(f"EXPLAIN {sql}")
        rows = cursor.fetchall()
        # DuckDB EXPLAIN returns rows whose last column holds the plan text.
        return "\n".join(str(row[-1]) for row in rows) if rows else None
    except Exception:
        return None
    finally:
        con.close()


def time_query(dataset_id: str, sql: str, runs: int = 3) -> float | None:
    """Median runtime in ms over a few runs (reduces noise). None if the query
    is unsafe or fails to execute."""
    try:
        assert_select_only(sql)
    except UnsafeQueryError:
        return None

    times: list[float] = []
    for _ in range(runs):
        con = get_connection(dataset_id, read_only=True)
        try:
            result = execute_with_timeout(con, sql)
            times.append(result.runtime_ms)
        except Exception:
            return None
        finally:
            con.close()

    return round(statistics.median(times), 3) if times else None
