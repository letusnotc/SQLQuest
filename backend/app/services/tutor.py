"""Builds context-aware prompts for the in-level AI tutor (Sage). Three modes:
  - nudge:   Socratic hints, never the full answer.
  - teach:   concept explanation with toy data, not the user's real answer.
  - explain: narrate the user's submitted SQL line by line.
"""

from __future__ import annotations

SYSTEM_INSTRUCTION = (
    "You are Sage, a warm, encouraging SQL tutor living inside a jungle-themed SQL game. "
    "Keep replies concise (a few short sentences) and friendly. Use plain text. When you show "
    "SQL, keep it minimal. Never be condescending."
)


def _schema_text(schema_profile: dict) -> str:
    lines = []
    for table in schema_profile.get("tables", []):
        cols = ", ".join(c["name"] for c in table["columns"])
        lines.append(f"- {table['name']}({cols})")
    return "\n".join(lines)


def build_prompt(
    mode: str,
    question_text: str,
    concept_tags: list[str],
    schema_profile: dict,
    hint_progression: list[str],
    recent_query: str | None,
    user_message: str | None,
) -> str:
    schema = _schema_text(schema_profile)
    tags = ", ".join(concept_tags) if concept_tags else "general SQL"

    if mode == "explain":
        query = recent_query or user_message or ""
        return f"""Explain, in plain English and step by step, exactly what this SQL query does. Go
clause by clause. Do not judge correctness — just describe what it computes.

Schema:
{schema}

Query:
{query}"""

    if mode == "teach":
        return f"""The learner is on a level about: {tags}.
Teach the concept(s) they need using a SMALL made-up toy example (invent tiny tables like
fruits(id, name, price)) — do NOT solve their actual task or reveal the answer to the level
question below. End by pointing them back at their task.

Level question (for context only, do not answer it): {question_text}

Learner's message: {user_message or "(they clicked Teach me)"}"""

    # default: nudge
    hints = "\n".join(f"- {h}" for h in hint_progression) if hint_progression else "(none provided)"
    return f"""Give ONE gentle Socratic nudge toward solving the task — a guiding question or a
pointer to the right clause/function. NEVER reveal the full solution query. Draw on the hint
ladder if useful, but keep it to a single nudge.

Level question: {question_text}
Concepts: {tags}
Schema:
{schema}
Hint ladder:
{hints}
The learner's most recent attempt: {recent_query or "(none yet)"}
Learner's message: {user_message or "(they clicked Nudge me)"}"""
