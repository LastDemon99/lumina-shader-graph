# Lumina Shader Graph (Gemini 3 Hackathon)

**Lumina Shader Graph** is a browser-based, Unity-like node editor for building realtime shaders, enhanced with a **Gemini 3 agentic backend** that can **reason, edit, and refactor shader graphs** via deterministic JSON operations.

This repository contains **two public services** (Hackathon setup):
- **Frontend**: Vite + React + TypeScript shader graph editor and preview
- **Backend**: FastAPI + Google ADK agent that routes intents and returns graph operations

---

## Gemini 3 integration

Lumina’s core innovation is an **agentic, multi-intent assistant** powered by the **Gemini 3 family** that can *understand a shader graph as structured data* and modify it safely. The frontend sends the user prompt, chat history, and the current graph snapshot to the backend. The backend uses a **Google ADK** agent that first runs an **intent router** to classify the request into modes like **ARCHITECT** (create), **EDITOR** (surgical edits), **REFINER** (diagnose/fix), or **CONSULTANT** (explain). Based on the detected intent it loads a dedicated instruction pack and executes tools that produce **deterministic JSON operations** (e.g. `add_node`, `remove_node`, `add_connection`, `update_node_data`).

To reduce latency and token usage, the backend normalizes graph context into compact table-like representations instead of raw JSON. For multimodal workflows, the backend supports **image inputs**: user-uploaded images (and embedded `data:` textures found in the graph) are persisted in an Asset Store and referenced by `assetId` so base64 is not sent to the model. When images are included in model requests, they are **resized to a max of 768px** on the longest side to keep prompts efficient while preserving the original asset resolution for rendering. This enables “drag an image/video reference → generate/edit the graph” workflows with Gemini 3 at the center.

---

## Quick start (Windows)

### 1) Prerequisites
- **Node.js** (LTS recommended)
- **Python 3.x**
- A **Gemini API key** available to the backend (and optionally the frontend):
  - `GEMINI_API_KEY=...`

> Note: `.env` is gitignored. Use environment variables or your own local `.env` files.

### 2) Run both services
From the repo root:

```bat
run-all.bat
```

This will:
- Create `backend/venv` (if missing) and install Python deps
- Install frontend deps and build
- Start:
  - Backend: http://localhost:8000/health
  - Frontend: http://localhost:3000/

---

## Manual run

### Backend (FastAPI)
```powershell
cd backend
python -m venv venv
.\venv\Scripts\python -m pip install -r requirements.txt
.\venv\Scripts\python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (Vite)
```powershell
cd frontend
npm install
npm run dev
```

---

## API (backend)

- `POST /api/v1/chat` → returns `{ message, operations[], thought_process }`
- `GET /api/v1/assets/{asset_id}` → serves persisted binary assets
- `GET /health` → basic health/status

See: [backend/README.md](backend/README.md)

---

## Repo structure

- [frontend/](frontend/) — UI editor, node canvas, preview
- [backend/](backend/) — agent backend (FastAPI + Google ADK), asset store, tools
- [run-all.bat](run-all.bat) — Windows helper to install/build and start both services
