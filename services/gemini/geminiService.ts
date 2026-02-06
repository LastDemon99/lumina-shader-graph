
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { ShaderNode, Connection, SessionAsset } from "../../types";
import { ALL_NODE_TYPES, getNodeModule } from "../../nodes";
import { lintGraph } from "./linter";
import architectInstructions from "./agent-instructions/shader-architect.md?raw";
import refinerInstructions from "./agent-instructions/shader-refiner.md?raw";
import editorInstructions from "./agent-instructions/shader-editor.md?raw";
import consultantInstructions from "./agent-instructions/shader-consultant.md?raw";
import * as utils from "./utils";

export class GeminiService {
  private modelId = 'gemini-3-flash-preview';
  private imageModelId = 'gemini-2.5-flash-image';

  private persistentEditorChat: any | null = null;
  private persistentEditorChatConfigKey: string | null = null;
  private persistentConsultantChat: any | null = null;
  private persistentConsultantChatConfigKey: string | null = null;
  private persistentBaselineGraph: { nodes: any[]; connections: any[] } | null = null;

  private thinkingConfig = {
    thinkingLevel: ThinkingLevel.HIGH,
    includeThoughts: true
  };

  private baseConfig: any = {
    responseMimeType: 'application/json',
    thinkingConfig: this.thinkingConfig,
  };

  private enableLog: boolean = true;

  private cacheTtlSeconds: number = 21600; // 6h default

  private async getOrCreateCachedPrefix(
    ai: GoogleGenAI,
    cacheKey: string,
    systemInstructionText: string,
    onLog?: (msg: string) => void
  ): Promise<string | null> {
    const storage = utils.getCacheStorage();
    const storageKey = `lumina.gemini.cachedContent:${cacheKey}`;
    const existing = storage?.getItem(storageKey);
    if (existing) return existing;

    try {
      const created = await ai.caches.create({
        model: this.modelId,
        config: {
          displayName: `lumina-shader-graph:${cacheKey}`,
          ttl: `${this.cacheTtlSeconds}s`,
          systemInstruction: { parts: [{ text: systemInstructionText }] },
        },
      } as any);

      const name = (created as any)?.name;
      if (name && storage) storage.setItem(storageKey, String(name));

      const usage = (created as any)?.usageMetadata;
      if (name && onLog) {
        onLog(`Cache: created prefix (${cacheKey}).` + (usage ? ` Tokens: ${usage.totalTokenCount}` : ''));
      }
      return name || null;
    } catch (e: any) {
      onLog?.(`Cache: create failed (${cacheKey}). Continuing without cache. (${e?.message || String(e)})`);
      return null;
    }
  }

  private logUsageMetadata(result: any, onLog?: (msg: string) => void) {
    if (!onLog || !this.enableLog) return;
    const usage = (result as any)?.usageMetadata || (result as any)?.response?.usageMetadata;
    if (!usage) return;

    const prompt = usage.promptTokenCount;
    const out = usage.candidatesTokenCount;
    const total = usage.totalTokenCount;
    const cached = usage.cachedContentTokenCount || 0;
    onLog(
      `Usage: prompt=${prompt ?? '?'} out=${out ?? '?'} total=${total ?? '?'} cachedPrefix=${cached}`
    );
  }

  private async sendChatMessageText(
    chat: any,
    message: any,
    onLog?: (msg: string) => void,
    config?: any
  ): Promise<string> {
    const result = await chat.sendMessage({ message, ...(config ? { config } : {}) } as any);
    this.logUsageMetadata(result, onLog);
    return this.processResponse(result, onLog);
  }

  private async createGraphChat(
    ai: GoogleGenAI,
    agent: 'architect' | 'editor' | 'consultant',
    systemInstruction: string,
    onLog?: (msg: string) => void,
    history?: any[]
  ): Promise<any> {
    const cachedContent = await this.getOrCreateCachedPrefix(
      ai,
      `${agent}:${this.modelId}:${utils.fnv1aHex(systemInstruction)}`,
      systemInstruction,
      onLog
    );

    const chatConfig = cachedContent
      ? { ...this.baseConfig, cachedContent }
      : { ...this.baseConfig, systemInstruction: { parts: [{ text: systemInstruction }] } };

    return (ai as any).chats.create({
      model: this.modelId,
      config: chatConfig,
      ...(Array.isArray(history) && history.length > 0 ? { history } : {}),
    } as any);
  }

  resetPersistentGraphSession() {
    this.persistentEditorChat = null;
    this.persistentEditorChatConfigKey = null;
    this.persistentConsultantChat = null;
    this.persistentConsultantChatConfigKey = null;
  }

  setPersistentGraphBaseline(nodes: ShaderNode[], connections: Connection[]) {
    this.persistentBaselineGraph = utils.toMinimalGraphSnapshot(nodes, connections);
  }

  private getBaselineHistorySeed(): any[] {
    if (!this.persistentBaselineGraph) return [];
    return [
      {
        role: 'model',
        parts: [
          {
            text:
              'GRAPH_BASELINE_JSON (authoritative starting point for subsequent ops):\n' +
              JSON.stringify(this.persistentBaselineGraph),
          },
        ],
      },
    ];
  }

  private async getOrCreatePersistentEditorChat(
    ai: GoogleGenAI,
    systemInstruction: string,
    onLog?: (msg: string) => void
  ): Promise<any> {
    const configKey = `${this.modelId}:editor:cache:${utils.fnv1aHex(systemInstruction)}`;
    if (this.persistentEditorChat && this.persistentEditorChatConfigKey === configKey) {
      return this.persistentEditorChat;
    }
    const seededHistory = this.getBaselineHistorySeed();
    const chat = await this.createGraphChat(ai, 'editor', systemInstruction, onLog, seededHistory);
    this.persistentEditorChat = chat;
    this.persistentEditorChatConfigKey = configKey;
    onLog?.('Chat: created persistent editor session.');
    return chat;
  }

