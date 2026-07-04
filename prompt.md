# Project: SQLQuest — AI-Gamified SQL Tutoring Platform

Build a full-stack web application that turns any user-uploaded dataset (CSV/Excel files) into a gamified SQL learning experience. Users progress through AI-generated levels of increasing difficulty, writing real SQL queries against their own data, get graded, see performance analysis, and get AI tutoring — including optimization advice on already-correct queries.

---

## 1. Tech Stack

- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, Framer Motion for animations, Monaco Editor for the SQL input.
- **Backend:** FastAPI (Python), dependency/env management via `uv` (not pip/poetry).
- **Query engine (sandboxed analytics DB):** DuckDB — one isolated in-memory or per-session file connection per user session. This is what user SQL actually runs against.
- **App state DB:** Postgres (users, XP, levels, progress, leaderboards, badges). Use SQLAlchemy + Alembic for migrations.
- **AI:** Google Generative AI / Google Gen AI SDK (Gemini), using structured JSON output (response schemas) wherever the output needs to be parsed reliably.
- **SQL parsing/static analysis:** `sqlglot`.
- **Auth:** simple email/password or OAuth (NextAuth on frontend, JWT validated by FastAPI).
- **Realtime (optional/stretch):** WebSockets via FastAPI for multiplayer duel mode.

---

## 2. Core Architecture Principles

1. **Never run arbitrary user SQL against a shared or persistent production database.** Every uploaded dataset is loaded into an isolated DuckDB context scoped to that user's session/dataset. No cross-user data access is possible even in theory.
2. **Whitelist SELECT-only statements.** Parse every submitted query with `sqlglot` before execution; reject anything containing `DROP`, `DELETE`, `ALTER`, `INSERT`, `UPDATE`, `ATTACH`, `COPY`, `PRAGMA`, `CREATE`, or multiple stacked statements. Only a single `SELECT` (optionally with CTEs) is allowed.
3. **Enforce a hard query timeout** (e.g. 5 seconds) and a row-return cap to prevent resource exhaustion.
4. **All AI-generated content must be grounded by actual execution.** Never show the user a claim about correctness, runtime, or optimization that wasn't verified by literally running the query in DuckDB and measuring it. The LLM narrates and explains; DuckDB is the source of truth for facts and numbers.

---

## 3. Data Upload & Ingestion Flow

- Endpoint: `POST /datasets/upload` — accepts multiple files (CSV and/or Excel, `.xlsx`/`.xls`).
- Parse each file with pandas; infer column types, null counts, cardinality, and (if multiple files are uploaded together) attempt to detect shared/foreign-key-like columns across files by name and value-overlap heuristics.
- Load all tables into a fresh DuckDB database scoped to a `dataset_id` (persisted to disk under a per-dataset path so sessions can resume).
- Store a `schema_profile` (JSON) in Postgres: table names, column names/types, sample rows (first 5), row counts, detected relationships.
- Return the `dataset_id` and schema profile to the frontend for display before level generation begins.

---

## 4. AI-Generated Levels

- Endpoint: `POST /datasets/{dataset_id}/generate-levels`
- Send the schema profile + sample rows to Gemini with a strict JSON response schema requesting an array of level objects:
  ```json
  {
    "level_number": 1,
    "difficulty": "bronze|silver|gold|platinum",
    "concept_tags": ["WHERE", "ORDER BY"],
    "question_text": "...",
    "reference_sql": "SELECT ...",
    "hint_progression": ["gentle nudge", "more specific hint", "near-answer hint"]
  }
  ```
- Difficulty should progress roughly as: basic SELECT/WHERE/ORDER BY → aggregates/GROUP BY/HAVING → multi-table JOINs → subqueries/CTEs → window functions → query optimization challenges (given an intentionally inefficient query, rewrite it).
- **Validate every generated level immediately**: execute `reference_sql` against the real DuckDB dataset. If it errors or returns zero rows, discard and regenerate that level (retry loop, max 3 attempts) rather than showing the user a broken level.
- Persist validated levels + their reference result-set hash to Postgres.
- Generate a mix so every dataset yields at least ~15-20 levels across difficulty tiers.

