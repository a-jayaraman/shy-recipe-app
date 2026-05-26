#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
    echo ""
    echo "Shutting down..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
    wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
}
trap cleanup INT TERM

echo "Starting backend..."
cd "$ROOT/backend"
[ -d ".venv" ] || python -m venv .venv
source .venv/bin/activate
pip install uv && uv pip install -r requirements.txt --python .venv/bin/python
PYTHONPATH=. .venv/bin/uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

echo "Starting frontend..."
cd "$ROOT/frontend"
npm install
npm run dev &
FRONTEND_PID=$!

echo "Backend PID: $BACKEND_PID  |  Frontend PID: $FRONTEND_PID"
echo "Backend: http://localhost:8000  |  Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop both."

wait
