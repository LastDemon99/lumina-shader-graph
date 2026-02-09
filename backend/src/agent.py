import os
import json
import logging
from typing import List, Dict, Any, Optional
from google import genai
from google.genai import types
from dotenv import load_dotenv

from .models import AgentResponse, GraphOperation, SocketModel, NodeDefinition
from .tools.definitions import get_node_definitions

# Import tools
from .tools import graph_ops

load_dotenv()

logger = logging.getLogger(__name__)

class GraphAgent:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables")
            
        self.client = genai.Client(api_key=self.api_key)
        self.model_id = "gemini-3-flash-preview"
        self.image_model_id = "gemini-3-pro-image-preview"
        
        # Load capabilities
        # from gemini-graph-agent root ("."), we go up one level ("..") to reach "LastDemon99"
        # then into "lumina-shader-graph/nodes/modules"
        target_path = os.path.join(os.getcwd(), "../lumina-shader-graph/nodes/modules")
        self.nodes_path = os.path.abspath(target_path)
        
        # Verify path exists for safety
        if not os.path.exists(self.nodes_path):
             logger.warning(f"Nodes path not found at {self.nodes_path}. Agent will have no node definitions.")
             self.definitions = []
        else:
             self.definitions = get_node_definitions(self.nodes_path)    
        self.definitions_text = self._build_definitions_text()

    def _build_definitions_text(self) -> str:
        lines = []
        for d in self.definitions:
            inputs = ", ".join([f"{i.id}({i.type})" for i in d.inputs])
            outputs = ", ".join([f"{o.id}({o.type})" for o in d.outputs])
            lines.append(f"- {d.type}: Inputs[{inputs}] -> Outputs[{outputs}]")
        return "\n".join(lines)

    def _get_system_instructions(self) -> str:
        return f"""You are an advanced AI agent for Lumina Shader Graph (WebGL 2.0). 
Your goal is to help users create and modify shader graphs by calling the appropriate TOOLS.

# AVAILABLE TOOLS
- You will be provided with a set of tools to manipulate the graph:
  - add_node(type, x, y): to add new nodes.
  - connect_nodes(source_node, source_socket, target_node, target_socket): to create connections.
  - remove_node(id): to delete nodes.
  - update_node_value(id, key, value): to modify internal node parameters.
  - upload_asset(filename, description): ONLY call this IF the user provides a NEW image attachment in the current message.

# NODE CATALOG
You have access to these node types:
{self.definitions_text}

# GUIDELINES
1. Analyze the USER REQUEST + CURRENT GRAPH STATE.
2. If the user asks for an effect (e.g., "Grayscale"), chain the necessary tools (add saturation node, connect texture to saturation, connect saturation to output).
3. Always connect your final result to the 'output' node (socket 'color') unless specified otherwise.
4. Try to position new nodes logically (e.g., to the left of existing nodes flow).
5. If the user sends one or more IMAGES, assume they want to use them as textures. For EACH image attachment in the current message: call `upload_asset`, then add a corresponding `texture2D` node.
6. When multiple texture images are provided (e.g., albedo/basecolor + ambient occlusion/AO), try to use ALL of them. If a texture looks like AO (mostly grayscale, dark crevices), incorporate it by multiplying it into the albedo/basecolor before connecting to `output.color` (unless the user specifies a different workflow).
7. Return a friendly explanation in the text response alongside your tool calls.
"""

    def process_request(self, messages_data: List[Dict[str, Any]], graph: Dict[str, Any]) -> AgentResponse:
        # 1. Prepare Graph Context
        # We inject the current graph state as a system/user context message
        graph_context = json.dumps({
            "nodes": [{"id": n.get("id"), "type": n.get("type"), "x": n.get("x"), "y": n.get("y")} for n in graph.get("nodes", [])],
            "connections": graph.get("connections", [])
        }, indent=2)

        prompt_context = f"""
CURRENT GRAPH STATE:
{graph_context}

(Note: Use this state to decide where to add nodes or what IDs to connect to.)
"""
        
        # 2. Build Message Content
        contents = []
        contents.append(types.Content(role="user", parts=[types.Part(text=prompt_context)]))

        # Scan for potential binary data to handle upload intent
        has_inline_data = False
        
        for msg in messages_data:
            role = msg.get("role", "user")
            content_raw = msg.get("content")
            
            parts = []
            if isinstance(content_raw, str):
                parts.append(types.Part(text=content_raw))
            elif isinstance(content_raw, list):
                for item in content_raw:
                    if isinstance(item, dict):
                        if "text" in item and item["text"]:
                            parts.append(types.Part(text=item["text"]))
                        elif "inline_data" in item:
                            has_inline_data = True
                            parts.append(types.Part(
                                inline_data=types.Blob(
                                    mime_type=item["inline_data"]["mime_type"],
                                    data=item["inline_data"]["data"]
                                )
                            ))
                        # gemini-3/2 support image inputs
            
            # Map 'assistant' role to 'model' for Gemini API if needed, 
            # though newer SDK might handle it.
            if role == "assistant": role = "model"
            
            contents.append(types.Content(role=role, parts=parts))

        # 3. Define Tools Configuration
        # We pass the functions directly. The SDK handles schema generation.
        tools_list = [
            graph_ops.add_node,
            graph_ops.remove_node,
            graph_ops.connect_nodes,
            graph_ops.disconnect_nodes,
            graph_ops.update_node_value,
            graph_ops.upload_asset,
            graph_ops.generate_image,
            graph_ops.edit_image
        ]
        
        # 4. Call Gemini
        try:
            response = self.client.models.generate_content(
                # Main reasoning + tool-calling model (multimodal: text/image/video).
                # Image generation/editing is handled separately via generate_image/edit_image tool ops.
                model=self.model_id,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=self._get_system_instructions(),
                    tools=tools_list, 
                    temperature=0.1 # Low temp for precise tool calling
                )
            )
            
            # 5. Parse Response & Tool Calls
            final_message = ""
            operations: List[GraphOperation] = []
            
            # Handle text parts
            if response.text:
                final_message = response.text
            
            # Handle function calls
            # The SDK returns tool calls in candidates[0].content.parts
            candidate = response.candidates[0]
            for part in candidate.content.parts:
                if part.function_call:
                    fc = part.function_call
                    op_name = fc.name
                    args = fc.args
                    
                    # Convert tool calls to our frontend's expected GraphOperation format
                    if op_name == "add_node":
                        operations.append(GraphOperation(
                            op="add_node",
                            nodeType=args.get("type"),
                            x=args.get("x", 0),
                            y=args.get("y", 0),
                            # ID is usually generated by frontend, but agent might suggest one? 
                            # If not, frontend handles ID gen.
                        ))
                    elif op_name == "remove_node":
                        operations.append(GraphOperation(
                            op="remove_node",
                            nodeId=args.get("id")
                        ))
                    elif op_name == "connect_nodes":
                        operations.append(GraphOperation(
                            op="add_connection",
                            sourceNodeId=args.get("source_node_id"),
                            sourceSocketId=args.get("source_socket_id"),
                            targetNodeId=args.get("target_node_id"),
                            targetSocketId=args.get("target_socket_id")
                        ))
                    elif op_name == "disconnect_nodes":
                         operations.append(GraphOperation(
                            op="remove_connection",
                            sourceNodeId=args.get("source_node_id"),
                            sourceSocketId=args.get("source_socket_id"),
                            targetNodeId=args.get("target_node_id"),
                            targetSocketId=args.get("target_socket_id")
                        ))
                    elif op_name == "update_node_value":
                        operations.append(GraphOperation(
                            op="update_node_data",
                            nodeId=args.get("node_id"),
                            dataKey=args.get("data_key"),
                            dataValue=args.get("value")
                        ))
                    elif op_name == "upload_asset":
                        operations.append(GraphOperation(
                            op="upload_asset",
                            assetName=args.get("filename"),
                            assetData=None 
                        ))
                    elif op_name == "generate_image":
                        # EJECUCIÓN REAL EN BACKEND
                        try:
                            logger.info(f"Generating image with prompt: {args.get('prompt')}")
                            # Call Image Generation Model
                            img_response = self.client.models.generate_image(
                                model=self.image_model_id,
                                prompt=args.get("prompt"),
                                config=types.GenerateImageConfig(
                                    number_of_images=1,
                                    aspect_ratio="1:1"
                                )
                            )
                            if img_response.generated_images:
                                img_bytes = img_response.generated_images[0].image.image_bytes
                                import base64
                                b64_data = base64.b64encode(img_bytes).decode('utf-8')
                                
                                # 1. Upload Asset Op
                                new_asset_id = f"gen_{os.urandom(4).hex()}"
                                operations.append(GraphOperation(
                                    op="upload_asset",
                                    assetId=new_asset_id,
                                    assetName="generated.png",
                                    assetData=f"data:image/png;base64,{b64_data}"
                                ))
                                
                                final_message += f"\n\nGenerated image and added to library."

                        except Exception as e:
                            logger.error(f"Image generation failed: {e}")
                            final_message += f"\n(Image generation failed: {str(e)})"

                    elif op_name == "edit_image":
                        # EJECUCIÓN REAL EN BACKEND (Img2Img)
                        # Requisito: Encontrar la imagen fuente en el grafo.
                        try:
                            source_id = args.get("asset_id") # Puede ser node_id o asset_id
                            prompt = args.get("prompt")
                            
                            # Buscar en el grafo
                            nodes_map = {n['id']: n for n in graph.get("nodes", [])}
                            base64_source = None
                            
                            # Caso 1: Es un Node ID
                            if source_id in nodes_map:
                                node = nodes_map[source_id]
                                # Asumimos que data.textureAsset tiene el base64 o referencia
                                # Si es referencia (ID), no podemos editar sin tener store de assets.
                                # Asumiremos BASE64 directo por petición del usuario.
                                val = node.get("data", {}).get("textureAsset")
                                if val and str(val).startswith("data:"):
                                    base64_source = val
                            
                            # Caso 2: Es un Asset ID (no tenemos el store aquí, skip salvo que frontend lo envie)
                            
                            if base64_source:
                                # Decode
                                import base64
                                header, encoded = base64_source.split(",", 1)
                                input_bytes = base64.b64decode(encoded)
                                from google.genai.types import RawImage

                                # Edit (Instruction based editing not directly supported in verify SDK, 
                                # map to generate_images with reference image in Gemni 3 or separate endpoint?)
                                # Gemini 3 Image soporta prompt + imagen base.
                                
                                # NOTA: La API exacta para edit/instancing varía.
                                # Usaremos generate_content con imagen + prompt para "edición".
                                
                                # TODO: Verificar endpoint correcto para Edit.
                                # Asumimos 'generate_images' standard no soporta input image en SDK v0.1
                                # Fallback: Usar generate_content normal para pedir descripción 'editada' y luego generar? No.
                                # Usaremos placeholder o mock si SDK no soporta edit directo aun.
                                pass
                                
                            else:
                                final_message += "\n(Could not find source image data for editing)"

                        except Exception as e:
                            logger.error(f"Image edit failed: {e}")

            
            return AgentResponse(
                message=final_message,
                operations=operations,
                thought_process="Function Calling active" 
            )

        except Exception as e:
            logger.error(f"Error calling Gemini: {e}")
            return AgentResponse(
                message=f"Error processing request: {str(e)}",
                operations=[]
            )
