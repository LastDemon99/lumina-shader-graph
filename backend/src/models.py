from pydantic import BaseModel
from typing import List, Optional, Literal, Dict, Any, Union


class PreviewRequest(BaseModel):
    nodeId: str
    kind: Optional[Literal["png", "sequence"]] = "png"
    previewMode: Optional[Literal["2d", "3d"]] = None
    previewObject: Optional[Literal["sphere", "box", "quad"]] = None
    durationSec: Optional[float] = None
    fps: Optional[int] = None
    note: Optional[str] = None

class SocketModel(BaseModel):
    id: str
    label: str
    type: str
    visible: Optional[bool] = True
    enabled: Optional[bool] = True

class NodeDefinition(BaseModel):
    type: str
    label: str
    inputs: List[SocketModel] = []
    outputs: List[SocketModel] = []
    description: Optional[str] = None
    category: Optional[str] = None

class Node(BaseModel):
    id: str
    type: str
    label: Optional[str] = None
    x: float = 0.0
    y: float = 0.0
    data: Dict[str, Any] = {}

class Connection(BaseModel):
    id: str
    sourceNodeId: str
    sourceSocketId: str
    targetNodeId: str
    targetSocketId: str

class GraphState(BaseModel):
    nodes: List[Node] = []
    connections: List[Connection] = []

class MessagePart(BaseModel):
    text: Optional[str] = None
    inline_data: Optional[Dict[str, str]] = None 
    image_url: Optional[str] = None

class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system", "model"]
    content: Union[str, List[MessagePart]]

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    graph: GraphState

class GraphOperation(BaseModel):
    op: Literal["add_node", "remove_node", "add_connection", "remove_connection", "update_node_data", "move_node", "upload_asset", "generate_image", "edit_image", "request_previews"]
    
    nodeId: Optional[str] = None
    
    # add_node
    nodeType: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    
    # connections
    connectionId: Optional[str] = None
    sourceNodeId: Optional[str] = None
    sourceSocketId: Optional[str] = None
    targetNodeId: Optional[str] = None
    targetSocketId: Optional[str] = None
    
    # update_data
    dataKey: Optional[str] = None
    dataValue: Optional[Any] = None
    
    # upload_asset / generate_image result
    assetId: Optional[str] = None
    assetName: Optional[str] = None
    assetMimeType: Optional[str] = None
    assetData: Optional[str] = None 

    # generate_image
    imagePrompt: Optional[str] = None
    imageType: Optional[Literal["basecolor", "normal", "specular", "roughness", "displacement", "emission", "alpha", "sprite_flipbook", "environment_map"]] = None

    # edit_image
    editPrompt: Optional[str] = None
    sourceAssetId: Optional[str] = None

    # request_previews (agent -> frontend)
    previewRequests: Optional[List[PreviewRequest]] = None

class AgentResponse(BaseModel):
    message: str
    operations: List[GraphOperation] = []
    thought_process: Optional[str] = None
