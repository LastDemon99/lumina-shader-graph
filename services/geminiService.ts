
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { NODE_DEFINITIONS } from "../constants";
import { NodeType, ShaderNode, Connection } from "../types";
import { NODE_REGISTRY, getNodeModule } from "../nodes";
import { getFallbackSocketId } from "../nodes/runtime";

// Schema is shared between draft and refine stages
const GRAPH_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    technical_plan: {
      type: Type.STRING,
      description: "Brief explanation of the changes or logic."
    },
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: { type: Type.STRING },
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          dataValue: { type: Type.STRING, description: "Optional value for color (hex) or float" }
        },
        required: ["id", "type", "x", "y"]
      }
    },
    connections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sourceNodeId: { type: Type.STRING },
          sourceSocketId: { type: Type.STRING },
          targetNodeId: { type: Type.STRING },
          targetSocketId: { type: Type.STRING },
        },
        required: ["sourceNodeId", "sourceSocketId", "targetNodeId", "targetSocketId"]
      }
    }
  },
  required: ["technical_plan", "nodes", "connections"]
};

export class GeminiService {
  private modelId = 'gemini-3-flash-preview';

  private definitions = Array.from(new Set([...Object.keys(NODE_DEFINITIONS), ...Object.keys(NODE_REGISTRY)])).join(', ');

  private sanitizeGraph(rawData: any) {
      if (!rawData || !rawData.nodes || !rawData.connections) return null;

      const sanitizedNodes = rawData.nodes;
      const sanitizedConnections = rawData.connections.map((conn: any) => {
          const sourceNode = sanitizedNodes.find((n: any) => n.id === conn.sourceNodeId);
          const targetNode = sanitizedNodes.find((n: any) => n.id === conn.targetNodeId);

          if (!sourceNode || !targetNode) return null;

          const sourceMod = getNodeModule(sourceNode.type);
          const targetMod = getNodeModule(targetNode.type);
          const sourceDef = (sourceMod?.definition ?? NODE_DEFINITIONS[sourceNode.type as NodeType]) as any;
          const targetDef = (targetMod?.definition ?? NODE_DEFINITIONS[targetNode.type as NodeType]) as any;

          if (!sourceDef || !targetDef) return null;

          let finalSourceSocketId = conn.sourceSocketId;
          const sourceExists = sourceDef.outputs.find(o => o.id === finalSourceSocketId);
          if (!sourceExists && sourceDef.outputs.length > 0) {
              const fauxSourceNode: ShaderNode = {
                id: sourceNode.id,
                type: sourceNode.type,
                label: sourceDef.label,
                x: sourceNode.x ?? 0,
                y: sourceNode.y ?? 0,
                inputs: sourceDef.inputs,
                outputs: sourceDef.outputs,
                data: {},
              };
              finalSourceSocketId = getFallbackSocketId(fauxSourceNode, 'output', sourceMod?.socketRules) ?? sourceDef.outputs[0].id;
          }

          let finalTargetSocketId = conn.targetSocketId;
          const targetExists = targetDef.inputs.find(i => i.id === finalTargetSocketId);
          if (!targetExists && targetDef.inputs.length > 0) {
              if (finalTargetSocketId === 'b' && targetDef.inputs.some(k => k.id === 'b')) {
                  // Keep 'b'
              } else if (finalTargetSocketId === 'a' && targetDef.inputs.some(k => k.id === 'a')) {
                  // Keep 'a'
              } else {
                const fauxTargetNode: ShaderNode = {
                  id: targetNode.id,
                  type: targetNode.type,
                  label: targetDef.label,
                  x: targetNode.x ?? 0,
                  y: targetNode.y ?? 0,
                  inputs: targetDef.inputs,
                  outputs: targetDef.outputs,
                  data: {},
                };
                finalTargetSocketId = getFallbackSocketId(fauxTargetNode, 'input', targetMod?.socketRules) ?? targetDef.inputs[0].id;
              }
          }

          return {
              ...conn,
              sourceSocketId: finalSourceSocketId,
              targetSocketId: finalTargetSocketId
          };
      }).filter((c: any) => c !== null);

      return {
          nodes: sanitizedNodes,
          connections: sanitizedConnections
      };
  }