---

## 5. Query Submission & Grading

- Endpoint: `POST /levels/{level_id}/submit` — body: `{ user_query: string }`.
- Pipeline:
  1. Static safety check (sqlglot whitelist, reject non-SELECT).
  2. Execute user query against DuckDB with timeout; capture runtime in ms, row count, and any error message.
  3. Execute (or reuse cached) reference query result.
  4. Compare result sets **order-insensitively** and **column-rename-tolerant** (compare by value sets/shape, not exact column labels, unless the question explicitly requires exact column naming).
  5. If correct: award XP (bonus for speed/fewer attempts), update streak, check badge conditions, unlock next level.
  6. If incorrect: return a structured diff (e.g. "your result has 3 more rows than expected — check your JOIN type") rather than a bare pass/fail.
- Track every attempt (query text, timestamp, pass/fail, runtime) in Postgres for the analysis page and history tab.

---

## 6. Analysis Page

For any submitted query (correct or not), show:
- **Side-by-side**: user's query vs. reference query.
- **Runtime comparison**: user runtime vs reference runtime vs (if optimization exists) rewritten runtime — all real, measured numbers from DuckDB, never estimated.
- **Query plan**: run `EXPLAIN` in DuckDB and render it as a simple visual tree (scan → filter → join → aggregate stages).
- **Attempt history**: chronological list of all attempts on this level with pass/fail and runtime, and a simple growth chart across the user's whole account (levels solved over time, average runtime improvement).

---

## 7. Optimization Advice on Correct Queries (Key Feature)

Trigger only **after** a submission is graded correct. Endpoint: `POST /levels/{level_id}/optimize`.

### Step 1 — Static rule pass (no LLM call, instant)
Using `sqlglot`'s parsed AST, check for common anti-patterns:
- `SELECT *` instead of explicit columns
- Functions applied to a column inside `WHERE` (prevents pruning)
- Multiple `OR` conditions on the same column that could be an `IN (...)`
- `DISTINCT` combined with a `JOIN` (often masking row fan-out rather than fixing the join)
- Correlated subqueries that could be rewritten as a `JOIN` or window function
- Filtering after a join in a subquery instead of pushing the filter down
- Redundant repeated subqueries/CTEs recomputing the same aggregate

### Step 2 — Grounded execution comparison (mandatory, no exceptions)
- Actually run the user's original query in DuckDB and record real runtime (average of ~3 runs to reduce noise).
- If a rewritten/optimized version is proposed (either by a static rule or by Gemini), **that rewritten query must also actually be executed in DuckDB** and its real runtime recorded, before anything is shown to the user.
- Never display a runtime number, "faster" claim, or plan comparison unless it came from an actual DuckDB execution in this request. If for any reason the rewritten query can't be executed (syntax error, doesn't exist), do not show a runtime for it — show the rewritten SQL as a suggestion only, clearly labeled as unverified, or omit it.

### Step 3 — Gemini narration
- Send Gemini: the user's query, the DuckDB `EXPLAIN` output, the schema, and any static findings.
- Prompt Gemini explicitly to be honest when nothing is wrong: *"If the query is already optimal given this schema, say so plainly. Do not invent an optimization that isn't real."*
- Gemini's job is to explain *why* something is slow in plain English and propose a rewrite — not to assert a runtime number itself. All runtime numbers in the final response come from Step 2's actual execution, not from the model.

### Step 4 — Response shape
```json
{
  "verdict": "optimal | minor_improvement | significant_improvement",
  "explanation": "plain-English reason",
  "static_findings": ["..."],
  "rewritten_query": "SELECT ... | null",
  "user_runtime_ms": 42.3,
  "rewritten_runtime_ms": 11.7,
  "verified": true
}
```
- Display in an "Optimization" tab on the analysis page, alongside "Your Query," "Reference Query," and "Query Plan" tabs.
- If verdict is `optimal`, award a small bonus XP or a "Clean Query" badge for getting it right *and* efficient on the first try.

