"""Executes SQL against a DuckDB connection with a hard timeout and a row cap,
so a single query can never hang or exhaust memory. This is the only place
user SQL is ever actually run.
"""

from __future__ import annotations

import threading
import time

import duckdb

QUERY_TIMEOUT_SECONDS = 5.0
MAX_RESULT_ROWS = 10_000


class QueryTimeoutError(Exception):
    pass


class QueryExecutionError(Exception):
    pass


class QueryTooLargeError(Exception):
    pass


class QueryResult:
    def __init__(self, rows: list[tuple], columns: list[str], runtime_ms: float):
        self.rows = rows
        self.columns = columns
        self.runtime_ms = runtime_ms
        self.row_count = len(rows)


def execute_with_timeout(
    con: duckdb.DuckDBPyConnection,
    sql: str,
    timeout_seconds: float = QUERY_TIMEOUT_SECONDS,
    max_rows: int = MAX_RESULT_ROWS,
) -> QueryResult:
    outcome: dict = {}

    def target() -> None:
        try:
            start = time.perf_counter()
            cursor = con.execute(sql)
            rows = cursor.fetchall()
            columns = [d[0] for d in cursor.description]
            outcome["runtime_ms"] = (time.perf_counter() - start) * 1000
            outcome["rows"] = rows
            outcome["columns"] = columns
        except Exception as e:  # noqa: BLE001 - surfaced to caller as QueryExecutionError
            outcome["error"] = str(e)

    thread = threading.Thread(target=target, daemon=True)
    thread.start()
    thread.join(timeout_seconds)

    if thread.is_alive():
        con.interrupt()
        thread.join(2.0)
        raise QueryTimeoutError(f"Query exceeded the {timeout_seconds:.0f}s timeout")

    if "error" in outcome:
        raise QueryExecutionError(outcome["error"])

    if len(outcome["rows"]) > max_rows:
        raise QueryTooLargeError(f"Query returned more than {max_rows} rows")

    return QueryResult(outcome["rows"], outcome["columns"], outcome["runtime_ms"])
