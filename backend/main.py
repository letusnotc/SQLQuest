from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, datasets, leaderboard, levels, submissions, tutor
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title="SQLQuest API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(datasets.router)
app.include_router(levels.router)
app.include_router(submissions.router)
app.include_router(tutor.router)
app.include_router(leaderboard.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