---

## 8. AI Tutor / Help Bot

- Persistent chat drawer available on every level page, context-aware of: current question, schema, and the user's most recent failed (or successful) query.
- Two modes, user-selectable:
  - **"Nudge me"** — Socratic hints only, drawn from the level's `hint_progression`, never reveals the full answer.
  - **"Teach me"** — full concept explanation with a simplified example using toy data, not the user's real answer.
- "Explain my query" button: Gemini narrates what the user's submitted SQL does, line by line, in plain English.
- Stream responses token-by-token for responsiveness.

---

## 9. Gamification Layer

- **XP & Levels**: XP per solve, bonus for speed and low attempt count, daily login streak multiplier.
- **Lives/hearts**: limited hearts per session, regenerate over time, discourages brute-forcing.
- **Tiers**: Bronze → Silver → Gold → Platinum, gated by concept mastery, not just level count.
- **Boss levels**: every 5th level is a harder, timed, visually distinct challenge.
- **Badges**: e.g. "Join Master," "Window Function Wizard," "Speed Demon," "Clean Query," "No Hints Needed."
- **Skill tree map**: visual node-graph UI (Duolingo-style path) showing concepts unlocked, rendered on the dashboard.
- **Leaderboards**: per-dataset and global; optionally a percentile comparison of the user's runtime vs others on the same level.
- **Query golf mode** (stretch): shortest correct query wins, separate leaderboard by character count.
- **Daily challenge** (stretch): a curated public dataset, same challenge for all users, resets daily.
- **Shareable certificate** (stretch): exportable image/PDF summary of skills mastered.

---

## 10. Suggested Folder Structure

```
/backend
  /app
    /api          (routers: datasets, levels, submissions, optimize, tutor, auth)
    /core         (config, security, duckdb session manager)
    /models       (SQLAlchemy models)
    /schemas      (Pydantic schemas)
    /services     (gemini_client.py, sql_rules.py, grading.py, level_generator.py)
    /db           (Postgres session, Alembic migrations)
  pyproject.toml   (managed via uv)
  main.py

/frontend
  /app
    /dashboard
    /datasets/[id]/levels/[levelId]
    /datasets/[id]/analysis/[levelId]
    /leaderboard
  /components
    SqlEditor.tsx
    SkillTreeMap.tsx
    TutorDrawer.tsx
    AnalysisTabs.tsx
    LevelCard.tsx
  /lib
    api.ts
```

---

## 11. Environment Variables

```
GOOGLE_API_KEY=
DATABASE_URL=            # Postgres
DUCKDB_STORAGE_PATH=     # where per-dataset DuckDB files live
JWT_SECRET=
NEXT_PUBLIC_API_URL=
```

---

## 12. Build Order (recommended milestones)

1. FastAPI skeleton + Postgres models + auth.
2. Dataset upload → pandas parsing → DuckDB loading → schema profiling.
3. Level generation pipeline (Gemini + validation-by-execution loop).
4. Submission/grading endpoint with the SELECT-only safety whitelist.
5. Frontend: upload flow, level list, Monaco-based level page, submit/grade UI.
6. Analysis page: runtime, query plan, history.
7. Optimization endpoint: static rules → grounded dual execution → Gemini narration.
8. Tutor chat drawer (nudge/teach modes, streaming).
9. Gamification: XP, hearts, badges, skill tree map, leaderboard.
10. Polish pass: animations, boss levels, daily challenge, certificate export (stretch).

---

## 13. Non-Negotiable Safety Rules for the Build

- User SQL is executed only against sandboxed, per-dataset DuckDB instances — never a shared or production database.
- Only single `SELECT` statements are ever executed; everything else is rejected before reaching DuckDB.
- Every runtime/performance claim shown to the user must come from an actual DuckDB execution performed in that request — never estimated or asserted by the LLM alone.
- Every AI-generated level's reference query must be validated by actual execution before the level is shown to any user.