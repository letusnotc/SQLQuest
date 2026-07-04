"""Whitelists SELECT-only SQL before it ever reaches DuckDB.

Rejects anything containing DROP, DELETE, ALTER, INSERT, UPDATE, ATTACH, COPY,
PRAGMA, CREATE, or multiple stacked statements. Only a single SELECT
(optionally with CTEs) is allowed.
"""

from __future__ import annotations

import sqlglot
from sqlglot import exp

FORBIDDEN_EXPRESSION_TYPES = (
    exp.Drop,
    exp.Delete,
    exp.Alter,
    exp.Insert,
    exp.Update,
    exp.Attach,
    exp.Copy,
    exp.Pragma,
    exp.Create,
)


class UnsafeQueryError(ValueError):
    pass


def assert_select_only(sql: str, dialect: str = "duckdb") -> exp.Expression:
    """Parses and validates that `sql` is a single SELECT (optionally with CTEs).

    Returns the parsed expression on success; raises UnsafeQueryError otherwise.
    """
    try:
        statements = sqlglot.parse(sql, read=dialect)
    except Exception as e:
        raise UnsafeQueryError(f"Could not parse SQL: {e}") from e

    statements = [s for s in statements if s is not None]

    if len(statements) == 0:
        raise UnsafeQueryError("No SQL statement found")
    if len(statements) > 1:
        raise UnsafeQueryError("Only a single SQL statement is allowed")

    statement = statements[0]

    # Unwrap CTEs to check the underlying statement type
    root = statement
    if isinstance(root, exp.With):
        root = root.this

    if not isinstance(root, exp.Select):
        raise UnsafeQueryError("Only SELECT statements are allowed")

    for node in statement.walk():
        if isinstance(node, FORBIDDEN_EXPRESSION_TYPES):
            raise UnsafeQueryError(f"Statement contains a forbidden operation: {type(node).__name__}")

    return statement
