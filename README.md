<!-- ══════════════════════════════════════════════════════════════════════ -->

<div align="center">

# 🌴 SQLQuest

### _Turn any dataset into a playable jungle of SQL challenges_

<!-- IMAGE 1: the jungle game world we built — the Dude, a coin level node,
     a bat boss and the parallax forest. Filename: images/world.png -->
![SQLQuest — the jungle world](images/world.png)

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.11-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Phaser](https://img.shields.io/badge/Phaser-4-8e44ad?logo=phaser)](https://phaser.io/)
[![DuckDB](https://img.shields.io/badge/DuckDB-analytics-fff000?logo=duckdb&logoColor=black)](https://duckdb.org/)
[![Gemini](https://img.shields.io/badge/AI-Google%20Gemini-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-7ed957.svg)](#-license)

</div>

---

## 🎮 What is SQLQuest?

**SQLQuest** turns any CSV or Excel file you upload into a **side-scrolling pixel-art
adventure** where each level is a real SQL challenge generated from _your_ data. Walk
your hero through the jungle, jump into a level, write a query against your dataset in a
real editor, get graded on actual execution, and level up.

Every fact the game shows you — pass/fail, runtimes, "this rewrite is faster" — is
**grounded in real DuckDB execution**, never guessed by an AI. The AI writes the levels,
tutors you, and explains optimizations; **DuckDB is the source of truth**.

> 🧠 Learn SQL &nbsp;·&nbsp; 🕹️ by playing a platformer &nbsp;·&nbsp; 📊 on your own data

---

## ✨ Features

| | Feature | What it does |
|---|---|---|
| 🗺️ | **Playable world map** | A Mario-style jungle platformer (Phaser). Walk, run, jump between level nodes; biomes shift with difficulty; bosses guard the hard levels. |
| 🤖 | **AI-generated levels** | Gemini reads your schema + sample rows and writes 15–20 levels (bronze → platinum), each **validated by real execution** before you ever see it. |
| ✅ | **Grounded grading** | Your query runs in a sandboxed, SELECT-only DuckDB instance with a timeout. Results are compared order-insensitively; you get a helpful diff, not just pass/fail. |
| ⌨️ | **Monaco SQL editor** | A real code editor with a live **data preview** (first 10 rows + a Columns explorer) right beside it. |
| 📊 | **Analysis page** | Your query vs. the reference, **measured** runtimes, DuckDB `EXPLAIN` plans, and full attempt history. |
| ⚡ | **Optimization advice** | After you solve a level: static anti-pattern checks + a Gemini rewrite that is **actually executed and verified to return the same rows** before any speedup is claimed. |
| 🦉 | **AI Tutor "Sage"** | A streaming chat drawer — _Nudge me_ (Socratic hints), _Teach me_ (concepts with toy data), or _Explain my query_ line-by-line. |
| 🔒 | **Sequential unlocking** | Finish a level to unlock the next — enforced on the backend, not just the UI. |
| 🏆 | **Gamification** | XP, streaks, hearts, **badges**, a global leaderboard, per-world progress, and a resume-where-you-left-off spawn. |
| 🧑‍🌾 | **Profile** | Consolidated stats across all your worlds: accuracy, avg/fastest runtime, mastery by tier, badges — and log out. |

---

## 📸 Screenshots

### 📈 World progress
<!-- IMAGE: the per-world progress page — level completion + best runtimes. -->
![World progress](images/world-progress.png)

### 🏠 Dashboard — your worlds
<!-- IMAGE 2: the dashboard showing your uploaded worlds + the "Upload dataset" button. -->
![Dashboard](images/dashboard.png)

### 🧑‍🌾 Profile
<!-- IMAGE 3: the profile page — consolidated stats across all worlds + log out. -->
![Profile](images/profile.png)

### 🎖️ Badges
<!-- IMAGE 4: the badges page with unlocked + locked badges. -->
![Badges](images/badges.png)

### 🏆 Leaderboard
<!-- IMAGE 5: the global leaderboard. -->
![Leaderboard](images/leaderboard.png)

### ⌨️ Level — editor + data preview
<!-- IMAGE 6: a level page with the Monaco SQL editor and the data preview beside it. -->
![Level](images/level.png)

### 📊 Level analysis
<!-- IMAGE: the analysis page — side-by-side queries, measured runtimes, EXPLAIN plans, optimization. -->
![Level analysis](images/level-analysis.png)

### 🦉 Sage — the AI tutor
<!-- IMAGE 7: the "Ask Sage" tutor drawer open with a reply. -->
![Sage](images/sage.png)

---

## 🧰 Tech Stack

**Frontend** — Next.js 16 (App Router) · TypeScript · Tailwind CSS · **Phaser 4** (the game) ·
Monaco Editor · Framer Motion

**Backend** — FastAPI (Python 3.11, managed with **uv**) · SQLAlchemy + Alembic ·
**DuckDB** (sandboxed query engine) · pandas · **sqlglot** (SQL safety + static analysis) ·
Google **Gemini** (structured output + streaming)

**Data** — **Postgres** (users, XP, levels, attempts, badges) · per-dataset **DuckDB** files

---

## 🏗️ How it works

```
        upload CSV/XLSX                 write SQL in the world
              │                                  │
              ▼                                  ▼
   ┌──────────────────┐   schema   ┌──────────────────────────┐
   │  pandas ingest   ├──────────► │   Gemini generates 15-20 │
   │  → DuckDB (disk) │            │   levels, each validated │
   └────────┬─────────┘            │   by REAL execution      │
            │                      └───────────┬──────────────┘
            │                                  │ persisted
            ▼                                  ▼
   ┌──────────────────┐            ┌──────────────────────────┐
   │  sqlglot SELECT- │  safe SQL  │  DuckDB runs your query  │
   │  only whitelist  ├──────────► │  (timeout + row cap) and │
   └──────────────────┘            │  grades vs. reference    │
                                   └──────────────────────────┘
```

**Non-negotiable safety rules baked in:**

- 🛡️ User SQL only ever runs against **sandboxed, per-dataset DuckDB** instances — never a shared/production DB.
- 🚫 **Only single `SELECT` statements** execute; `DROP/DELETE/UPDATE/…` and stacked statements are rejected by `sqlglot` before reaching DuckDB.
- ⏱️ Every query has a **hard timeout and row cap**.
- 📏 Every runtime/"faster" claim comes from an **actual DuckDB execution in that request** — never estimated by the LLM.

---

## 📁 Project structure

```
SQL-Game Engine/
├── backend/                 # FastAPI + DuckDB + Gemini
│   ├── app/
│   │   ├── api/             # routers: auth, datasets, levels, submissions, tutor, leaderboard
│   │   ├── core/            # config, security, DuckDB session manager
│   │   ├── models/          # SQLAlchemy models (User, Dataset, Level, Attempt, UserBadge)
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/        # gemini, grading, sql_safety, sql_rules, optimizer, tutor, badges…
│   │   └── db/              # Postgres session
│   ├── alembic/             # migrations
│   └── main.py
├── frontend/                # Next.js app
│   ├── app/                 # routes: dashboard, world, level, analysis, badges, leaderboard, profile
│   ├── components/          # game/ (Phaser), SqlEditor, DataPreview, TutorDrawer, Hud, NavDrawer…
│   └── public/game/dude/    # pixel-art assets + CREDITS.md
└── images/                  # README screenshots
```

---

## 🚀 Getting started

### Prerequisites

- **Python 3.11** and [**uv**](https://github.com/astral-sh/uv)
- **Node.js 20+** and npm
- A **Postgres** database (a free [Supabase](https://supabase.com) project works great)
- A **Google Gemini API key** ([Google AI Studio](https://aistudio.google.com/apikey))

### 1) Backend

```bash
cd backend
uv sync                       # install dependencies
```

Create `backend/.env`:

```env
GOOGLE_API_KEY=your-gemini-key
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/postgres
DUCKDB_STORAGE_PATH=./duckdb_data
JWT_SECRET=change-me-to-something-random
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> 💡 On Supabase, use the **Session pooler** connection string (IPv4-friendly) and add the
> `+psycopg` driver as shown above.

Run the migrations, then start the API:

```bash
uv run alembic upgrade head
uv run uvicorn main:app --reload --port 8000
```

### 2) Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Start it:

```bash
npm run dev
```

### 3) Play

Open **http://localhost:3000** → register → upload a CSV/Excel file → **Generate levels**
(~30 s) → walk your hero into a level and start querying!

**Controls:** `← →` move · `SHIFT` run · `↑` jump · `ENTER` enter level

---

## 🗺️ Roadmap

- [x] Auth, dataset upload, DuckDB ingestion + schema profiling
- [x] AI level generation (validated by execution)
- [x] Grading with SELECT-only safety
- [x] Pixel-art Phaser world + data-driven levels & bosses
- [x] Monaco editor + live data preview
- [x] Analysis page (runtimes, `EXPLAIN`, history)
- [x] Optimization advice (grounded dual execution)
- [x] AI Tutor (streaming) · Badges · Leaderboard · Profile · Sequential unlocking
- [ ] Multiplayer duel mode · Daily challenge · Shareable certificate _(stretch)_

---

## 🎨 Credits

- **Character, enemies & UI sprites** — [Dude-SideScroll](https://github.com/diguifi/Dude-SideScroll) by Diego Penha (MIT)
- **Jungle tileset & parallax** — [Jungle Pack](https://jesse-m.itch.io/jungle-pack) by Jesse Munguia
- **Coins** — [Gems / Coins Free](https://piclet.itch.io/gems-coins-free) by La Red Games (CC0)
- **AI** — Google **Gemini** · **DuckDB** · **Phaser**

See [`frontend/public/game/dude/CREDITS.md`](frontend/public/game/dude/CREDITS.md) for asset licensing details.

---

## 📜 License

Released under the **MIT License**. Game art retains its original licenses (see Credits).

<div align="center">

**🌴 Happy questing — may your JOINs never fan out. 🦉**

</div>
