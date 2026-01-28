
import { GoogleGenAI, Type, Schema, ThinkingLevel } from "@google/genai";
import { ShaderNode, Connection } from "../../types";
import { ALL_NODE_TYPES, getNodeModule } from "../../nodes";
import { getEffectiveSockets, getFallbackSocketId } from "../../nodes/runtime";
import { lintGraph } from "./linter";
import architectInstructions from "./agent-instructions/shader-architect.md?raw";
import refinerInstructions from "./agent-instructions/shader-refiner.md?raw";

export class GeminiService {
  private modelId = 'gemini-2.5-flash'; // (2.5 temporal for test) 'gemini-3-flash-preview';

  // Native image generation model ("Nano Banana"-style). Override via env.
  private imageModelId =
    (import.meta as any).env?.VITE_GEMINI_IMAGE_MODEL ||
    import.meta.env.VITE_GEMINI_IMAGE_MODEL ||
    'gemini-2.5-flash-image'; // (2.5 temporal for test) 'gemini-3-pro-image-preview';

  private thinkingConfig = {
    thinkingLevel: ThinkingLevel.LOW,
    includeThoughts: true
  };

  private injectPlaceholders(template: string, values: Record<string, string>): string {
    let out = String(template || '');
    for (const [key, value] of Object.entries(values || {})) {
      out = out.split(`{{${key}}}`).join(String(value ?? ''));
    }
    return out;
  }

  private buildSystemInstruction(softwareContext: string): string {
    const base = String(architectInstructions || '');
    if (base.includes('{{SOFTWARE_CONTEXT}}')) {
      return this.injectPlaceholders(base, { SOFTWARE_CONTEXT: softwareContext });
    }
    return `${base}\n\n${softwareContext}`;
  }

  private buildRefineSystemInstruction(): string {
    const base = String(refinerInstructions || '');
    const available = `AVAILABLE_NODES:\n${this.definitions}`;
    if (base.includes('{{AVAILABLE_NODES}}')) {
      return this.injectPlaceholders(base, { AVAILABLE_NODES: available });
    }
    return `${base}\n\n${available}`;
  }

  private cleanBase64(dataUrlOrBase64: string): string {
    return String(dataUrlOrBase64 || '').replace(/^data:[^;]+;base64,/, "");
  }

