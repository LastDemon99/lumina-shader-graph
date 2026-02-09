import asyncio

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from typing import Dict
import logging
import os

from .agent_adk import GraphAgentAdk
from .models import ChatRequest, AgentResponse, GraphState, ChatMessage

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Gemini Graph Agent", version="1.0.0")

# CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global agent instance
agent = None

@app.on_event("startup")
async def startup_event():
    global agent
    try:
        agent = GraphAgentAdk()
        logger.info(f"Agent initialized with definitions from: {agent.nodes_path}")
        logger.info(f"Loaded {len(agent.definitions)} node definitions.")
    except Exception as e:
        logger.error(f"Failed to initialize agent: {e}")
        # We don't crash startup, but endpoints will fail
        
@app.post("/api/v1/chat", response_model=AgentResponse)
async def chat_endpoint(request: ChatRequest):
    global agent
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    
    # Transform Pydantic models to dicts for internal processing
    msgs = [m.dict() for m in request.messages]
    graph_dict = request.graph.dict()
    
    timeout_sec = float(os.getenv("LUMINA_AGENT_TIMEOUT_SEC", "180"))

    try:
        logger.info("/api/v1/chat: start (timeout=%.1fs)", timeout_sec)
        # Offload to a worker thread so a slow/blocked model call can't block the server's event loop.
        response = await asyncio.wait_for(
            run_in_threadpool(agent.process_request_sync, msgs, graph_dict),
            timeout=timeout_sec,
        )
        logger.info("/api/v1/chat: done (ops=%s)", len(getattr(response, "operations", []) or []))
        return response
    except asyncio.TimeoutError:
        logger.warning("/api/v1/chat: timed out after %.1fs", timeout_sec)
        raise HTTPException(status_code=504, detail=f"Agent timed out after {timeout_sec:.1f}s")
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/assets/{asset_id}")
async def get_asset(asset_id: str):
    global agent
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")
    
    record = agent.asset_store.get(asset_id)
    if not record:
        raise HTTPException(status_code=404, detail="Asset not found")
        
    return Response(content=record.data, media_type=record.mime_type)


@app.get("/api/v1/assets")
async def list_assets():
    global agent
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    try:
        return {"assets": agent.asset_store.list_assets()}
    except Exception as e:
        logger.error(f"Error listing assets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/v1/assets/{asset_id}", status_code=204)
async def delete_asset(asset_id: str):
    global agent
    if not agent:
        raise HTTPException(status_code=503, detail="Agent not initialized")

    try:
        removed = agent.asset_store.delete(asset_id)
    except Exception as e:
        logger.error(f"Error deleting asset {asset_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if not removed:
        raise HTTPException(status_code=404, detail="Asset not found")

    return Response(status_code=204)

@app.get("/health")
async def health_check():
    return {
        "status": "ok", 
        "agent_loaded": agent is not None,
        "nodes_available": len(agent.definitions) if agent else 0
    }
