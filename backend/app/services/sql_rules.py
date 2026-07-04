"""Static SQL anti-pattern detection using sqlglot's parsed AST. No LLM, instant.
These findings feed both the optimization response and Gemini's narration prompt.
"""

from __future__ import annotations

import sqlglot
from sqlglot import exp


def _find_select_star(tree: exp.Expression) -> str | None:
    for select in tree.find_all(exp.Select):
        for projection in select.expressions:
            if isinstance(projection, exp.Star) or (
                isinstance(projection, exp.Column) and isinstance(projection.this, exp.Star)
            ):
                return "Uses SELECT * — selecting only the columns you need is clearer and avoids reading extra data."
    return None


def _find_function_in_where(tree: exp.Expression) -> str | None:
    for where in tree.find_all(exp.Where):
        for func in where.find_all(exp.Func):
            # In sqlglot, logical/comparison operators (AND, OR, =, >) also subclass
            # Func — those aren't the anti-pattern. Only flag real scalar function
            # calls (UPPER, DATE_TRUNC, SUBSTR, ...) that wrap a column.
            if isinstance(func, (exp.Binary, exp.Connector, exp.Paren)):
                continue
            if func.find(exp.Column) is not None:
                return (
                    "Applies a function to a column inside WHERE — this prevents the engine "
                    "from pruning rows efficiently. Filter on the raw column where possible."
                )
    return None


def _find_or_same_column(tree: exp.Expression) -> str | None:
    for or_expr in tree.find_all(exp.Or):
        columns: list[str] = []
        for eq in or_expr.find_all(exp.EQ):
            col = eq.find(exp.Column)
            if col is not None:
                columns.append(col.sql())
        if len(columns) >= 2 and len(set(columns)) == 1:
            return (
                f"Multiple OR conditions on the same column ({columns[0]}) — an IN (...) list "
                "is usually clearer and lets the engine optimise it as a set membership test."
            )
    return None


def _find_distinct_with_join(tree: exp.Expression) -> str | None:
    for select in tree.find_all(exp.Select):
        if select.args.get("distinct") and select.find(exp.Join):
            return (
                "DISTINCT combined with a JOIN often hides row fan-out from a wrong join key "
                "rather than fixing it — check whether the JOIN is producing duplicate rows."
            )
    return None


def _find_correlated_subquery(tree: exp.Expression) -> str | None:
    for where in tree.find_all(exp.Where):
        if where.find(exp.Exists) or (where.find(exp.In) and where.find(exp.Subquery)):
            return (
                "Contains a subquery in WHERE (EXISTS/IN) — for many shapes this can be rewritten "
                "as a JOIN or window function, which the engine often executes more efficiently."
            )
    return None


def _find_repeated_subquery(tree: exp.Expression) -> str | None:
    seen: dict[str, int] = {}
    for sub in tree.find_all(exp.Subquery):
        key = sub.this.sql()
        seen[key] = seen.get(key, 0) + 1
    for key, count in seen.items():
        if count >= 2:
            return "The same subquery is computed more than once — factor it into a CTE (WITH) so it runs a single time."
    return None


_RULES = (
    _find_select_star,
    _find_function_in_where,
    _find_or_same_column,
    _find_distinct_with_join,
    _find_correlated_subquery,
    _find_repeated_subquery,
)


def analyze(sql: str, dialect: str = "duckdb") -> list[str]:
    """Returns a list of human-readable anti-pattern findings (possibly empty)."""
    try:
        tree = sqlglot.parse_one(sql, read=dialect)
    except Exception:
        return []
    if tree is None:
        return []

    findings: list[str] = []
    for rule in _RULES:
        try:
            result = rule(tree)
        except Exception:
            result = None
        if result:
            findings.append(result)
    return findings
