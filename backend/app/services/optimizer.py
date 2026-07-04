"""Optimization advice for an already-correct query.

Pipeline (spec section 7):
  1. Static rule pass (sql_rules, no LLM).
  2. Grounded execution — measure the user's real runtime, and if a rewrite is
     proposed, ACTUALLY run it and verify it returns the same result set before
     trusting its runtime. Every number here comes from real DuckDB execution.
  3. Gemini narration — explains *why*, proposes a rewrite, told to be honest
     when the query is already optimal.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from pydantic import BaseModel, Field

from app.services import sql_rules
from app.services.analysis import explain_query, time_query
from app.services.gemini_client import generate_structured
from app.services.grading import _run_safely, compare_result_sets

SIGNIFICANT_RATIO = 0.7
MINOR_RATIO = 0.9

SYSTEM_INSTRUCTION = (
    "You are a SQL performance expert. You explain in plain English why a query is or isn't "
    "efficient for a given schema, and propose a faster rewrite when one genuinely exists. "
    "If the query is already optimal given this schema, say so plainly and set already_optimal "
    "to true — do NOT invent an optimization that isn't real. You never assert runtime numbers; "
    "those are measured separately."
)


class OptimizationNarration(BaseModel):
    explanation: str = Field(description="Plain-English reason the query is or isn't efficient")
    rewritten_query: str | None = Field(description="A faster, equivalent DuckDB SELECT, or null if already optimal")
    already_optimal: bool


@dataclass
class OptimizeResult:
    verdict: str  # optimal | minor_improvement | significant_improvement
    explanation: str
    static_findings: list[str]
    rewritten_query: str | None
    user_runtime_ms: float | None
    rewritten_runtime_ms: float | None
    verified: bool


def _schema_text(schema_profile: dict) -> str:
    lines = []
    for table in schema_profile.get("tables", []):
        cols = ", ".join(f"{c['name']} {c['dtype']}" for c in table["columns"])
        lines.append(f"{table['name']}({cols}) — {table['row_count']} rows")
    return "\n".join(lines)


def _build_prompt(schema_profile: dict, user_query: str, plan: str | None, findings: list[str]) -> str:
    return f"""Schema:
{_schema_text(schema_profile)}

The user's (correct) query:
{user_query}

DuckDB EXPLAIN plan:
{plan or "(unavailable)"}

Static analysis findings:
{json.dumps(findings) if findings else "(none)"}

Explain whether this query is efficient for this schema. If a genuinely faster, equivalent
rewrite exists, provide it in rewritten_query (valid DuckDB SQL, single SELECT, same result set).
If it's already optimal, set already_optimal=true and rewritten_query=null."""


def _results_match(dataset_id: str, sql_a: str, sql_b: str) -> bool:
    res_a, err_a = _run_safely(dataset_id, sql_a)
    res_b, err_b = _run_safely(dataset_id, sql_b)
    if err_a or err_b or res_a is None or res_b is None:
        return False
    passed, _ = compare_result_sets(res_a.rows, res_a.columns, res_b.rows, res_b.columns)
    return passed


def optimize(dataset_id: str, schema_profile: dict, user_query: str) -> OptimizeResult:
    findings = sql_rules.analyze(user_query)
    user_runtime = time_query(dataset_id, user_query)
    plan = explain_query(dataset_id, user_query)

    narration = generate_structured(
        _build_prompt(schema_profile, user_query, plan, findings),
        response_schema=OptimizationNarration,
        system_instruction=SYSTEM_INSTRUCTION,
    )

    rewritten = (narration.rewritten_query or "").strip() or None
    verified = False
    rewritten_runtime: float | None = None

    if rewritten and rewritten.rstrip(";") != user_query.rstrip(";"):
        # Only trust a rewrite that actually runs AND returns the same rows.
        if _results_match(dataset_id, user_query, rewritten):
            verified = True
            rewritten_runtime = time_query(dataset_id, rewritten)

    verdict = "optimal"
    if verified and rewritten_runtime is not None and user_runtime is not None and user_runtime > 0:
        ratio = rewritten_runtime / user_runtime
        if ratio < SIGNIFICANT_RATIO:
            verdict = "significant_improvement"
        elif ratio < MINOR_RATIO:
            verdict = "minor_improvement"
        else:
            verdict = "optimal"

    # If the rewrite isn't a verified improvement, don't present a runtime for it.
    if verdict == "optimal":
        rewritten_runtime = None
        if verified:
            # verified-but-not-faster: nothing better to show
            rewritten = None if not findings else rewritten

    return OptimizeResult(
        verdict=verdict,
        explanation=narration.explanation,
        static_findings=findings,
        rewritten_query=rewritten,
        user_runtime_ms=user_runtime,
        rewritten_runtime_ms=rewritten_runtime,
        verified=verified,
    )
