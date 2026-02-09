export type AgentMessagePart = {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  image_url?: string;
};

export type AgentChatMessage = {
  role: 'user' | 'assistant' | 'system' | 'model';
  content: string | AgentMessagePart[];
};

export type AgentGraphNode = {
  id: string;
  type: string;
  label?: string | null;
  x?: number;
  y?: number;
  data?: Record<string, any>;
};

export type AgentGraphConnection = {
  id: string;
  sourceNodeId: string;
  sourceSocketId: string;
  targetNodeId: string;
  targetSocketId: string;
};

export type AgentGraphState = {
  nodes: AgentGraphNode[];
  connections: AgentGraphConnection[];
};

export type AgentChatRequest = {
  messages: AgentChatMessage[];
  graph: AgentGraphState;
};

export type AgentGraphOperation = {
  op:
    | 'add_node'
    | 'remove_node'
    | 'add_connection'
    | 'remove_connection'
    | 'update_node_data'
    | 'move_node'
    | 'upload_asset'
    | 'request_previews'
    | 'edit_image';

  nodeId?: string;

  nodeType?: string;
  x?: number;
  y?: number;

  connectionId?: string;
  sourceNodeId?: string;
  sourceSocketId?: string;
  targetNodeId?: string;
  targetSocketId?: string;

  dataKey?: string;
  dataValue?: any;

  assetId?: string;
  assetName?: string;
  assetData?: string;
  assetMimeType?: string;

  imagePrompt?: string;
  imageType?:
    | 'basecolor'
    | 'normal'
    | 'specular'
    | 'roughness'
    | 'displacement'
    | 'emission'
    | 'alpha'
    | 'sprite_flipbook'
    | 'environment_map';

  editPrompt?: string;
  sourceAssetId?: string;

  previewRequests?: Array<{
    nodeId: string;
    kind?: 'png' | 'sequence';
    previewMode?: '2d' | '3d';
    previewObject?: 'sphere' | 'box' | 'quad';
    durationSec?: number;
    fps?: number;
    note?: string;
  }>;
};

export type AgentResponse = {
  message: string;
  operations: AgentGraphOperation[];
  thought_process?: string | null;
};

export function getAgentBaseUrl(): string {
  const raw =
    (import.meta as any).env?.VITE_LUMINA_AGENT_URL ??
    (import.meta.env as any)?.VITE_LUMINA_AGENT_URL ??
    'http://localhost:8000';
  let v = String(raw).trim();
  // Be forgiving with .env quoting (e.g. VITE_LUMINA_AGENT_URL='http://...').
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.trim().replace(/\/+$/, '');
}

function getAgentTimeoutMs(): number {
  const raw =
    (import.meta as any).env?.VITE_LUMINA_AGENT_TIMEOUT_MS ??
    (import.meta.env as any)?.VITE_LUMINA_AGENT_TIMEOUT_MS ??
    180000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 180000;
  return Math.floor(n);
}

export class GeminiService {
  async chat(request: AgentChatRequest): Promise<AgentResponse> {
    const baseUrl = getAgentBaseUrl();
    const timeoutMs = getAgentTimeoutMs();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (e: any) {
      const msg = String(e?.name || '').toLowerCase().includes('abort')
        ? `Agent request timed out after ${Math.round(timeoutMs / 1000)}s (${baseUrl})`
        : `Agent request failed (${baseUrl}): ${e?.message || String(e)}`;
      throw new Error(msg);
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Agent request failed (${res.status}) (${baseUrl}): ${text || res.statusText}`);
    }

    return (await res.json()) as AgentResponse;
  }
}

export const geminiService = new GeminiService();
