from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).parent.parent / ".env")

from agent.state_machine import execute_approved_session, run_planning_loop
from models.schemas import PlanRequest, SessionState

app = FastAPI(title="LoopEvent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSIONS: dict[str, SessionState] = {}


@app.post("/api/plan")
def create_plan(request: PlanRequest) -> SessionState:
    session = SessionState(request=request)
    SESSIONS[session.session_id] = session
    return run_planning_loop(session)


@app.get("/api/session/{session_id}")
def get_session(session_id: str) -> SessionState:
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/api/session/{session_id}/approve")
def approve_session(session_id: str) -> SessionState:
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return execute_approved_session(session)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