  async generateOrModifyGraph(prompt: string, currentNodes: ShaderNode[], currentConnections: Connection[]): Promise<any> {
    if (!process.env.API_KEY) return null;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Prepare context to send to AI
    const hasContext = currentNodes.length > 0;
    const contextJson = hasContext ? JSON.stringify({
      nodes: currentNodes.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, dataValue: n.data.value })),
      connections: currentConnections
    }) : "EMPTY_GRAPH";

    const systemInstruction = `
      You are an Intelligent Shader Graph Assistant.
      AVAILABLE NODE TYPES: ${this.definitions}
      
      YOUR TASK:
      Analyze the USER PROMPT and the CURRENT GRAPH (if provided).
      
      DECISION LOGIC:
      1. **MODIFICATION/REFINEMENT**: If the user asks to "add", "change", "tweak", or "fix" something (e.g., "Add transparency", "Make it red"), you MUST KEEP the existing nodes and connections that are working.
         - Do NOT regenerate the whole graph from scratch unless necessary.
         - Preserve existing Node IDs if you keep them.
         - Add new nodes to implement the requested feature.
         - Update values in 'dataValue' if requested.
      
      2. **NEW CREATION**: If the user asks for a completely different shader (e.g., "Create a fire shader", "Reset graph"), ignore the Current Graph and build from scratch.

      GENERAL RULES:
      - Always ensure there is one 'output' (Fragment Master).
      - If vertex manipulation is requested, ensure a 'vertex' (Vertex Master) exists.
      - Return the FULL graph state (old nodes + new nodes).
    `;

    const userContent = `
      CURRENT GRAPH STATE:
      ${contextJson}

      USER PROMPT:
      "${prompt}"
    `;

    try {
      const response = await ai.models.generateContent({
        model: this.modelId,
        contents: userContent,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: GRAPH_SCHEMA
        }
      });
      
      const text = response.text;
      if (!text) return null;
      return this.sanitizeGraph(JSON.parse(text));
    } catch (e) {
      console.error("Draft Error:", e);
      return null;
    }
  }

  async refineGraph(draftGraph: any, linterReport: string[]): Promise<any> {
    if (!process.env.API_KEY) return null;
    if (!draftGraph) return null;
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const systemInstruction = `
      You are a Shader Graph Validator and Layout Engine.
      Your job is to take an existing node graph and a LINTER REPORT, fix the errors, and organize the layout.

      LAYOUT RULES (Strict Hierarchical Left-to-Right):
      - x=0 to 200: Input Nodes (Time, UV, Position, Normal, Color, Float).
      - x=300 to 700: Math & Logic (Add, Multiply, Sine, Noise, Mix).
      - x=900 to 1200: Master Nodes (Vertex Master, Fragment Master).
      - Ensure nodes do not overlap.
      - Ensure flow is strictly Left -> Right.
      - Preserving user mental model is good, but fixing 'backwards flow' is better.

      FIXING RULES:
      - Connect disconnected nodes reported by the linter.
      - If a node is useless (dead end) and not a Master node, remove it.
      - Ensure the Fragment Master has 'color' connected.
    `;

    const prompt = `
      Graph JSON: ${JSON.stringify(draftGraph)}
      
      Linter Report (Errors to Fix):
      ${linterReport.length > 0 ? linterReport.join('\n') : "None. Just optimize layout."}

      Output the corrected, organized graph.
    `;

    try {
      const response = await ai.models.generateContent({
        model: this.modelId,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: GRAPH_SCHEMA
        }
      });
      
      const text = response.text;
      if (!text) return draftGraph; // Fallback to draft if refinement fails
      
      const rawData = JSON.parse(text);
      console.log("Refinement Plan:", rawData.technical_plan);
      return this.sanitizeGraph(rawData);

    } catch (e) {
      console.error("Refinement Error:", e);
      return draftGraph;
    }
  }
}

export const geminiService = new GeminiService();