  async appendManualGraphOpsToPersistentHistory(
    _ops: any[],
    _onLog?: (msg: string) => void
  ): Promise<void> {
    // Disabled manual sync heartbeats to reduce API calls.
    // Sync will happen lazily on next user prompt.
  }

  private buildSystemInstruction(agent: 'architect' | 'editor' | 'consultant', softwareContext: string): string {
    const base = agent === 'editor' ? editorInstructions : agent === 'consultant' ? consultantInstructions : architectInstructions;
    const template = String(base || '');
    if (template.includes('{{SOFTWARE_CONTEXT}}')) {
      return utils.injectPlaceholders(template, { SOFTWARE_CONTEXT: softwareContext });
    }
    return `${template}\n\n${softwareContext}`;
  }

  private async getOrCreatePersistentConsultantChat(
    ai: GoogleGenAI,
    systemInstruction: string,
    onLog?: (msg: string) => void
  ): Promise<any> {
    const configKey = `${this.modelId}:consultant:cache:${utils.fnv1aHex(systemInstruction)}`;
    if (this.persistentConsultantChat && this.persistentConsultantChatConfigKey === configKey) {
      return this.persistentConsultantChat;
    }
    const chat = await this.createGraphChat(ai, 'consultant', systemInstruction, onLog, []);
    this.persistentConsultantChat = chat;
    this.persistentConsultantChatConfigKey = configKey;
    onLog?.('Chat: created persistent consultant session.');
    return chat;
  }

  async notifyConsultantOfGraphChange(
    agentName: string,
    changeDescription: string,
    onLog?: (msg: string) => void
  ): Promise<void> {
    const ai = this.createClient();
    if (!ai) return;

    const softwareContext = `AVAILABLE_NODES:\n${this.definitions}\n\nSCOPE: Lumina Shader Graph (WebGL 2.0).`;
    const systemInstruction = this.buildSystemInstruction('consultant', softwareContext);
    const chat = await this.getOrCreatePersistentConsultantChat(ai, systemInstruction, onLog);

    try {
      // In persistent chat, we inform the consultant via a message, not system instruction
      const message = {
        role: 'user',
        parts: [{ text: `GRAPH_UPDATE_NOTICE from ${agentName}: ${changeDescription}` }]
      };

      const getHistoryFn = (chat as any)?.getHistory;
      if (typeof getHistoryFn === 'function') {
        const history = await getHistoryFn.call(chat);
        const nextHistory = Array.isArray(history) ? [...history] : [];
        nextHistory.push(message);

        // Recreate the chat with the updated history.
        this.persistentConsultantChat = await this.createGraphChat(ai, 'consultant', systemInstruction, onLog, nextHistory);
        this.persistentConsultantChatConfigKey = `${this.modelId}:consultant:cache:${utils.fnv1aHex(systemInstruction)}`;
        onLog?.(`Chat: Consultant informed of changes by ${agentName}.`);
      }
    } catch (e: any) {
      onLog?.(`Chat: failed to inform consultant of changes (${e?.message || String(e)}).`);
    }
  }

  async askQuestion(
    prompt: string,
    currentNodes?: ShaderNode[],
    currentConnections?: Connection[],
    attachedNodes?: Array<{ id: string; label: string; type: string }>,
    onLog?: (msg: string) => void
  ): Promise<string | null> {
    const ai = this.createClient();
    if (!ai) return null;

    if (onLog) onLog("Lumina Shader Expert initialized...");

    // Build dynamic context about the current graph
    let dynamicGraphContext = '';
    if (currentNodes && currentNodes.length > 0) {
      dynamicGraphContext = `\n\nCURRENT_GRAPH_SNAPSHOT:\n${JSON.stringify(utils.toMinimalGraphSnapshot(currentNodes, currentConnections || []))}`;
    }

    if (attachedNodes && attachedNodes.length > 0) {
      dynamicGraphContext += `\n\nATTACHED_NODES_CONTEXT (The user explicitly selected these nodes for your attention):\n${JSON.stringify(attachedNodes)}`;
    }

    // STABLE_SOFTWARE_CONTEXT: Only definitions and general scope.
    // This allows the expensive node definitions part to stay cached.
    const softwareContext = `AVAILABLE_NODES:\n${this.definitions}\n\nSCOPE: Lumina Shader Graph (WebGL 2.0).`;
    const systemInstruction = this.buildSystemInstruction('consultant', softwareContext);
    const chat = await this.getOrCreatePersistentConsultantChat(ai, systemInstruction, onLog);

    try {
      // DYNAMIC_GRAPH_CONTEXT: Passed as a user message or as a prefix to the query.
      const contextualPrompt = dynamicGraphContext
        ? `${dynamicGraphContext}\n\nUSER_QUERY: ${prompt}`
        : prompt;

      const responseText = await this.sendChatMessageText(chat, { text: contextualPrompt }, onLog, {
        includeThoughts: true,
        thinkingConfig: this.thinkingConfig,
      });

      return responseText;
    } catch (e: any) {
      if (onLog) onLog(`Consultant failed: ${e?.message || String(e)}`);
      return null;
    }
  }