  private parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
    const str = String(dataUrl || '');
    const m = /^data:([^;]+);base64,(.+)$/i.exec(str);
    if (!m) return null;
    return { mimeType: m[1], data: m[2] };
  }

  private async generateContentText(ai: GoogleGenAI, request: any, onLog?: (msg: string) => void): Promise<string> {
    const result = await ai.models.generateContent(request);
    return this.processResponse(result, onLog);
  }

  private logGraphSummary(label: string, graph: { nodes: any[]; connections: any[] } | null | undefined, onLog?: (msg: string) => void) {
    if (!onLog) return;
    if (!graph) {
      onLog(`${label}: <null graph>`);
      return;
    }
    const nodes = Array.isArray(graph.nodes) ? graph.nodes.length : 0;
    const conns = Array.isArray(graph.connections) ? graph.connections.length : 0;
    const outputIncoming = Array.isArray(graph.connections)
      ? graph.connections.filter((c: any) => c && c.targetNodeId === 'output').length
      : 0;
    onLog(`${label}: nodes=${nodes}, connections=${conns}, outputIncoming=${outputIncoming}`);
  }

  // Build a rich schema of available nodes to prevent hallucinations
  private get definitions(): string {
    const toLine = (type: string) => {
      const mod = getNodeModule(type);
      if (!mod) return `- ${type}`;
      const def = mod.definition;
      const inputs = def.inputs.map(i => `${i.id}(${i.type})`).join(', ');
      const outputs = def.outputs.map(o => `${o.id}(${o.type})`).join(', ');
      return `- ${type}: Inputs[${inputs}] -> Outputs[${outputs}]`;
    };

    // Include explicit master node definitions from the actual node modules,
    // so the model uses correct socket IDs (e.g. output.color, not "Base Context").
    const masterTypes = ['output', 'vertex'];

    return [...ALL_NODE_TYPES, ...masterTypes]
      .map(toLine)
      .join('\n');
  }

  // Helper to extract thoughts and text from Thinking model response
  private async processResponse(result: any, onLog?: (msg: string) => void): Promise<string> {
    // Robustly handle response structure for both SDK versions
    const candidate = result.candidates?.[0] || result.response?.candidates?.[0];

    if (!candidate) {
      throw new Error(`Empty response from Gemini: ${JSON.stringify(result)}`);
    }

    if (onLog && candidate.content && candidate.content.parts) {
      candidate.content.parts.forEach((part: any) => {
        if (part.thought) {
          onLog(`THOUGHT: ${part.text || "..."}`);
        }
      });
    }

    // Manual extraction if .text() is missing
    if (candidate.content && candidate.content.parts) {
      return candidate.content.parts
        .filter((p: any) => !p.thought && p.text)
        .map((p: any) => p.text)
        .join('');
    }

    // Fallback
    return typeof result.text === 'function' ? result.text() : "";
  }

  private getApiKey(): string | null {
    return (
      import.meta.env.VITE_GEMINI_API_KEY ||
      (import.meta as any).env?.VITE_GEMINI_API_KEY ||
      process.env.VITE_GEMINI_API_KEY ||
      process.env.API_KEY ||
      null
    );
  }

  private createClient(): GoogleGenAI | null {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  }

  async inferTextureRequest(
    userPrompt: string,
    onLog?: (msg: string) => void
  ): Promise<{
    imagePrompt: string;
    target: { nodeId: string; socketId: string };
    operation: 'multiply' | 'replace';
    channel: 'rgba' | 'rgb' | 'r' | 'g' | 'b' | 'a';
  } | null> {
    const ai = this.createClient();
    if (!ai) {
      onLog?.('Missing Gemini API key (VITE_GEMINI_API_KEY).');
      return null;
    }

    const prompt = String(userPrompt || '').trim();
    if (!prompt) return null;

    const instruction = [
      'You are helping a node-based shader editor.',
      'Task: infer (1) the best image generation prompt for a texture and (2) where to apply it in the shader graph.',
      'Return ONLY valid JSON, no markdown.',
      '',
      'Output JSON schema:',
      '{',
      '  "imagePrompt": string,',
      '  "target": { "nodeId": "output", "socketId": one of ["color","alpha","normal","specular","smoothness","occlusion","emission"] },',
      '  "operation": "multiply" | "replace",',
      '  "channel": one of ["rgba","rgb","r","g","b","a"]',
      '}',
      '',
      'Guidelines:',
      '- If user says normal/normalmap/bump -> target.socketId="normal" and channel="rgba".',
      '- If user says alpha/opacity/mask -> target.socketId="alpha" and channel="a" unless specified.',
      '- If user says specular -> target.socketId="specular" channel="r" unless specified.',
      '- If user says roughness -> target.socketId="smoothness" and operation="replace" (roughness is inverse of smoothness, but if unsure choose smoothness replace).',
      '- Default: target.socketId="color", operation="multiply", channel="rgba".',
      '- imagePrompt must describe a seamless, tileable texture suitable for realtime shading.',
      '',
      'User request:',
      prompt,
    ].join('\n');

    onLog?.('Inferring texture intent (prompt + target)...');

    try {
      const result = await ai.models.generateContent({
        model: this.modelId,
        contents: [{ role: 'user', parts: [{ text: instruction }] }],
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: this.thinkingConfig,
        },
      } as any);

      // Best-effort extraction across SDK shapes.
      const candidate = (result as any)?.candidates?.[0] || (result as any)?.response?.candidates?.[0];
      const parts: any[] = candidate?.content?.parts || [];
      const text = parts
        .filter((p: any) => p && !p.thought && p.text)
        .map((p: any) => String(p.text))
        .join('')
        .trim();

      if (!text) return null;
      const json = this.safeJsonParse(text);

      const imagePrompt = String(json?.imagePrompt || '').trim();
      const nodeId = String(json?.target?.nodeId || 'output');
      const socketId = String(json?.target?.socketId || 'color');
      const operation = (json?.operation === 'replace' ? 'replace' : 'multiply') as 'multiply' | 'replace';
      const channel = (["rgba", "rgb", "r", "g", "b", "a"].includes(json?.channel) ? json.channel : 'rgba') as any;

      const allowedSockets = new Set(['color', 'alpha', 'normal', 'specular', 'smoothness', 'occlusion', 'emission']);
      const finalSocketId = allowedSockets.has(socketId) ? socketId : 'color';
      const finalNodeId = nodeId || 'output';

      if (!imagePrompt) return null;

      return {
        imagePrompt,
        target: { nodeId: finalNodeId, socketId: finalSocketId },
        operation,
        channel,
      };
    } catch (e: any) {
      onLog?.(`Intent inference failed, using defaults. (${e?.message || String(e)})`);
      return null;
    }
  }

  async inferAssetRequest(
    userPrompt: string,
    onLog?: (msg: string) => void
  ): Promise<{
    assetName: string;
    apply: boolean;
    applyPlan?: {
      target: { nodeId: string; socketId: string };
      operation: 'multiply' | 'replace';
      channel: 'rgba' | 'rgb' | 'r' | 'g' | 'b' | 'a';
    };
  } | null> {
    const ai = this.createClient();
    if (!ai) {
      onLog?.('Missing Gemini API key (VITE_GEMINI_API_KEY).');
      return null;
    }

    const prompt = String(userPrompt || '').trim();
    if (!prompt) return null;

    const instruction = [
      'You are helping a node-based shader editor.',
      'Task: interpret a user command that adds an uploaded image as a reusable texture asset.',
      'Return ONLY valid JSON, no markdown.',
      '',
      'Output JSON schema:',
      '{',
      '  "assetName": string,',
      '  "apply": boolean,',
      '  "applyPlan"?: {',
      '    "target": { "nodeId": "output", "socketId": one of ["color","alpha","normal","specular","smoothness","occlusion","emission"] },',
      '    "operation": "multiply" | "replace",',
      '    "channel": one of ["rgba","rgb","r","g","b","a"]',
      '  }',
      '}',
      '',
      'Rules:',
      '- assetName: short, filesystem-like token, lowercase, use dashes, no spaces. Example: "crystal-base".',
      '- If the user indicates a destination (e.g., "para el base color", "for alpha", "as normal map"), treat that as apply=true and fill applyPlan.',
      '- If user explicitly asks to apply/use/connect it now, set apply=true and fill applyPlan.',
      '- If user only says to save/add to library and does NOT imply usage, apply=false.',
      '- If user says base/albedo/color -> target.socketId="color" operation="multiply" channel="rgba".',
      '- If alpha/opacity/mask -> target.socketId="alpha" operation="replace" channel="a" unless user says multiply.',
      '- If normal/normalmap/bump -> target.socketId="normal" operation="replace" channel="rgba".',
      '- If specular -> target.socketId="specular" operation="replace" channel="r".',
      '- If roughness -> target.socketId="smoothness" operation="replace" channel="r" (assume already smoothness map unless told otherwise).',
      '',
      'User request:',
      prompt,
    ].join('\n');

    onLog?.('Inferring asset intent (name + optional apply)...');

    try {
      const result = await ai.models.generateContent({
        model: this.modelId,
        contents: [{ role: 'user', parts: [{ text: instruction }] }],
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: this.thinkingConfig,
        },
      } as any);

      const candidate = (result as any)?.candidates?.[0] || (result as any)?.response?.candidates?.[0];
      const parts: any[] = candidate?.content?.parts || [];
      const text = parts
        .filter((p: any) => p && !p.thought && p.text)
        .map((p: any) => String(p.text))
        .join('')
        .trim();

      if (!text) return null;
      const json = this.safeJsonParse(text);

      const rawName = String(json?.assetName || '').trim().toLowerCase();
      const assetName = rawName
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'asset';

      const apply = Boolean(json?.apply) || Boolean(json?.applyPlan);
      if (!apply) return { assetName, apply: false };

      const plan = json?.applyPlan;
      const socketId = String(plan?.target?.socketId || 'color');
      const allowedSockets = new Set(['color', 'alpha', 'normal', 'specular', 'smoothness', 'occlusion', 'emission']);
      const finalSocketId = allowedSockets.has(socketId) ? socketId : 'color';
      const nodeId = String(plan?.target?.nodeId || 'output') || 'output';
      const operation = (plan?.operation === 'replace' ? 'replace' : 'multiply') as 'multiply' | 'replace';
      const channel = (["rgba", "rgb", "r", "g", "b", "a"].includes(plan?.channel) ? plan.channel : 'rgba') as any;

      return {
        assetName,
        apply: true,
        applyPlan: {
          target: { nodeId, socketId: finalSocketId },
          operation,
          channel,
        },
      };
    } catch (e: any) {
      onLog?.(`Asset intent inference failed, using defaults. (${e?.message || String(e)})`);
      return null;
    }
  }

  async inferEditAssetTarget(
    userPrompt: string,
    assets: Array<{ id: string; name: string }>,
    chatContext?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    onLog?: (msg: string) => void
  ): Promise<{ assetId: string } | null> {
    const ai = this.createClient();
    if (!ai) {
      onLog?.('Missing Gemini API key (VITE_GEMINI_API_KEY).');
      return null;
    }

    const prompt = String(userPrompt || '').trim();
    if (!prompt) return null;

    const safeAssets = (Array.isArray(assets) ? assets : [])
      .filter(a => a && a.id && a.name)
      .slice(0, 50)
      .map(a => ({ id: String(a.id), name: String(a.name) }));

    const safeChat = (Array.isArray(chatContext) ? chatContext : [])
      .filter(m => m && m.role && typeof m.content === 'string')
      .slice(-12)
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 500) }));

    if (safeAssets.length === 0) return null;

    const instruction = [
      'You are helping a node-based shader editor.',
      'Task: choose which existing texture asset the user most likely wants to EDIT.',
      'Return ONLY valid JSON, no markdown.',
      '',
      'Output JSON schema:',
      '{ "assetId": string }',
      '',
      'Rules:',
      '- Pick exactly one assetId from the provided asset list.',
      '- Prefer assets whose name matches words in the user request (Spanish/English).',
      '- If user says "último"/"latest" pick the most recent (the list is ordered most-recent last).',
      '- If unsure, pick the most relevant by name; never invent IDs.',
      '- Use CHAT_CONTEXT to resolve pronouns and references like "esa", "la del vidrio", "la anterior".',
      '',
      'CHAT_CONTEXT (most recent last):',
      JSON.stringify(safeChat),
      '',
      'ASSET_LIST (ordered oldest -> newest):',
      JSON.stringify(safeAssets),
      '',
      'USER_REQUEST:',
      prompt,
    ].join('\n');

    onLog?.('Inferring which asset to edit...');

    try {
      const result = await ai.models.generateContent({
        model: this.modelId,
        contents: [{ role: 'user', parts: [{ text: instruction }] }],
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: this.thinkingConfig,
        },
      } as any);

      const candidate = (result as any)?.candidates?.[0] || (result as any)?.response?.candidates?.[0];
      const parts: any[] = candidate?.content?.parts || [];
      const text = parts
        .filter((p: any) => p && !p.thought && p.text)
        .map((p: any) => String(p.text))
        .join('')
        .trim();

      if (!text) return null;
      const json = this.safeJsonParse(text);
      const assetId = String(json?.assetId || '').trim();
      if (!assetId) return null;

      const isValid = safeAssets.some(a => a.id === assetId);
      if (!isValid) return null;

      return { assetId };
    } catch (e: any) {
      onLog?.(`Asset selection inference failed. (${e?.message || String(e)})`);
      return null;
    }
  }

  /**
   * Generates a texture image (data URL) using Gemini native image generation.
   * If referenceImageDataUrl is an image/* data URL, it will be provided as an input.
   */
  async generateTextureDataUrl(
    prompt: string,
    referenceImageDataUrl?: string,
    onLog?: (msg: string) => void
  ): Promise<{ dataUrl: string; mimeType: string; text?: string } | null> {
    const ai = this.createClient();
    if (!ai) {
      onLog?.('Missing Gemini API key (VITE_GEMINI_API_KEY).');
      return null;
    }

    const parts: any[] = [];

    // Optional reference image conditioning
    const ref = referenceImageDataUrl && referenceImageDataUrl.startsWith('data:image/')
      ? this.parseDataUrl(referenceImageDataUrl)
      : null;
    if (ref) {
      parts.push({ inlineData: { mimeType: ref.mimeType, data: this.cleanBase64(ref.data) } });
    }

    const userPrompt = String(prompt || '').trim();
    const guidance =
      'Generate a seamless, tileable texture for use in a real-time shader. ' +
      'Avoid obvious borders/frames, keep details evenly distributed. ' +
      'Return an IMAGE.';

    parts.push({ text: userPrompt ? `${guidance}\n\nTEXTURE_BRIEF: ${userPrompt}` : guidance });

    onLog?.(`Generating texture via ${this.imageModelId}...`);

    const result = await ai.models.generateContent({
      model: this.imageModelId,
      contents: [{ role: 'user', parts }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    } as any);

    const candidate = (result as any)?.candidates?.[0] || (result as any)?.response?.candidates?.[0];
    const responseParts: any[] = candidate?.content?.parts || [];

    const text = responseParts
      .filter((p: any) => p && p.text)
      .map((p: any) => String(p.text))
      .join('')
      .trim();

    const imagePart = responseParts.find((p: any) => p && p.inlineData && p.inlineData.data);
    const mimeType = imagePart?.inlineData?.mimeType || 'image/png';
    const data = imagePart?.inlineData?.data;

    if (!data) {
      onLog?.('Gemini did not return image data.');
      return null;
    }

    const dataUrl = `data:${mimeType};base64,${data}`;
    onLog?.('Texture generated.');
    return { dataUrl, mimeType, ...(text ? { text } : {}) };
  }

  /**
   * Edits an existing texture image using Gemini native image generation.
   * Uses the provided sourceImageDataUrl as reference conditioning.
   */
  async editTextureDataUrl(
    editPrompt: string,
    sourceImageDataUrl: string,
    onLog?: (msg: string) => void
  ): Promise<{ dataUrl: string; mimeType: string; text?: string } | null> {
    const ai = this.createClient();
    if (!ai) {
      onLog?.('Missing Gemini API key (VITE_GEMINI_API_KEY).');
      return null;
    }

    const src = sourceImageDataUrl && sourceImageDataUrl.startsWith('data:image/')
      ? this.parseDataUrl(sourceImageDataUrl)
      : null;
    if (!src) {
      onLog?.('Edit failed: source image must be an image/* data URL.');
      return null;
    }

    const prompt = String(editPrompt || '').trim();
    if (!prompt) return null;

    const parts: any[] = [
      { inlineData: { mimeType: src.mimeType, data: this.cleanBase64(src.data) } },
      {
        text:
          'Edit the provided texture image according to the instructions. ' +
          'Preserve overall style and keep it seamless/tileable for use in a real-time shader. ' +
          'Return an IMAGE.\n\nEDIT_INSTRUCTIONS: ' +
          prompt,
      },
    ];

    onLog?.(`Editing texture via ${this.imageModelId}...`);

    const result = await ai.models.generateContent({
      model: this.imageModelId,
      contents: [{ role: 'user', parts }],
      config: { responseModalities: ['TEXT', 'IMAGE'] },
    } as any);

    const candidate = (result as any)?.candidates?.[0] || (result as any)?.response?.candidates?.[0];
    const responseParts: any[] = candidate?.content?.parts || [];

    const text = responseParts
      .filter((p: any) => p && p.text)
      .map((p: any) => String(p.text))
      .join('')
      .trim();

    const imagePart = responseParts.find((p: any) => p && p.inlineData && p.inlineData.data);
    const mimeType = imagePart?.inlineData?.mimeType || 'image/png';
    const data = imagePart?.inlineData?.data;

    if (!data) {
      onLog?.('Gemini did not return image data.');
      return null;
    }

    const dataUrl = `data:${mimeType};base64,${data}`;
    onLog?.('Texture edited.');
    return { dataUrl, mimeType, ...(text ? { text } : {}) };
  }

  private safeJsonParse(text: string): any {
    const trimmed = String(text || '').trim();
    if (!trimmed) throw new Error('Empty JSON text');

    // Strip common Markdown fences
    const noFences = trimmed
      .replace(/^```(json)?/i, '')
      .replace(/```$/i, '')
      .trim();

    try {
      return JSON.parse(noFences);
    } catch {
      // Try extracting the first {...} or [...] block
      const firstObj = noFences.indexOf('{');
      const lastObj = noFences.lastIndexOf('}');
      if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
        return JSON.parse(noFences.slice(firstObj, lastObj + 1));
      }
      const firstArr = noFences.indexOf('[');
      const lastArr = noFences.lastIndexOf(']');
      if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
        return JSON.parse(noFences.slice(firstArr, lastArr + 1));
      }
      throw new Error('Invalid JSON');
    }
  }

  private normalizeGraph(raw: any): { nodes: any[]; connections: any[] } | null {
    if (!raw || typeof raw !== 'object') return null;

    const nodesRaw = Array.isArray((raw as any).nodes) ? (raw as any).nodes : [];
    const connsRaw = Array.isArray((raw as any).connections)
      ? (raw as any).connections
      : Array.isArray((raw as any).edges)
        ? (raw as any).edges
        : [];

    const nodes = nodesRaw
      .filter((n: any) => n && typeof n === 'object')
      .map((n: any, idx: number) => {
        const id = String(n.id ?? `n${idx + 1}`);
        const type = String(n.type ?? 'float');
        const x = typeof n.x === 'number' ? n.x : (idx * 220);
        const y = typeof n.y === 'number' ? n.y : 0;
        const data = (n.data && typeof n.data === 'object') ? n.data : undefined;

        // Normalize scalar value hints
        const dataValue = (n.dataValue !== undefined)
          ? n.dataValue
          : (n.initialValue !== undefined)
            ? n.initialValue
            : (data && (data as any).value !== undefined)
              ? (data as any).value
              : undefined;

        return { id, type, x, y, ...(data ? { data } : {}), ...(dataValue !== undefined ? { dataValue } : {}) };
      });

    const connections = connsRaw
      .filter((c: any) => c && typeof c === 'object')
      .map((c: any, idx: number) => {
        // Accept both Lumina connections and Agent2 edge format.
        if (c.from && c.to) {
          return {
            id: c.id || `conn-${idx}-${Math.random().toString(36).slice(2)}`,
            sourceNodeId: c.from.node,
            sourceSocketId: c.from.port,
            targetNodeId: c.to.node,
            targetSocketId: c.to.port,
          };
        }
        return {
          id: c.id || `conn-${idx}-${Math.random().toString(36).slice(2)}`,
          sourceNodeId: c.sourceNodeId,
          sourceSocketId: c.sourceSocketId,
          targetNodeId: c.targetNodeId,
          targetSocketId: c.targetSocketId,
        };
      });

    return { nodes, connections };
  }

  private inferRequiredMasterInputs(prompt: string): string[] {
    const text = String(prompt || '').toLowerCase();
    const required = new Set<string>();

    // Default minimal output.
    required.add('color');

    // Transparency / cutout
    if (/(alpha\b|opacity|transparent|transparente|cutout|clip|recorte|mask|mascara)/i.test(text)) {
      required.add('alpha');
      if (/(clip|cutout|recorte)/i.test(text)) required.add('alphaClip');
    }

    // Emission / glow
    if (/(emiss|emision|glow|brill|neon|lumin)/i.test(text)) required.add('emission');

    // Normals / relief / parallax
    if (/(normal\s*map|normalmap|bump|relieve|relief|parallax|height\s*map|heightmap|displace|displacement)/i.test(text)) {
      required.add('normal');
    }

    // Ambient occlusion
    if (/(ao\b|ambient\s*occlusion|occlusion|oclusion)/i.test(text)) required.add('occlusion');

    // Specular / smoothness / roughness
    if (/(specular|especular|gloss|glossiness|smoothness|suavidad|roughness|rugosidad)/i.test(text)) {
      // Lumina master uses smoothness, not roughness.
      required.add('smoothness');
      // If user explicitly asks for specular highlights/control.
      if (/(specular|especular)/i.test(text)) required.add('specular');
    }

    return Array.from(required);
  }

  private buildSoftwareContext(currentNodes: ShaderNode[], currentConnections: Connection[], prompt?: string): string {
    // Keep the current graph snapshot compact to avoid blowing up context.
    const snapshot = {
      nodes: currentNodes.map(n => ({ id: n.id, type: n.type, x: Math.round(n.x), y: Math.round(n.y), data: n.data })),
      connections: currentConnections.map(c => ({
        sourceNodeId: c.sourceNodeId,
        sourceSocketId: c.sourceSocketId,
        targetNodeId: c.targetNodeId,
        targetSocketId: c.targetSocketId,
      })),
    };

    const outputDef = getNodeModule('output')?.definition;
    const vertexDef = getNodeModule('vertex')?.definition;
    const outputInputs = (outputDef?.inputs || []).map(i => `${i.id}(${i.type})`).join(', ');
    const vertexOutputs = (vertexDef?.outputs || []).map(o => `${o.id}(${o.type})`).join(', ');

    const requiredMasterInputs = this.inferRequiredMasterInputs(prompt || '');

    return [
      'SOFTWARE_CONTEXT: Lumina Shader Graph (lumina-shader-graph)',
      '',
      'AUTHORITATIVE OUTPUT FORMAT (MUST FOLLOW):',
      '- Output ONLY valid JSON (no markdown, no comments).',
      '- Root: { "nodes": [...], "connections": [...] }',
      '- node fields required: id(string), type(string), x(number), y(number)',
      '- node optional fields: data(object), dataValue(any)',
      '- connection fields required: sourceNodeId, sourceSocketId, targetNodeId, targetSocketId (strings)',
      '- connection optional: id(string)',
      '',
      'RAW APP GRAPH SHAPE (REFERENCE — DO NOT EMIT THESE EXTRA FIELDS):',
      '- Internally, the app stores ShaderNode as:',
      '  { id, type, label, x, y, inputs:[{id,label,type}], outputs:[{id,label,type}], data:{...} }',
      '- Your JSON output must be the MINIMAL graph shape above; the app derives label/inputs/outputs from node.type.',
      '',
      'CANONICAL MINIMAL EXAMPLE (VALID OUTPUT SHAPE):',
      '{"nodes":[{"id":"vertex","type":"vertex","x":800,"y":150},{"id":"output","type":"output","x":800,"y":450},{"id":"float-1","type":"float","x":400,"y":450,"data":{"value":0.5}}],"connections":[{"sourceNodeId":"float-1","sourceSocketId":"out","targetNodeId":"output","targetSocketId":"color"}]}',
      '',
      'NODE DATA BINDINGS (IMPORTANT):',
      '- color node: set data.value as a hex string "#RRGGBB" (example: {"type":"color","data":{"value":"#ff00aa"}}).',
      '- float node: set data.value as a number (example: {"type":"float","data":{"value":0.25}}).',
      '- constant node: set data.constant as one of: PI, TAU, PHI, E, SQRT2.',
      '- Do NOT rely on defaults when the value matters (e.g., gradients must use distinct non-white colors).',
      '',
      'IMPORTANT COMPATIBILITY CONSTRAINTS:',
      '- DO NOT invent node types or socket ids; only use what is listed in AVAILABLE_NODES.',
      '- Ensure every connection references existing nodes.',
      '- Prefer left->right flow: sources at smaller x, sinks at larger x.',
      `- MASTER SOCKET IDS (authoritative): output.inputs=[${outputInputs || 'unknown'}]; vertex.outputs=[${vertexOutputs || 'unknown'}]`,
      '- MASTER OUTPUT MINIMALISM: only connect the output inputs that are required by the user request.',
      '  - Default: connect ONLY output.color.',
      '  - Do NOT connect alpha/alphaClip/normal/emission/occlusion/specular/smoothness unless explicitly needed.',
      '  - Do NOT add constant nodes just to fill unused master inputs.',
      `- REQUIRED_MASTER_INPUTS (derived from user prompt): ${requiredMasterInputs.map(s => `output.${s}`).join(', ')}`,
      '- Include master nodes with stable ids:',
      '  - vertex node: { id: "vertex", type: "vertex" }',
      '  - output node: { id: "output", type: "output" }',
      '',
      'AVAILABLE_NODES (type: Inputs[...] -> Outputs[...]):',
      this.definitions,
      '',
      'CURRENT_GRAPH_SNAPSHOT (for modification tasks):',
      JSON.stringify(snapshot),
    ].join('\n');
  }

  private sanitizeGraph(rawData: any): {
    graph: { nodes: any[]; connections: any[] } | null;
    report: {
      changed: boolean;
      issues: string[];
      examples: string[];
      stats: Record<string, number>;
      final: { nodeCount: number; connectionCount: number };
    };
  } {
    const issues: string[] = [];
    const examples: string[] = [];
    const exampleLimit = 16;
    const pushExample = (msg: string) => {
      if (examples.length >= exampleLimit) return;
      if (!msg) return;
      examples.push(String(msg));
    };
    const stats: Record<string, number> = {
      nodes_in: 0,
      connections_in: 0,
      nodes_unknownType_removed: 0,
      nodes_id_renamed: 0,
      nodes_master_added: 0,
      nodes_master_conflict_renamed: 0,
      connections_invalid_removed: 0,
      connections_trimmed_by_maxIncoming: 0,
      nodes_pruned_unreachable: 0,
    };

    const normalized = this.normalizeGraph(rawData);
    if (!normalized) {
      return {
        graph: null,
        report: { changed: false, issues: ['sanitizeGraph: input did not contain a valid {nodes, connections/edges} object.'], examples, stats, final: { nodeCount: 0, connectionCount: 0 } },
      };
    }

    stats.nodes_in = normalized.nodes.length;
    stats.connections_in = normalized.connections.length;

    // Filter unknown types to reduce crashes.
    const allowedTypes = new Set<string>([...ALL_NODE_TYPES, 'output', 'vertex']);
    const sanitizedNodes = normalized.nodes
      .filter(n => {
        const ok = allowedTypes.has(n.type);
        if (!ok) {
          stats.nodes_unknownType_removed++;
          pushExample(`Removed node id=${String(n.id)} type=${String(n.type)} (unknown type)`);
        }
        return ok;
      })
      .map(n => ({
        id: String(n.id),
        type: String(n.type),
        x: typeof n.x === 'number' ? n.x : 0,
        y: typeof n.y === 'number' ? n.y : 0,
        ...(n.data ? { data: n.data } : {}),
        ...(n.dataValue !== undefined ? { dataValue: n.dataValue } : {}),
      }));

    if (stats.nodes_unknownType_removed > 0) {
      issues.push(`Removed ${stats.nodes_unknownType_removed} node(s) with unknown type.`);
    }

    // Ensure IDs are unique; resolve collisions deterministically.
    const usedIds = new Set<string>();
    for (const node of sanitizedNodes) {
      const base = node.id;
      if (!usedIds.has(base)) {
        usedIds.add(base);
        continue;
      }
      let i = 2;
      while (usedIds.has(`${base}-${i}`)) i++;
      node.id = `${base}-${i}`;
      usedIds.add(node.id);
      stats.nodes_id_renamed++;
      pushExample(`Renamed duplicate node id "${base}" -> "${node.id}"`);
    }

    if (stats.nodes_id_renamed > 0) {
      issues.push(`Renamed ${stats.nodes_id_renamed} node id(s) to resolve duplicates.`);
    }

    // Ensure master node IDs exist AND match expected types.
    const renameIfOccupiedByWrongType = (id: string, requiredType: string) => {
      const existing = sanitizedNodes.find(n => n.id === id);
      if (!existing) return;
      if (existing.type === requiredType) return;

      // Rename the conflicting node to avoid breaking preview lookups.
      const base = `${existing.type}-${id}`;
      let i = 1;
      let next = `${base}-${i}`;
      while (usedIds.has(next)) {
        i++;
        next = `${base}-${i}`;
      }
      usedIds.delete(existing.id);
      const before = existing.id;
      existing.id = next;
      usedIds.add(existing.id);
      stats.nodes_master_conflict_renamed++;
      pushExample(`Renamed node occupying reserved id "${id}" (type=${existing.type}) from "${before}" -> "${existing.id}"`);
    };

    renameIfOccupiedByWrongType('vertex', 'vertex');
    renameIfOccupiedByWrongType('output', 'output');

    if (stats.nodes_master_conflict_renamed > 0) {
      issues.push(`Renamed ${stats.nodes_master_conflict_renamed} node(s) that conflicted with reserved master ids ('vertex'/'output').`);
    }

    const ensureNode = (id: string, type: string, x: number, y: number) => {
      if (!sanitizedNodes.some(n => n.id === id)) {
        sanitizedNodes.push({ id, type, x, y });
        stats.nodes_master_added++;
        pushExample(`Added missing master node id="${id}" type="${type}"`);
      }
    };

    // Ensure master nodes exist with stable IDs.
    ensureNode('vertex', 'vertex', 800, 150);
    ensureNode('output', 'output', 800, 450);

    if (stats.nodes_master_added > 0) {
      issues.push(`Added ${stats.nodes_master_added} missing master node(s) ('vertex'/'output').`);
    }

    const nodeById = new Map(sanitizedNodes.map(n => [n.id, n]));

    const normalizeToken = (value: string) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');

    const resolveSocketId = (
      rawSocketId: any,
      sockets: Array<{ id: string; label?: string }> | undefined,
      fallbackId: string | undefined,
      nodeType: string,
      direction: 'input' | 'output'
    ): { id: string | undefined; changed: boolean; reason?: string } => {
      const list = Array.isArray(sockets) ? sockets : [];
      const requested = rawSocketId !== undefined && rawSocketId !== null ? String(rawSocketId) : '';
      if (!requested) return { id: fallbackId, changed: Boolean(fallbackId), reason: 'missing' };

      // Fast path: exact id match
      if (list.some(s => s.id === requested)) return { id: requested, changed: false };

      const reqNorm = normalizeToken(requested);

      // A few practical aliases for common hallucinations / labels.
      // This specifically fixes historical "Base Context" connections to the master output.
      if (nodeType === 'output' && direction === 'input') {
        const outputAliases: Record<string, string> = {
          basecontext: 'color',
          surface: 'color',
          basecolor: 'color',
          albedo: 'color',
          roughness: 'smoothness',
          opacity: 'alpha',
          alphaclip: 'alphaClip',
          ao: 'occlusion',
        };
        const aliased = outputAliases[reqNorm];
        if (aliased && list.some(s => s.id === aliased)) {
          return { id: aliased, changed: true, reason: `alias:${requested}` };
        }
      }

      // Heuristic: match by normalized id
      const byNormId = list.find(s => normalizeToken(s.id) === reqNorm);
      if (byNormId) return { id: byNormId.id, changed: true, reason: `normId:${requested}` };

      // Heuristic: match by normalized label
      const byNormLabel = list.find(s => s.label && normalizeToken(s.label) === reqNorm);
      if (byNormLabel) return { id: byNormLabel.id, changed: true, reason: `label:${requested}` };

      // Heuristic: label contains token (or vice-versa)
      const byContains = list.find(s => {
        const lid = normalizeToken(s.id);
        const ll = s.label ? normalizeToken(s.label) : '';
        return (ll && (ll.includes(reqNorm) || reqNorm.includes(ll))) || (lid && (lid.includes(reqNorm) || reqNorm.includes(lid)));
      });
      if (byContains) return { id: byContains.id, changed: true, reason: `contains:${requested}` };

      return { id: fallbackId, changed: Boolean(fallbackId), reason: `fallback:${requested}` };
    };

    let sanitizedConnections = normalized.connections
      .map((conn: any) => {
        const connLabel = `${String(conn.sourceNodeId)}.${String(conn.sourceSocketId ?? '?')} -> ${String(conn.targetNodeId)}.${String(conn.targetSocketId ?? '?')}`;
        const sourceNode = nodeById.get(conn.sourceNodeId);
        const targetNode = nodeById.get(conn.targetNodeId);
        if (!sourceNode || !targetNode) {
          stats.connections_invalid_removed++;
          pushExample(`Removed connection ${connLabel} (missing node)`);
          return null;
        }

        const sourceMod = getNodeModule(sourceNode.type);
        const targetMod = getNodeModule(targetNode.type);
        const sourceDef = sourceMod?.definition;
        const targetDef = targetMod?.definition;
        if (!sourceDef || !targetDef) {
          stats.connections_invalid_removed++;
          pushExample(`Removed connection ${connLabel} (missing node definition)`);
          return null;
        }

        const sourceFallback = getFallbackSocketId({ ...(sourceDef as any), id: sourceNode.id, x: 0, y: 0, data: {} } as any, 'output', sourceMod?.socketRules);
        const targetFallback = getFallbackSocketId({ ...(targetDef as any), id: targetNode.id, x: 0, y: 0, data: {} } as any, 'input', targetMod?.socketRules);

        const sourceResolved = resolveSocketId(
          conn.sourceSocketId,
          sourceDef.outputs as any,
          sourceFallback || sourceDef.outputs[0]?.id,
          sourceNode.type,
          'output'
        );
        const targetResolved = resolveSocketId(
          conn.targetSocketId,
          targetDef.inputs as any,
          targetFallback || targetDef.inputs[0]?.id,
          targetNode.type,
          'input'
        );

        const sourceSocketId = sourceResolved.id;
        const targetSocketId = targetResolved.id;
        if (!sourceSocketId || !targetSocketId) {
          stats.connections_invalid_removed++;
          pushExample(`Removed connection ${connLabel} (missing socket id)`);
          return null;
        }

        if (sourceResolved.changed) {
          pushExample(`Adjusted source socket ${sourceNode.id}: "${String(conn.sourceSocketId)}" -> "${sourceSocketId}" (${sourceResolved.reason})`);
        }
        if (targetResolved.changed) {
          pushExample(`Adjusted target socket ${targetNode.id}: "${String(conn.targetSocketId)}" -> "${targetSocketId}" (${targetResolved.reason})`);
        }

        return {
          id: conn.id || `conn-${Math.random().toString(36).slice(2)}`,
          sourceNodeId: sourceNode.id,
          sourceSocketId,
          targetNodeId: targetNode.id,
          targetSocketId,
        };
      })
      .filter(Boolean);

    if (stats.connections_invalid_removed > 0) {
      issues.push(`Removed ${stats.connections_invalid_removed} invalid connection(s) (missing nodes/defs/sockets).`);
    }

    // Enforce per-input maxConnections to avoid "two outputs into one input" errors.
    // Default is 1 unless socketRules overrides it.
    const tempNodes: ShaderNode[] = sanitizedNodes.map(n => {
      const mod = getNodeModule(n.type);
      const def = mod?.definition;
      return {
        id: n.id,
        type: n.type,
        label: def?.label || n.type,
        x: n.x,
        y: n.y,
        inputs: def?.inputs || [],
        outputs: def?.outputs || [],
        data: { ...(n.data || {}), ...(n.dataValue !== undefined ? { value: n.dataValue } : {}) },
      } as ShaderNode;
    });
    const tempById = new Map(tempNodes.map(n => [n.id, n]));

    const getMaxIncoming = (targetNodeId: string, targetSocketId: string): number => {
      const node = tempById.get(targetNodeId);
      if (!node) return 1;
      const mod = getNodeModule(node.type);
      const def = mod?.definition as any;
      if (!def) return 1;
      try {
        const effectiveInputs = getEffectiveSockets(node, def.inputs ?? [], 'input', sanitizedConnections as any, mod?.socketRules);
        const socket = effectiveInputs.find(s => s.id === targetSocketId);
        return socket?.maxConnections ?? 1;
      } catch {
        return 1;
      }
    };

    // Sort by source.x so we keep the most left-to-right plausible wire first.
    sanitizedConnections = (sanitizedConnections as any[])
      .map((c, idx) => ({ c, idx }))
      .sort((a, b) => {
        const aSourceX = (nodeById.get(a.c.sourceNodeId)?.x ?? 0);
        const bSourceX = (nodeById.get(b.c.sourceNodeId)?.x ?? 0);
        if (a.c.targetNodeId !== b.c.targetNodeId) return a.c.targetNodeId.localeCompare(b.c.targetNodeId);
        if (a.c.targetSocketId !== b.c.targetSocketId) return a.c.targetSocketId.localeCompare(b.c.targetSocketId);
        if (aSourceX !== bSourceX) return aSourceX - bSourceX;
        return a.idx - b.idx;
      })
      .reduce((acc: any[], item) => {
        const c = item.c;
        const key = `${c.targetNodeId}::${c.targetSocketId}`;
        const max = getMaxIncoming(c.targetNodeId, c.targetSocketId);
        const current = acc.filter(x => `${x.targetNodeId}::${x.targetSocketId}` === key).length;
        if (current < max) {
          acc.push(c);
        } else {
          stats.connections_trimmed_by_maxIncoming++;
          pushExample(`Trimmed extra incoming to ${c.targetNodeId}.${c.targetSocketId}: removed ${c.sourceNodeId}.${c.sourceSocketId} (max=${max})`);
        }
        return acc;
      }, []);

    if (stats.connections_trimmed_by_maxIncoming > 0) {
      issues.push(`Trimmed ${stats.connections_trimmed_by_maxIncoming} connection(s) that exceeded input maxConnections.`);
    }

    // Prune unreachable nodes (orphans/dead subgraphs) to keep output graph stable.
    // IMPORTANT: If output has no incoming connections, pruning would delete the entire work-in-progress graph
    // (leaving only masters) and looks like a scene reset. In that case, keep all sanitized nodes.
    const outputHasIncoming = (sanitizedConnections as any[]).some(c => c && c.targetNodeId === 'output');

    let prunedNodes = sanitizedNodes;
    let prunedConnections = sanitizedConnections as any[];

    if (outputHasIncoming) {
      // Keep anything that contributes to 'output' (and always keep masters).
      const keep = new Set<string>(['output', 'vertex']);
      const incomingByTarget = new Map<string, any[]>();
      for (const c of sanitizedConnections as any[]) {
        const key = c.targetNodeId;
        const arr = incomingByTarget.get(key) || [];
        arr.push(c);
        incomingByTarget.set(key, arr);
      }

      const stack: string[] = ['output', 'vertex'];
      while (stack.length > 0) {
        const nodeId = stack.pop()!;
        const incomings = incomingByTarget.get(nodeId) || [];
        for (const c of incomings) {
          const src = String(c.sourceNodeId);
          if (!keep.has(src)) {
            keep.add(src);
            stack.push(src);
          }
        }
      }

      prunedNodes = sanitizedNodes.filter(n => keep.has(n.id));
      stats.nodes_pruned_unreachable = sanitizedNodes.length - prunedNodes.length;
      if (stats.nodes_pruned_unreachable > 0) {
        issues.push(`Pruned ${stats.nodes_pruned_unreachable} unreachable/orphan node(s) (not contributing to output).`);
        const prunedSample = sanitizedNodes
          .filter(n => !keep.has(n.id))
          .slice(0, 6)
          .map(n => `${n.id}(${n.type})`);
        if (prunedSample.length > 0) {
          pushExample(`Pruned unreachable nodes: ${prunedSample.join(', ')}${stats.nodes_pruned_unreachable > prunedSample.length ? ', ...' : ''}`);
        }
      }
      const prunedNodeIds = new Set(prunedNodes.map(n => n.id));
      prunedConnections = (sanitizedConnections as any[]).filter(c => prunedNodeIds.has(c.sourceNodeId) && prunedNodeIds.has(c.targetNodeId));
    }

    const changed =
      stats.nodes_unknownType_removed > 0 ||
      stats.nodes_id_renamed > 0 ||
      stats.nodes_master_added > 0 ||
      stats.nodes_master_conflict_renamed > 0 ||
      stats.connections_invalid_removed > 0 ||
      stats.connections_trimmed_by_maxIncoming > 0 ||
      stats.nodes_pruned_unreachable > 0;

    const finalGraph = { nodes: prunedNodes, connections: prunedConnections };
    return {
      graph: finalGraph,
      report: {
        changed,
        issues,
        examples,
        stats,
        final: { nodeCount: prunedNodes.length, connectionCount: prunedConnections.length },
      },
    };
  }

  async refineGraph(draftGraph: any, linterLogs: string[], onLog?: (msg: string) => void, evidenceImageBase64?: string): Promise<any | null> {
    const ai = this.createClient();
    if (!ai) return null;
    if (linterLogs.length === 0 && !evidenceImageBase64) return draftGraph;
    if (onLog) onLog("Initializing Refining Agent (Thinking Mode)...");
    const systemInstruction = this.buildRefineSystemInstruction();

    try {
      let parts: any[] = [];
      if (evidenceImageBase64) {
        parts.push({ inlineData: { mimeType: "image/png", data: this.cleanBase64(evidenceImageBase64) } });
      }
      parts.push({ text: `Fix this graph:\n${JSON.stringify(draftGraph)}\n\nErrors:\n${linterLogs.join('\n')}` });

      if (onLog) onLog("Thinking (Repairing)...");
      const text = await this.generateContentText(ai, {
        model: this.modelId,
        contents: parts,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        config: {
          responseMimeType: "application/json",
          thinkingConfig: this.thinkingConfig,
        }
      }, onLog);
      if (!text) return draftGraph;
      const fixed = this.safeJsonParse(text);
      if (onLog) onLog("Graph refined.");
      const sanitized = this.sanitizeGraph(fixed);
      if (onLog && sanitized.report.changed) {
        onLog(`Sanitizer: ${sanitized.report.issues.join(' | ')}`);
        if (sanitized.report.examples.length > 0) {
          const preview = sanitized.report.examples.slice(0, 3);
          const extra = sanitized.report.examples.length - preview.length;
          onLog(`Sanitizer examples: ${preview.join(' | ')}${extra > 0 ? ` (+${extra} more)` : ''}`);
        }
        onLog(`Sanitizer final: nodes=${sanitized.report.final.nodeCount}, connections=${sanitized.report.final.connectionCount}`);
      }
      return sanitized.graph || draftGraph;
    } catch (e) {
      if (onLog) onLog(`Refining failed: ${e}`);
      return draftGraph;
    }
  }

  async generateOrModifyGraph(
    prompt: string,
    currentNodes: ShaderNode[],
    currentConnections: Connection[],
    imageBase64?: string,
    onLog?: (msg: string) => void,
    onUpdate?: (nodes: any[], conns: any[]) => void,
    onVisualRequest?: (nodeId: string) => Promise<string | null>
  ) {
    const ai = this.createClient();
    if (!ai) return null;

    // One-Shot Pipeline
    try {
      if (onLog) onLog('Initializing Shader Architect (Thinking Mode: High)...');

      const softwareContext = this.buildSoftwareContext(currentNodes, currentConnections, prompt);
      const systemInstruction = this.buildSystemInstruction(softwareContext);

      const mediaParts: any[] = [];
      if (imageBase64) {
        // Simple heuristic to detect if it's a YouTube URL or a base64 Blob
        if (imageBase64.startsWith('http')) {
          mediaParts.push({
            fileData: {
              fileUri: imageBase64
            }
          });
        } else {
          // Detect MimeType from Base64 header if present, else default to image/png
          let mimeType = "image/png";
          const match = imageBase64.match(/^data:([^;]+);base64,/);
          if (match) {
            mimeType = match[1];
          }
          mediaParts.push({
            inlineData: {
              mimeType: mimeType,
              data: this.cleanBase64(imageBase64)
            }
          });
        }
      }

      const parts: any[] = [...mediaParts, { text: `User Prompt: ${prompt}` }];

      if (onLog) onLog('Thinking (Reasoning + Planning + Compiling)...');
      if (onLog) onLog('[RSA] Mode Enabled: loops=1, candidates=3');

      // RSA Loop Implementation
      let currentCandidates: string[] = [];
      const rsaCandidates = 3;

      // Step 1: Generate Initial Candidates (Parallel)
      if (onLog) onLog(`[RSA] Generating ${rsaCandidates} initial candidates...`);

      const candidatePromises = Array(rsaCandidates).fill(0).map((_, i) =>
        this.generateContentText(ai, {
          model: this.modelId,
          contents: parts, // Same prompt for all
          systemInstruction: { parts: [{ text: systemInstruction }] },
          config: {
            responseMimeType: "application/json",
            thinkingConfig: this.thinkingConfig,
            temperature: 0.7 + (i * 0.1) // Varied temperature for diversity
          }
        }, (msg) => onLog ? onLog(`[Candidate ${i + 1}] ${msg}`) : null)
      );

      currentCandidates = await Promise.all(candidatePromises);
      currentCandidates = currentCandidates.filter(c => c && c.length > 10); // Simple validation

      if (currentCandidates.length === 0) {
        throw new Error("RSA failed to generate any valid candidates.");
      }

      // Step 2: Aggregation (Single Loop for Latency/Quality Balance)
      if (onLog) onLog(`[RSA] Aggregating ${currentCandidates.length} candidates into final solution...`);

      // Using the official RSA aggregation prompt structure (adapted from HyperPotatoNeo/RSA/eval_loop.py)
      const aggregationInstructions = currentCandidates.length === 1
        ? [
          `You are given a problem and a candidate solution.`,
          `The candidate may be incomplete or contain errors.`,
          `Refine this trajectory and produce an improved, higher-quality solution.`,
          `If it is entirely wrong, attempt a new strategy.`,
        ]
        : [
          `You are given a problem and several candidate solutions.`,
          `Some candidates may be incorrect or contain errors.`,
          `YOUR TASK: Aggregate the useful ideas ("best genes") and produce a single, high-quality solution.`,
          `Reason carefully; if candidates disagree, choose the correct path. If all are incorrect, attempt a different strategy.`,
        ];

      const aggregationPrompt = [
        ...aggregationInstructions,
        `End with the complete final JSON.`,
        ``,
        `Problem:`,
        `${prompt}`,
        ``,
        `Candidate solutions (may contain mistakes):`,
        ...currentCandidates.map((c, i) => `---- Solution ${i + 1} ----\n${c}\n`),
        ``,
        `Now write a single improved solution. Provide clear reasoning and end with the final JSON.`,
        `IMPORTANT: Output ONLY valid JSON code. No markdown fences.`
      ].join('\n');

      const responseText = await this.generateContentText(ai, {
        model: this.modelId,
        contents: [...mediaParts, { text: aggregationPrompt }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        config: {
          responseMimeType: "application/json",
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.HIGH,
            includeThoughts: true
          },
        },
      }, onLog);

      if (onLog) onLog(`[RSA] Aggregation complete. Response length: ${responseText?.length || 0}`);
      if (onLog && responseText) onLog(`[RSA] Response preview: ${responseText.slice(0, 100).replace(/\n/g, ' ')}...`);

      const graphJson = this.safeJsonParse(responseText);

      // Sanitize Pass 1
      let pass1 = this.sanitizeGraph(graphJson);
      let draft = pass1.graph;

      // Handle simple array output from model if it forgets the wrapper
      if (!draft) {
        const maybeNodes = Array.isArray(graphJson) ? graphJson : null;
        if (maybeNodes) {
          pass1 = this.sanitizeGraph({ nodes: maybeNodes, connections: [] });
          draft = pass1.graph;
        }
      }

      if (!draft) return null;

      this.logGraphSummary('Draft (Architect)', draft, onLog);

      // Report Sanitize issues
      if (onLog && pass1.report.changed) {
        onLog(`Sanitizer: ${pass1.report.issues.join(' | ')}`);
        if (pass1.report.examples.length > 0) {
          const preview = pass1.report.examples.slice(0, 3);
          const extra = pass1.report.examples.length - preview.length;
          onLog(`Sanitizer examples: ${preview.join(' | ')}${extra > 0 ? ` (+${extra} more)` : ''}`);
        }
      }

      // Optional: Self-Correction Loop (if sanitizer made heavy changes)
      // For one-shot, we might skip a full second pass unless critical, but let's keep the logic 
      // if the graph changed significantly, to allow the model to "align" with the rules it missed.
      if (pass1.report.changed) {
        if (onLog) onLog('Architect: Iterating with sanitizer feedback...');

        const feedback = {
          sanitizer_report: pass1.report,
          sanitized_graph: draft,
          instruction: 'The previous graph had structural invalidities. Re-generate the JSON fixes.'
        };

        const out2Text = await this.generateContentText(ai, {
          model: this.modelId,
          contents: [
            { role: 'user', parts },
            { role: 'model', parts: [{ text: responseText }] }, // conversation history
            { role: 'user', parts: [{ text: `SANITIZER_FEEDBACK:\n${JSON.stringify(feedback)}` }] },
          ],
          config: {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            responseMimeType: 'application/json',
            thinkingConfig: this.thinkingConfig,
          },
        }, onLog);

        const out2Json = this.safeJsonParse(out2Text);
        const pass2 = this.sanitizeGraph(out2Json);
        if (pass2.graph) {
          draft = pass2.graph;
          this.logGraphSummary('Draft (Correction)', draft, onLog);
        }
      }

      if (onUpdate) {
        onLog?.('UI Update: draft graph');
        onUpdate([...draft.nodes], [...draft.connections]);
      }

      // Lint + Refining (Phase C preserved)
      const typedNodes = this.convertToShaderNodes(draft.nodes);
      const report = lintGraph(typedNodes, draft.connections as any);
      if (report.length > 0) {
        if (onLog) onLog(`Linter: ${report.length} issue(s). Attempting repair...`);
        const fixed = await this.refineGraph(draft, report, onLog);
        if (fixed) {
          draft = fixed;
          this.logGraphSummary('Draft (Refined)', draft, onLog);
          if (onUpdate) {
            onLog?.('UI Update: repaired graph');
            onUpdate([...(draft.nodes || [])], [...(draft.connections || [])]);
          }
        }
      }

      return draft;
    } catch (e) {
      if (onLog) onLog(`Generation failed: ${e}`);
      return null;
    }
  }

  private convertToShaderNodes(rawNodes: any[]): ShaderNode[] {
    return rawNodes.map(n => {
      const mod = getNodeModule(n.type);
      const def = mod?.definition;
      return {
        id: n.id,
        type: n.type,
        label: def?.label || n.type,
        x: n.x || 0,
        y: n.y || 0,
        inputs: def?.inputs || [],
        outputs: def?.outputs || [],
        data: { ...(n.data || {}), ...(n.dataValue !== undefined ? { value: n.dataValue } : {}) }
      } as ShaderNode;
    });
  }
}

export const geminiService = new GeminiService();