  private buildRefineSystemInstruction(agent: 'architect' | 'editor'): string {
    const base = String(refinerInstructions || '');
    const available = `AVAILABLE_NODES:\n${this.definitions}`;
    const placeholders = { AVAILABLE_NODES: available };

    let out = base.includes('{{AVAILABLE_NODES}}')
      ? utils.injectPlaceholders(base, placeholders)
      : `${base}\n\n${available}`;

    return out + `\n\nAGENT: ${agent}\n` +
      (agent === 'editor'
        ? 'As the EDITOR agent, return ONLY a JSON array of operations (add/edit/delete) to repair the graph.\n'
        : 'As the ARCHITECT agent, return ONLY the full graph as {"nodes": [...], "connections": [...]}.\n');
  }

  private pickGraphAgent(prompt: string, currentNodes: ShaderNode[], currentConnections: Connection[]): 'architect' | 'editor' {
    const text = String(prompt || '');

    // If the user attached nodes, we bias strongly toward incremental edits.
    if (text.includes('FOCUS (expert attachments):')) return 'editor';

    // If the graph is effectively empty, use architect.
    const nonMasterCount = (currentNodes || []).filter(n => n && n.id !== 'vertex' && n.id !== 'output').length;
    if (nonMasterCount <= 0 || (currentConnections || []).length <= 0) return 'architect';

    // Lightweight heuristic for “edit mode” language.
    const editWords = /(edit|modify|adjust|tweak|change|fix|repair|remove|delete|add|insert|rewire|refactor|optimi[sz]e|desaturat|saturaci[oó]n|quitar|agregar|añadir|cambiar|ajustar|editar|arreglar|corregir|reparar)/i;
    if (editWords.test(text)) return 'editor';

    return 'architect';
  }

  private parseGraphSlashCommand(prompt: string): {
    forcedAgent: 'architect' | 'editor' | null;
    cleanedPrompt: string;
    command: 'generate' | 'edit' | null;
    originalPrompt: string;
  } {
    const raw = String(prompt || '');
    const trimmed = raw.trimStart();

    // Supported commands:
    // - /generategraph <prompt> => force architect
    // - /editgraph <prompt>     => force editor
    const m = /^\/(generategraph|editgraph)(?:\s+([\s\S]*))?$/i.exec(trimmed);
    if (!m) {
      return { forcedAgent: null, cleanedPrompt: raw, command: null, originalPrompt: raw } as any;
    }

    const rawCmd = String(m[1] || '').toLowerCase();
    const cmd = (rawCmd === 'editgraph' ? 'edit' : 'generate') as 'generate' | 'edit';
    const arg = (m[2] ?? '').trim();
    const forcedAgent = cmd === 'edit' ? 'editor' : 'architect';

    return {
      forcedAgent,
      cleanedPrompt: arg,
      command: cmd,
      originalPrompt: raw,
    };
  }

  private async generateContentText(ai: GoogleGenAI, request: any, onLog?: (msg: string) => void, systemInstructionFallback?: string): Promise<string> {
    try {
      const result = await ai.models.generateContent(request);
      this.logUsageMetadata(result, onLog);
      return this.processResponse(result, onLog);
    } catch (e: any) {
      // If cachedContent is stale/invalid, retry once without cache.
      const cached = request?.config?.cachedContent;
      if (cached && systemInstructionFallback) {
        onLog?.('Cache: request failed, retrying without cache...');
        const retry = {
          ...request,
          config: {
            ...(request.config || {}),
            cachedContent: undefined,
            systemInstruction: { parts: [{ text: systemInstructionFallback }] }
          },
        };
        const result = await ai.models.generateContent(retry);
        this.logUsageMetadata(result, onLog);
        return this.processResponse(result, onLog);
      }
      throw e;
    }
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
    const uniqueTypes = Array.from(new Set([...ALL_NODE_TYPES, ...masterTypes]));

    return uniqueTypes
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
        // Handle both (thought: string) and (thought: bool, text: string)
        const thinkingText = typeof part.thought === 'string' ? part.thought : (part.thought ? part.text : null);
        if (thinkingText) {
          onLog(`THOUGHT: ${thinkingText}`);
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
        config: this.baseConfig,
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
      const json = utils.safeJsonParse(text);

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

  async inferLoadAssetIntent(
    userPrompt: string,
    currentAssets: SessionAsset[] = [],
    attachment?: string,
    onLog?: (msg: string) => void
  ): Promise<{
    action: 'save' | 'apply' | 'edit';
    method: 'graph' | 'ai';
    confidence: number;
    reasoning?: string;
  } | null> {
    const ai = this.createClient();
    if (!ai) return null;

    const assetsCsv = currentAssets.length > 0
      ? currentAssets.map(a => `${a.id},${a.name}`).join('\n')
      : "(no assets in library)";

    const prompt = String(userPrompt || '').trim();
    if (!prompt) return { action: 'save', method: 'graph', confidence: 1.0 };

    const instruction = [
      'You are a routing agent for image asset loading.',
      'Task: Determine what the user wants to do with the NEW image attachment provided now.',
      '',
      'LIBRARY CONTEXT (Existing Assets):',
      'id,name',
      assetsCsv,
      '',
      'Actions:',
      '- save: Just store in the library, no usage in the current graph.',
      '- apply: Use the image in the graph AS IS (standard texture mapping).',
      '- edit: Modify the image content or properties.',
      '',
      'Methods (Only for action="apply" or "edit"):',
      '- graph: Use shader nodes (procedural/math). Best for: grayscale, brightness, tiling, simple masks, color tinting, blending.',
      '- ai: Use generative AI models. Best for: changing style (e.g. leather to metal), adding objects, semantic changes, generating/editing new variants.',
      '',
      'Return ONLY valid JSON: { "action": "...", "method": "...", "confidence": 0.0-1.0, "reasoning": "short explanation" }',
      '',
      'User request:',
      prompt,
    ].join('\n');

    const mediaParts: any[] = [];
    if (attachment) {
      let mimeType = "image/png";
      const match = attachment.match(/^data:([^;]+);base64,/);
      if (match) mimeType = match[1];
      mediaParts.push({
        inlineData: {
          mimeType: mimeType,
          data: utils.cleanBase64(attachment)
        }
      });
    }

    onLog?.('Inferring load strategy with Gemini 3...');

    try {
      const result = await ai.models.generateContent({
        model: this.modelId,
        contents: [{ role: 'user', parts: [...mediaParts, { text: instruction }] }],
        config: { responseMimeType: 'application/json' } as any,
      } as any);

      const candidate = (result as any)?.candidates?.[0] || (result as any)?.response?.candidates?.[0];
      const parts: any[] = candidate?.content?.parts || [];
      const text = parts.filter((p: any) => p && p.text).map((p: any) => String(p.text)).join('').trim();

      const json = utils.safeJsonParse(text);
      console.log('[GeminiService] Parsed Load Intent:', json);
      return {
        action: json?.action || 'save',
        method: json?.method || 'graph',
        confidence: json?.confidence || 0.5,
        reasoning: json?.reasoning
      };
    } catch (e: any) {
      console.error('[GeminiService] Load Intent Error:', e);
      return { action: 'save', method: 'graph', confidence: 0.0 };
    }
  }

  async inferGlobalIntent(
    userPrompt: string,
    attachment?: string,
    onLog?: (msg: string) => void
  ): Promise<{ command: string; confidence: number } | null> {
    const ai = this.createClient();
    if (!ai) return null;

    const instruction = [
      'You are a routing agent for a shader graph application.',
      'Task: Classify the user request into the most appropriate command.',
      '',
      'Available Commands:',
      '- /ask: If the user is asking a question, seeking an explanation, or troubleshooting without explicitly asking for a graph change.',
      '- /editgraph: If the user wants to modify, adjust, fix, or add something to the EXISTING shader graph.',
      '- /generategraph: If the user wants to create a BRAND NEW shader from scratch, or if the canvas is empty.',
      '- /generateimage: If the user wants to create a texture, image, or noise pattern using AI generation.',
      '- /loadimage: If the user mentions loading, uploading, or picking an image file.',
      '- /clear: If the user wants to reset, clear, or start over.',
      '',
      'Return ONLY valid JSON: { "command": "/the-command", "confidence": 0.0-1.0 }',
      '',
      'User request:',
      userPrompt,
    ].join('\n');

    const mediaParts: any[] = [];
    if (attachment) {
      let mimeType = "image/png";
      const match = attachment.match(/^data:([^;]+);base64,/);
      if (match) mimeType = match[1];
      mediaParts.push({
        inlineData: {
          mimeType: mimeType,
          data: utils.cleanBase64(attachment)
        }
      });
    }

    onLog?.('Routing request with Gemini 3...');

    try {
      const result = await ai.models.generateContent({
        model: this.modelId,
        contents: [{ role: 'user', parts: [...mediaParts, { text: instruction }] }],
        config: { responseMimeType: 'application/json' } as any,
      } as any);

      const candidate = (result as any)?.candidates?.[0] || (result as any)?.response?.candidates?.[0];
      const parts: any[] = candidate?.content?.parts || [];
      const text = parts
        .filter((p: any) => p && p.text)
        .map((p: any) => String(p.text))
        .join('')
        .trim();

      if (!text) return null;
      const json = utils.safeJsonParse(text);
      if (!json || !json.command) return null;

      return {
        command: String(json.command).startsWith('/') ? json.command : `/${json.command}`,
        confidence: Number(json.confidence || 0)
      };
    } catch (e: any) {
      console.error('[Router] Inference Error:', e);
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
        config: this.baseConfig,
      } as any);

      const candidate = (result as any)?.candidates?.[0] || (result as any)?.response?.candidates?.[0];
      const parts: any[] = candidate?.content?.parts || [];
      const text = parts
        .filter((p: any) => p && !p.thought && p.text)
        .map((p: any) => String(p.text))
        .join('')
        .trim();

      if (!text) return null;
      const json = utils.safeJsonParse(text);
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
      ? utils.parseDataUrl(referenceImageDataUrl)
      : null;
    if (ref) {
      parts.push({ inlineData: { mimeType: ref.mimeType, data: utils.cleanBase64(ref.data) } });
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
      ? utils.parseDataUrl(sourceImageDataUrl)
      : null;
    if (!src) {
      onLog?.('Edit failed: source image must be an image/* data URL.');
      return null;
    }

    const prompt = String(editPrompt || '').trim();
    if (!prompt) return null;

    const parts: any[] = [
      { inlineData: { mimeType: src.mimeType, data: utils.cleanBase64(src.data) } },
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

  private buildStableSoftwareContext(agent: 'architect' | 'editor'): string {
    const outputDef = getNodeModule('output')?.definition;
    const vertexDef = getNodeModule('vertex')?.definition;
    const outputInputs = (outputDef?.inputs || []).map(i => `${i.id}(${i.type})`).join(', ');
    const vertexOutputs = (vertexDef?.outputs || []).map(o => `${o.id}(${o.type})`).join(', ');

    const outputFormatLines = agent === 'editor'
      ? [
        'AUTHORITATIVE OUTPUT FORMAT (MUST FOLLOW):',
        '- Output ONLY valid JSON (no markdown, no comments).',
        '- Output a JSON ARRAY of operation objects (preferred), OR multiple JSON objects separated by blank lines.',
        '- Each operation object schema:',
        '  {',
        '    "action": "add" | "edit" | "delete",',
        '    "id": string,',
        '    "node_content"?: object | string,',
        '    "connection_content"?: object | object[] | string,',
        '    "connections_delete"?: object | object[] | string',
        '  }',
        '- NOTE: the app will apply these ops to the CURRENT_GRAPH_SNAPSHOT to produce the final graph.',
        '- For "add": node_content should be a minimal node object (id,type,x,y,data?) OR a JSON string of that object.',
        '- For "edit": node_content should be a PARTIAL node patch (x/y/data/type/etc). data is shallow-merged.',
        '- For "delete": only {action,id} is required; node and its connections will be removed.',
        '- connection_content: optional connections to ADD (single connection or array).',
        '- connections_delete: optional connections to DELETE (single connection or array). Match by id if present, else by endpoints.',
        '- Use only valid node types and socket ids from AVAILABLE_NODES.',
        '',
        'OPS EXAMPLE:',
        '[',
        '  {"action":"add","id":"float-1","node_content":{"id":"float-1","type":"float","x":400,"y":450,"data":{"value":0.5}},"connection_content":{"sourceNodeId":"float-1","sourceSocketId":"out","targetNodeId":"output","targetSocketId":"color"}},',
        '  {"action":"edit","id":"float-1","node_content":{"data":{"value":0.75}}},',
        '  {"action":"edit","id":"output","connections_delete":{"sourceNodeId":"float-1","sourceSocketId":"out","targetNodeId":"output","targetSocketId":"color"}}',
        ']',
      ]
      : [
        'AUTHORITATIVE OUTPUT FORMAT (MUST FOLLOW):',
        '- Output ONLY valid JSON (no markdown, no comments).',
        '- Root: { "nodes": [...], "connections": [...] }',
        '- node fields required: id(string), type(string), x(number), y(number)',
        '- node optional fields: data(object), dataValue(any)',
        '- connection fields required: sourceNodeId, sourceSocketId, targetNodeId, targetSocketId (strings)',
        '- connection optional: id(string)',
        '',
        'CANONICAL MINIMAL EXAMPLE (VALID OUTPUT SHAPE):',
        '{"nodes":[{"id":"vertex","type":"vertex","x":800,"y":150},{"id":"output","type":"output","x":800,"y":450},{"id":"float-1","type":"float","x":400,"y":450,"data":{"value":0.5}}],"connections":[{"sourceNodeId":"float-1","sourceSocketId":"out","targetNodeId":"output","targetSocketId":"color"}]}',
      ];

    return [
      'SOFTWARE_CONTEXT: Lumina Shader Graph (lumina-shader-graph)',
      '',
      ...outputFormatLines,
      '',
      'RAW APP GRAPH SHAPE (REFERENCE — DO NOT EMIT THESE EXTRA FIELDS):',
      '- Internally, the app stores ShaderNode as:',
      '  { id, type, label, x, y, inputs:[{id,label,type}], outputs:[{id,label,type}], data:{...} }',
      '- If agent=editor, node_content uses the MINIMAL node shape (id,type,x,y,data?).',
      '- If agent=architect, your JSON output must be the MINIMAL graph shape above; the app derives label/inputs/outputs from node.type.',
      '- EXCEPTION: customFunction sockets may be per-node (dynamic). If a customFunction has non-default sockets, include node.inputs/node.outputs AND persist them in data.customInputs/data.customOutputs.',
      '- When editing an existing customFunction, treat the socket IDs from CURRENT_GRAPH_SNAPSHOT as authoritative (e.g. input "sampledColor", output "result").',
      '',
      'NODE DATA BINDINGS (IMPORTANT):',
      '- color node: set data.value as a hex string "#RRGGBB" (example: {"type":"color","data":{"value":"#ff00aa"}}).',
      '- float node: set data.value as a number (example: {"type":"float","data":{"value":0.25}}).',
      '- constant node: set data.constant as one of: PI, TAU, PHI, E, SQRT2.',
      '- Do NOT rely on defaults when the value matters (e.g., gradients must use distinct non-white colors).',
      '',
      'IMPORTANT COMPATIBILITY CONSTRAINTS:',
      '- DO NOT invent node types or socket ids; only use what is listed in AVAILABLE_NODES.',
      '- Socket authority: for most nodes, socket IDs come from AVAILABLE_NODES; for customFunction, socket IDs may come from the snapshot (node.inputs/node.outputs or data.customInputs/data.customOutputs).',
      '- Ensure every connection references existing nodes.',
      '- Prefer left->right flow: sources at smaller x, sinks at larger x.',
      `- MASTER SOCKET IDS (authoritative): output.inputs=[${outputInputs || 'unknown'}]; vertex.outputs=[${vertexOutputs || 'unknown'}]`,
      '- MASTER OUTPUT MINIMALISM: only connect the output inputs that are required by the user request.',
      '  - Default: connect ONLY output.color.',
      '  - Do NOT connect alpha/alphaClip/normal/emission/occlusion/specular/smoothness unless explicitly needed.',
      '  - Do NOT add constant nodes just to fill unused master inputs.',
      '- REQUIRED_MASTER_INPUTS will be provided in the dynamic context.',
      '- Include master nodes with stable ids:',
      '  - vertex node: { id: "vertex", type: "vertex" }',
      '  - output node: { id: "output", type: "output" }',

      'SANITIZER / VALIDATION NOTES (DO NOT RELY ON THESE TO FIX BAD OUTPUT):',
      '- Unknown node types are removed.',
      '- Duplicate node ids may be renamed.',
      '- Missing master nodes may be auto-added.',
      '- Invalid connections (bad node/socket ids) are removed.',
      '- Some inputs may enforce maxIncoming; extra connections are trimmed.',
      '- If output has an incoming connection, unreachable nodes may be pruned.',
      '',
      'ASSET HANDLING:',
      '- Large binary data (images/textures) are represented as "(bin)" or "(asset:ID)" in the context to save tokens.',
      '- "(asset:ID)" refers to a specific image in the SESSION_ASSETS library. You can reference these by ID.',
      '- DO NOT emit "(bin)" or "(asset:ID)" in your output for new nodes. If you need to keep existing data, simply omit that field from your patch.',
      '- When the user provides a new image (e.g. via /loadimage), it is sent as a native IMAGE part.',
      '- To use the NEWLY provided image, create a "texture2D" node (for simple color) or "sampleTexture2D" (for UV/channel control). The system will auto-inject the base64.',
      '- TEXTURE RULE: Do NOT chain a "texture2D" node into a "sampleTexture2D" via the texture input. This is redundant. "sampleTexture2D" loads the asset directly.',
      '- "texture2D" node: Has [rgba, r, g, b, a] outputs. Best for simple use cases.',
      '- "sampleTexture2D" node: Has [rgba, r, g, b, a] outputs AND [uv, samplerState] inputs. Best when UV manipulation is needed.',
      '',
      'AVAILABLE_NODES (type: Inputs[...] -> Outputs[...]):',
      this.definitions,
    ].join('\n');
  }

  async refineGraph(draftGraph: any, linterLogs: string[], agent: 'architect' | 'editor', onLog?: (msg: string) => void, evidenceImageBase64?: string): Promise<any | null> {
    const ai = this.createClient();
    if (!ai) return null;
    if (linterLogs.length === 0 && !evidenceImageBase64) return draftGraph;
    if (onLog) onLog("Initializing Refining Agent (Thinking Mode)...");
    const systemInstruction = this.buildRefineSystemInstruction(agent);

    try {
      let parts: any[] = [];
      if (evidenceImageBase64) {
        parts.push({ inlineData: { mimeType: "image/png", data: utils.cleanBase64(evidenceImageBase64) } });
      }
      parts.push({ text: `Fix this graph:\n${JSON.stringify(draftGraph)}\n\nErrors:\n${linterLogs.join('\n')}` });

      if (onLog) onLog("Thinking (Repairing)...");

      const cacheKey = `refiner:${this.modelId}:${utils.fnv1aHex(systemInstruction)}`;
      const cachedContent = await this.getOrCreateCachedPrefix(ai, cacheKey, systemInstruction, onLog);

      const text = await this.generateContentText(ai, {
        model: this.modelId,
        contents: parts,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: this.thinkingConfig,
          ...(cachedContent ? { cachedContent } : { systemInstruction: { parts: [{ text: systemInstruction }] } }),
        }
      }, onLog, systemInstruction);
      if (!text) return draftGraph;
      const parsed = utils.safeJsonParse(text);

      // Support ops-mode repair outputs (apply ops to the provided draftGraph).
      const fixed = (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).nodes))
        ? parsed
        : (Array.isArray(parsed) || (parsed && typeof parsed === 'object' && (parsed as any).action))
          ? utils.applyGraphOps(
            {
              nodes: Array.isArray(draftGraph?.nodes) ? draftGraph.nodes : [],
              connections: Array.isArray(draftGraph?.connections) ? draftGraph.connections : [],
            },
            Array.isArray(parsed) ? parsed : [parsed],
            onLog
          )
          : ((): any => {
            const ops = utils.safeJsonParseMany(text);
            if (ops.length === 0) return parsed;
            return utils.applyGraphOps(
              {
                nodes: Array.isArray(draftGraph?.nodes) ? draftGraph.nodes : [],
                connections: Array.isArray(draftGraph?.connections) ? draftGraph.connections : [],
              },
              ops,
              onLog
            );
          })();
      if (onLog) onLog("Graph refined.");
      const sanitized = utils.sanitizeGraph(fixed);
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
    sessionAssets?: SessionAsset[],
    imageBase64?: string,
    onLog?: (msg: string) => void,
    onUpdate?: (nodes: any[], conns: any[]) => void,
    onVisualRequest?: (nodeId: string) => Promise<string | null>
  ) {
    const ai = this.createClient();
    if (!ai) return null;

    // One-Shot Pipeline
    try {
      const parsed = this.parseGraphSlashCommand(prompt);
      const effectivePrompt = parsed.cleanedPrompt;


      const persistChat = true;
      const chatEnabled = true;

      const agent = parsed.forcedAgent || this.pickGraphAgent(effectivePrompt, currentNodes, currentConnections);

      // Cache behavior is enabled by default: use stable software context
      const softwareContext = this.buildStableSoftwareContext(agent);
      const systemInstruction = this.buildSystemInstruction(agent, softwareContext);

      if (onLog) {
        if (parsed.command) {
          onLog(`Command: /${parsed.command} (forcing ${agent === 'editor' ? 'edit' : 'generate'} mode)`);
        }
        if (agent === 'editor') {
          onLog('Output mode: ops (diff-based)');
        }
        onLog(agent === 'editor'
          ? 'Initializing Graph Editor (Incremental Mode: High)...'
          : 'Initializing Shader Architect (Thinking Mode: High)...'
        );
      }

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
              data: utils.cleanBase64(imageBase64)
            }
          });
        }
      }

      const parts: any[] = [...mediaParts, { text: `User Prompt: ${effectivePrompt}` }];

      const currentMinimal = utils.toMinimalGraphSnapshot(currentNodes, currentConnections);
      const graphStateDirty = !this.persistentBaselineGraph || JSON.stringify(this.persistentBaselineGraph) !== JSON.stringify(currentMinimal);

      // If persistent chat is enabled for editor, prefer relying on chat history baseline/ops instead
      // of re-sending full CURRENT_GRAPH_SNAPSHOT every time.
      // EXCEPTION: If the graph was modified manually since last sync, we MUST send the context.
      const shouldOmitDynamicGraphContext = persistChat && agent === 'editor' && !!this.persistentBaselineGraph && !graphStateDirty;
      const dynamicContext = utils.buildDynamicGraphContext(currentNodes, currentConnections, effectivePrompt, sessionAssets);

      const effectiveParts: any[] = shouldOmitDynamicGraphContext
        ? [...mediaParts, { text: `USER_PROMPT:\n${effectivePrompt}` }]
        : [...mediaParts, { text: `SYSTEM_ALERT: The user has manually modified the graph in the UI. Here is the authoritative CURRENT_GRAPH_SNAPSHOT following those edits:\n\n${dynamicContext}\n\nUSER_PROMPT:\n${effectivePrompt}` }];

      // Update baseline if we are sending context
      if (!shouldOmitDynamicGraphContext) {
        this.persistentBaselineGraph = currentMinimal;
      }

      const cachedContent = (!chatEnabled)
        ? await this.getOrCreateCachedPrefix(
          ai,
          `${agent}:${this.modelId}:${utils.fnv1aHex(systemInstruction)}`,
          systemInstruction,
          onLog
        )
        : null;

      const chat = chatEnabled
        ? (persistChat && agent === 'editor'
          ? await this.getOrCreatePersistentEditorChat(ai, systemInstruction, onLog)
          : await this.createGraphChat(ai, agent, systemInstruction, onLog))
        : null;

      if (onLog) onLog('Thinking (Reasoning + Planning + Compiling)...');

      const responseText = chatEnabled
        ? await this.sendChatMessageText(chat, effectiveParts, onLog)
        : await this.generateContentText(
          ai,
          {
            model: this.modelId,
            config: {
              responseMimeType: 'application/json',
              thinkingConfig: this.thinkingConfig,
              ...(cachedContent
                ? { cachedContent }
                : { systemInstruction: { parts: [{ text: systemInstruction }] } })
            },
            contents: effectiveParts,
          },
          onLog,
          systemInstruction
        );

      if (onLog) onLog(`One-shot generation complete. Response length: ${responseText?.length || 0}`);
      if (onLog && responseText) onLog(`Response preview: ${responseText.slice(0, 100).replace(/\n/g, ' ')}...`);

      const graphJsonParsed = utils.safeJsonParse(responseText);
      let agentFeedback = responseText;

      // Extract feedback summary if available in JSON
      if (graphJsonParsed && typeof graphJsonParsed === 'object' && (graphJsonParsed as any).summary) {
        agentFeedback = (graphJsonParsed as any).summary;
      }

      // Support new { summary, ops } format for Editor
      let effectiveGraphJsonRaw = graphJsonParsed;
      if (agent === 'editor' && graphJsonParsed && typeof graphJsonParsed === 'object' && Array.isArray((graphJsonParsed as any).ops)) {
        effectiveGraphJsonRaw = (graphJsonParsed as any).ops;
      }

      // If model returned ops, apply them to the current snapshot.
      const graphJson = (effectiveGraphJsonRaw && typeof effectiveGraphJsonRaw === 'object' && Array.isArray((effectiveGraphJsonRaw as any).nodes))
        ? effectiveGraphJsonRaw
        : (agent === 'editor' && (Array.isArray(effectiveGraphJsonRaw) || (effectiveGraphJsonRaw && typeof effectiveGraphJsonRaw === 'object' && (effectiveGraphJsonRaw as any).action)))
          ? utils.applyGraphOps(
            utils.toMinimalGraphSnapshot(currentNodes, currentConnections),
            Array.isArray(effectiveGraphJsonRaw) ? effectiveGraphJsonRaw : [effectiveGraphJsonRaw],
            onLog
          )
          : (agent === 'editor'
            ? (() => {
              const ops = utils.safeJsonParseMany(responseText);
              if (ops.length === 0) return effectiveGraphJsonRaw;
              return utils.applyGraphOps(
                utils.toMinimalGraphSnapshot(currentNodes, currentConnections),
                ops,
                onLog
              );
            })()
            : effectiveGraphJsonRaw);

      // Sanitize Pass 1 - Restored for robust normalization
      let pass1 = utils.sanitizeGraph(graphJson);
      if (!pass1.graph && Array.isArray(graphJson)) {
        // Handle raw array fallback
        pass1 = utils.sanitizeGraph({ nodes: graphJson, connections: [] });
      }

      let draft = pass1.graph;
      if (!draft) return null;

      this.logGraphSummary('Draft (One-shot)', draft, onLog);

      if (onLog && pass1.report.changed) {
        onLog(`Sanitizer: ${pass1.report.issues.join(' | ')}`);
        if (pass1.report.examples.length > 0) {
          const preview = pass1.report.examples.slice(0, 3);
          const extra = pass1.report.examples.length - preview.length;
          onLog(`Sanitizer examples: ${preview.join(' | ')}${extra > 0 ? ` (+${extra} more)` : ''}`);
        }
      }

      // NOTE: intentionally no multi-attempt generation here.
      // We do a single one-shot generation, then rely on linter + refiner for repairs.

      if (onUpdate) {
        onLog?.('UI Update: draft graph');
        onUpdate([...draft.nodes], [...draft.connections]);
      }

      // Lint + Refining (Phase C preserved)
      const typedNodes = utils.convertToShaderNodes(draft.nodes);
      const report = lintGraph(typedNodes, draft.connections as any);
      if (report.length > 0) {
        if (onLog) onLog(`Linter: ${report.length} issue(s). Attempting repair...`);
        const fixed = chatEnabled
          ? await (async () => {
            const repairMessage = [{
              text:
                'FIX_GRAPH_REQUEST:\n' +
                (agent === 'editor'
                  ? 'Return ONLY valid JSON (no markdown). Return OPS (add/edit/delete) to fix the graph.\n\n'
                  : 'Return ONLY valid JSON (no markdown).\n\n') +
                'DRAFT_GRAPH_JSON:\n' +
                JSON.stringify(draft) +
                '\n\nLINTER_ERRORS:\n' +
                report.join('\n')
            }];
            const repairedText = await this.sendChatMessageText(chat, repairMessage, onLog);
            if (!repairedText) return draft;

            const repairedParsed = utils.safeJsonParse(repairedText);

            // Extract feedback from repair if available
            if (repairedParsed && typeof repairedParsed === 'object' && (repairedParsed as any).summary) {
              agentFeedback += "\n\nREPAIR: " + (repairedParsed as any).summary;
            }

            // Support new { summary, ops } format for Refiner Editor
            let effectiveRepairedRaw = repairedParsed;
            if (agent === 'editor' && repairedParsed && typeof repairedParsed === 'object' && Array.isArray((repairedParsed as any).ops)) {
              effectiveRepairedRaw = (repairedParsed as any).ops;
            }

            const repaired = (effectiveRepairedRaw && typeof effectiveRepairedRaw === 'object' && Array.isArray((effectiveRepairedRaw as any).nodes))
              ? effectiveRepairedRaw
              : (agent === 'editor' && (Array.isArray(effectiveRepairedRaw) || (effectiveRepairedRaw && typeof effectiveRepairedRaw === 'object' && (effectiveRepairedRaw as any).action)))
                ? utils.applyGraphOps(
                  { nodes: draft.nodes, connections: draft.connections },
                  Array.isArray(effectiveRepairedRaw) ? effectiveRepairedRaw : [effectiveRepairedRaw],
                  onLog
                )
                : (agent === 'editor'
                  ? (() => {
                    const ops = utils.safeJsonParseMany(repairedText);
                    if (ops.length === 0) return effectiveRepairedRaw;
                    return utils.applyGraphOps(
                      { nodes: draft.nodes, connections: draft.connections },
                      ops,
                      onLog
                    );
                  })()
                  : effectiveRepairedRaw);

            const sanitized = utils.sanitizeGraph(repaired);
            if (onLog && sanitized.report.changed) {
              onLog(`Sanitizer: ${sanitized.report.issues.join(' | ')}`);
              if (sanitized.report.examples.length > 0) {
                const preview = sanitized.report.examples.slice(0, 3);
                const extra = sanitized.report.examples.length - preview.length;
                onLog(`Sanitizer examples: ${preview.join(' | ')}${extra > 0 ? ` (+${extra} more)` : ''}`);
              }
              onLog(`Sanitizer final: nodes=${sanitized.report.final.nodeCount}, connections=${repaired.connections?.length ?? 0}`);
            }
            return sanitized.graph || draft;
          })()
          : await this.refineGraph(draft, report, agent, onLog);
        if (fixed) {
          draft = fixed;
          this.logGraphSummary('Draft (Refined)', draft, onLog);
          if (onUpdate) {
            onLog?.('UI Update: repaired graph');
            onUpdate([...(draft.nodes || [])], [...(draft.connections || [])]);
          }
        }
      }

      // Post-Process: Inject attachment into texture nodes.
      if (imageBase64 && draft.nodes) {
        const textureNodes = draft.nodes.filter((n: any) =>
          n.type === 'textureAsset' ||
          n.type === 'texture2DAsset' ||
          n.type === 'texture2D' ||
          n.type === 'sampleTexture2D' ||
          n.type === 'texture'
        );

        // If there's only one texture node, or the user mentioned "replace/remplazar",
        // we're aggressive about updating it.
        const shouldForceReplace = /remplaza|replace|actualiza|update/i.test(prompt) || textureNodes.length === 1;

        textureNodes.forEach((n: any) => {
          const hasImage = !!n.data?.textureAsset && n.data.textureAsset !== 'image:base64';
          if (!hasImage || shouldForceReplace) {
            if (!n.data) n.data = {};
            n.data.textureAsset = imageBase64;
            if (onLog) onLog(`Auto-injected attachment into ${n.id} (${n.type})`);
          }
        });
      }

      // Sync with Consultant
      if (draft && draft.nodes) {
        const changeDesc = agent === 'editor'
          ? `Modified the graph based on user request: "${effectivePrompt}". (Diff-based ops applied)`
          : `Generated a new graph based on user request: "${effectivePrompt}".`;

        // We do this asynchronously to not block the main UI update.
        this.notifyConsultantOfGraphChange(agent === 'editor' ? 'Graph Editor' : 'Shader Architect', changeDesc, onLog).catch(err => {
          console.error('[Sync] Consultant sync failed:', err);
        });
      }

      return {
        graph: draft,
        responseText: agentFeedback, // Use the feedback instead of raw JSON
        meta: {
          agent,
          command: parsed.command,
          usedChat: !!chatEnabled,
          usedPersistentChat: !!(persistChat && agent === 'editor'),
          omittedDynamicGraphContext: !!shouldOmitDynamicGraphContext,
        },
      };
    } catch (e) {
      if (onLog) onLog(`Generation failed: ${e}`);
      return null;
    }
  }
}

export const geminiService = new GeminiService();
