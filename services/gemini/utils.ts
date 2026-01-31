import { ShaderNode, Connection } from "../../types";
import { ALL_NODE_TYPES, getNodeModule } from "../../nodes";
import { getEffectiveSockets, getFallbackSocketId } from "../../nodes/runtime";

export const inferMimeTypeFromDataUrl = (dataUrl: string) => {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,/i);
  return m?.[1] || 'image/png';
};

export const slugify = (s: string) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

export const findAssetByKey = <T extends { id: string; name: string }>(assets: T[], key: string | undefined) => {
  const k = String(key || '').trim();
  if (!k) return null;
  return assets.find(a => a.id === k) || assets.find(a => a.name === k) || null;
};

export function fnv1aHex(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function getCacheStorage(): Storage | null {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch { /* ignore */ }
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* ignore */ }
  return null;
}

export function cleanBase64(dataUrlOrBase64: string): string {
  return String(dataUrlOrBase64 || '').replace(/^data:[^;]+;base64,/, "");
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const str = String(dataUrl || '');
  const m = /^data:([^;]+);base64,(.+)$/i.exec(str);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

export function injectPlaceholders(template: string, values: Record<string, string>): string {
  let out = String(template || '');
  for (const [key, value] of Object.entries(values || {})) {
    out = out.split(`{{${key}}}`).join(String(value ?? ''));
  }
  return out;
}

export function safeJsonParse(text: string): any {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Empty JSON text');

  const noFences = trimmed
    .replace(/^```(json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(noFences);
  } catch {
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

export function safeJsonParseMany(text: string): any[] {
  const raw = String(text || '').trim();
  if (!raw) return [];
  try {
    const one = safeJsonParse(raw);
    if (Array.isArray(one)) return one;
    if (one && typeof one === 'object' && (one as any).action) return [one];
  } catch { /* fallthrough */ }

  const blocks = raw
    .split(/\r?\n\s*\r?\n+/)
    .map(b => b.trim())
    .filter(Boolean);

  const out: any[] = [];
  for (const b of blocks) {
    try {
      out.push(safeJsonParse(b));
    } catch { /* ignore */ }
  }
  return out;
}

export function parseNodeOrJsonString(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    try {
      return safeJsonParse(s);
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') return value;
  return null;
}

export function parseConnectionsOrJsonString(value: any): any[] {
  const parsed = parseNodeOrJsonString(value);
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'object') return [parsed];
  return [];
}

export function normalizeGraph(raw: any): { nodes: any[]; connections: any[] } | null {
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
      const dataValue = (n.dataValue !== undefined)
        ? n.dataValue
        : (n.initialValue !== undefined)
          ? n.initialValue
          : (data && (data as any).value !== undefined)
            ? (data as any).value
            : undefined;

      const inputs = Array.isArray(n.inputs) ? n.inputs : undefined;
      const outputs = Array.isArray(n.outputs) ? n.outputs : undefined;

      return {
        id,
        type,
        x,
        y,
        ...(data ? { data } : {}),
        ...(dataValue !== undefined ? { dataValue } : {}),
        ...(inputs ? { inputs } : {}),
        ...(outputs ? { outputs } : {}),
        label: n.label
      };
    });

  const connections = connsRaw
    .filter((c: any) => c && typeof c === 'object')
    .map((c: any, idx: number) => {
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

export function inferRequiredMasterInputs(prompt: string): string[] {
  const text = String(prompt || '').toLowerCase();
  const required = new Set<string>();
  required.add('color');
  if (/(alpha\b|opacity|transparent|transparente|cutout|clip|recorte|mask|mascara)/i.test(text)) {
    required.add('alpha');
    if (/(clip|cutout|recorte)/i.test(text)) required.add('alphaClip');
  }
  if (/(emiss|emision|glow|brill|neon|lumin)/i.test(text)) required.add('emission');
  if (/(normal\s*map|normalmap|bump|relieve|relief|parallax|height\s*map|heightmap|displace|displacement)/i.test(text)) {
    required.add('normal');
  }
  if (/(ao\b|ambient\s*occlusion|occlusion|oclusion)/i.test(text)) required.add('occlusion');
  if (/(specular|especular|gloss|glossiness|smoothness|suavidad|roughness|rugosidad)/i.test(text)) {
    required.add('smoothness');
    if (/(specular|especular)/i.test(text)) required.add('specular');
  }
  return Array.from(required);
}

export function toMinimalGraphSnapshot(currentNodes: ShaderNode[], currentConnections: Connection[]): { nodes: any[]; connections: any[] } {
  return {
    nodes: (Array.isArray(currentNodes) ? currentNodes : []).map(n => ({
      id: n.id,
      type: n.type,
      x: typeof n.x === 'number' ? n.x : 0,
      y: typeof n.y === 'number' ? n.y : 0,
      ...(n.type === 'customFunction' || (n.data && ((n.data as any).customInputs?.length || (n.data as any).customOutputs?.length))
        ? {
          inputs: Array.isArray((n as any).inputs) ? (n as any).inputs : undefined,
          outputs: Array.isArray((n as any).outputs) ? (n as any).outputs : undefined,
        }
        : {}),
      ...(n.data ? { data: n.data } : {}),
    })),
    connections: (Array.isArray(currentConnections) ? currentConnections : []).map(c => ({
      id: (c as any).id,
      sourceNodeId: c.sourceNodeId,
      sourceSocketId: c.sourceSocketId,
      targetNodeId: c.targetNodeId,
      targetSocketId: c.targetSocketId,
    })),
  };
}

export function applyGraphOps(
  baseGraph: { nodes: any[]; connections: any[] },
  ops: any[],
  onLog?: (msg: string) => void
): { nodes: any[]; connections: any[] } {
  const nodes = Array.isArray(baseGraph?.nodes) ? [...baseGraph.nodes] : [];
  const connections = Array.isArray(baseGraph?.connections) ? [...baseGraph.connections] : [];

  const findNodeIndex = (id: string) => nodes.findIndex(n => n && String(n.id) === id);
  const normalizeId = (v: any) => String(v ?? '').trim();

  const ensureUniqueId = (desired: string): string => {
    const base = desired || 'node';
    if (findNodeIndex(base) === -1) return base;
    let i = 2;
    while (findNodeIndex(`${base}-${i}`) !== -1) i++;
    return `${base}-${i}`;
  };

  const addConnections = (list: any[]) => {
    for (const c of list) {
      if (!c || typeof c !== 'object') continue;
      const sourceNodeId = normalizeId((c as any).sourceNodeId);
      const sourceSocketId = normalizeId((c as any).sourceSocketId);
      const targetNodeId = normalizeId((c as any).targetNodeId);
      const targetSocketId = normalizeId((c as any).targetSocketId);
      if (!sourceNodeId || !sourceSocketId || !targetNodeId || !targetSocketId) continue;
      const exists = connections.some(x =>
        x &&
        String((x as any).sourceNodeId) === sourceNodeId &&
        String((x as any).sourceSocketId) === sourceSocketId &&
        String((x as any).targetNodeId) === targetNodeId &&
        String((x as any).targetSocketId) === targetSocketId
      );
      if (exists) continue;
      connections.push({
        id: (c as any).id,
        sourceNodeId,
        sourceSocketId,
        targetNodeId,
        targetSocketId,
      });
    }
  };

  const deleteConnections = (list: any[]) => {
    for (const c of Array.isArray(list) ? list : []) {
      if (!c || typeof c !== 'object') continue;
      const cid = normalizeId((c as any).id);
      const sourceNodeId = normalizeId((c as any).sourceNodeId);
      const sourceSocketId = normalizeId((c as any).sourceSocketId);
      const targetNodeId = normalizeId((c as any).targetNodeId);
      const targetSocketId = normalizeId((c as any).targetSocketId);

      for (let i = connections.length - 1; i >= 0; i--) {
        const x = connections[i] as any;
        if (!x) continue;
        const idMatch = cid && normalizeId(x.id) === cid;
        const endpointMatch = !!sourceNodeId && !!sourceSocketId && !!targetNodeId && !!targetSocketId &&
          normalizeId(x.sourceNodeId) === sourceNodeId &&
          normalizeId(x.sourceSocketId) === sourceSocketId &&
          normalizeId(x.targetNodeId) === targetNodeId &&
          normalizeId(x.targetSocketId) === targetSocketId;
        if (idMatch || endpointMatch) connections.splice(i, 1);
      }
    }
  };

  for (const rawOp of Array.isArray(ops) ? ops : []) {
    if (!rawOp || typeof rawOp !== 'object') continue;
    const action = String((rawOp as any).action || '').trim().toLowerCase();
    const id = normalizeId((rawOp as any).id);
    if (!action || !id) continue;

    const nodeContent = parseNodeOrJsonString((rawOp as any).node_content);
    const connectionList = parseConnectionsOrJsonString((rawOp as any).connection_content ?? (rawOp as any).contection_content);
    const connectionsDeleteRaw = (rawOp as any).connections_delete ?? (rawOp as any).connection_delete;
    const connectionDeleteList = parseConnectionsOrJsonString(connectionsDeleteRaw);

    if (connectionDeleteList.length > 0) deleteConnections(connectionDeleteList);

    if (action === 'delete') {
      const idx = findNodeIndex(id);
      if (idx !== -1) nodes.splice(idx, 1);
      for (let i = connections.length - 1; i >= 0; i--) {
        const c = connections[i];
        if (c && (String((c as any).sourceNodeId) === id || String((c as any).targetNodeId) === id)) {
          connections.splice(i, 1);
        }
      }
      continue;
    }

    if (action === 'add') {
      const baseNode = (nodeContent && typeof nodeContent === 'object') ? nodeContent : {};
      const desiredId = normalizeId((baseNode as any).id) || id;
      const finalId = ensureUniqueId(desiredId);
      const type = normalizeId((baseNode as any).type);
      const x = typeof (baseNode as any).x === 'number' ? (baseNode as any).x : 0;
      const y = typeof (baseNode as any).y === 'number' ? (baseNode as any).y : 0;
      const data = (baseNode as any).data && typeof (baseNode as any).data === 'object' ? (baseNode as any).data : undefined;
      if (!type) {
        onLog?.(`Ops: skipping add for id=${finalId} (missing type)`);
      } else {
        const label = (baseNode as any).label || type;
        const inputs = Array.isArray((baseNode as any).inputs) ? (baseNode as any).inputs : undefined;
        const outputs = Array.isArray((baseNode as any).outputs) ? (baseNode as any).outputs : undefined;

        nodes.push({
          id: finalId,
          type,
          x,
          y,
          label,
          ...(data ? { data } : {}),
          ...(inputs ? { inputs } : {}),
          ...(outputs ? { outputs } : {})
        });
      }
      const rewritten = connectionList.map(c => {
        if (!c || typeof c !== 'object') return c;
        const next = { ...(c as any) };
        if (normalizeId(next.sourceNodeId) === id) next.sourceNodeId = finalId;
        if (normalizeId(next.targetNodeId) === id) next.targetNodeId = finalId;
        if (normalizeId(next.sourceNodeId) === desiredId) next.sourceNodeId = finalId;
        if (normalizeId(next.targetNodeId) === desiredId) next.targetNodeId = finalId;
        return next;
      });
      addConnections(rewritten);
      continue;
    }

    if (action === 'edit') {
      const idx = findNodeIndex(id);
      if (idx === -1) {
        onLog?.(`Ops: skipping edit for id=${id} (node not found)`);
      } else {
        const patch = (nodeContent && typeof nodeContent === 'object') ? nodeContent : {};
        const existing = nodes[idx] || {};
        const next: any = { ...existing };
        if (patch.label !== undefined) next.label = String(patch.label);
        if (patch.type !== undefined) next.type = String(patch.type);
        if (patch.x !== undefined) next.x = typeof patch.x === 'number' ? patch.x : next.x;
        if (patch.y !== undefined) next.y = typeof patch.y === 'number' ? patch.y : next.y;
        if (Array.isArray((patch as any).inputs)) next.inputs = (patch as any).inputs;
        if (Array.isArray((patch as any).outputs)) next.outputs = (patch as any).outputs;
        if (patch.data !== undefined && patch.data && typeof patch.data === 'object') {
          const prevData = (existing as any).data && typeof (existing as any).data === 'object' ? (existing as any).data : {};
          next.data = { ...prevData, ...(patch.data as any) };
        }
        nodes[idx] = next;
      }
      addConnections(connectionList);
      continue;
    }
  }
  return { nodes, connections };
}

export function sanitizeGraph(rawData: any): {
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

  const normalized = normalizeGraph(rawData);
  if (!normalized) {
    return {
      graph: null,
      report: { changed: false, issues: ['sanitizeGraph: input did not contain a valid {nodes, connections} object.'], examples, stats, final: { nodeCount: 0, connectionCount: 0 } },
    };
  }

  stats.nodes_in = normalized.nodes.length;
  stats.connections_in = normalized.connections.length;

  // Master node ID normalization (legacy/raw exports):
  // Some graphs use ids like "vertex-node" and "master-node". The Gemini flow reserves
  // canonical ids "vertex" and "output". To avoid duplicate masters and downstream
  // ops targeting the wrong id, normalize aliases up-front.
  const remapNodeIdInGraph = (fromId: string, toId: string) => {
    const from = String(fromId);
    const to = String(toId);
    if (from === to) return;
    if (!normalized.nodes.some(n => String(n.id) === from)) return;
    if (normalized.nodes.some(n => String(n.id) === to)) return;

    for (const n of normalized.nodes) {
      if (String(n.id) === from) n.id = to;
    }
    for (const c of normalized.connections) {
      if (!c || typeof c !== 'object') continue;
      if (String((c as any).sourceNodeId) === from) (c as any).sourceNodeId = to;
      if (String((c as any).targetNodeId) === from) (c as any).targetNodeId = to;
    }
    if (examples.length < 16) examples.push(`Normalized master id alias "${from}" -> "${to}"`);
  };

  // Only remap when the alias node is the correct master type.
  const vertexAlias = normalized.nodes.find(n => String(n.id) === 'vertex-node' && String(n.type) === 'vertex');
  if (vertexAlias) remapNodeIdInGraph('vertex-node', 'vertex');
  const outputAlias = normalized.nodes.find(n => String(n.id) === 'master-node' && String(n.type) === 'output');
  if (outputAlias) remapNodeIdInGraph('master-node', 'output');

  const allowedTypes = new Set<string>([...ALL_NODE_TYPES, 'output', 'vertex']);
  const sanitizedNodes = normalized.nodes
    .filter(n => {
      const ok = allowedTypes.has(n.type);
      if (!ok) {
        stats.nodes_unknownType_removed++;
        if (examples.length < 16) examples.push(`Removed node id=${String(n.id)} type=${String(n.type)} (unknown type)`);
      }
      return ok;
    })
    .map(n => {
      const mod = getNodeModule(n.type);
      const def = mod?.definition;

      const rawInputs = (Array.isArray((n as any).inputs) && (n as any).inputs.length > 0) ? (n as any).inputs : undefined;
      const rawOutputs = (Array.isArray((n as any).outputs) && (n as any).outputs.length > 0) ? (n as any).outputs : undefined;
      const dataObj = (n.data && typeof n.data === 'object') ? n.data : {};

      // Custom Function sockets are per-node and may be persisted in data.customInputs/customOutputs
      // (and/or provided directly as node.inputs/node.outputs). Preserve them when present.
      const customInputs = (n.type === 'customFunction' && Array.isArray((dataObj as any).customInputs) && (dataObj as any).customInputs.length > 0)
        ? (dataObj as any).customInputs
        : undefined;
      const customOutputs = (n.type === 'customFunction' && Array.isArray((dataObj as any).customOutputs) && (dataObj as any).customOutputs.length > 0)
        ? (dataObj as any).customOutputs
        : undefined;

      const effectiveInputs = rawInputs || customInputs || def?.inputs || [];
      const effectiveOutputs = rawOutputs || customOutputs || def?.outputs || [];

      return {
        id: String(n.id),
        type: String(n.type),
        label: String((n as any).label || def?.label || n.id),
        x: typeof n.x === 'number' ? n.x : 0,
        y: typeof n.y === 'number' ? n.y : 0,
        inputs: effectiveInputs,
        outputs: effectiveOutputs,
        data: dataObj,
        ...(n.dataValue !== undefined ? { dataValue: n.dataValue } : {}),
      };
    });

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
    if (examples.length < 16) examples.push(`Renamed duplicate node id "${base}" -> "${node.id}"`);
  }

  const renameIfOccupiedByWrongType = (id: string, requiredType: string) => {
    const existing = sanitizedNodes.find(n => n.id === id);
    if (!existing || existing.type === requiredType) return;
    const base = `${existing.type}-${id}`;
    let i = 1;
    let next = `${base}-${i}`;
    while (usedIds.has(next)) { i++; next = `${base}-${i}`; }
    usedIds.delete(existing.id);
    const before = existing.id;
    existing.id = next;
    usedIds.add(existing.id);
    stats.nodes_master_conflict_renamed++;
    if (examples.length < 16) examples.push(`Renamed node occupying reserved id "${id}" (type=${existing.type}) from "${before}" -> "${existing.id}"`);
  };

  renameIfOccupiedByWrongType('vertex', 'vertex');
  renameIfOccupiedByWrongType('output', 'output');

  const ensureNode = (id: string, type: string, x: number, y: number) => {
    if (!sanitizedNodes.some(n => n.id === id)) {
      const mod = getNodeModule(type);
      const def = mod?.definition;
      sanitizedNodes.push({
        id,
        type,
        label: def?.label || id,
        x,
        y,
        inputs: def?.inputs || [],
        outputs: def?.outputs || [],
        data: {},
      });
      stats.nodes_master_added++;
      if (examples.length < 16) examples.push(`Added missing master node id="${id}" type="${type}"`);
    }
  };
  ensureNode('vertex', 'vertex', 800, 150);
  ensureNode('output', 'output', 800, 450);

  const nodeById = new Map(sanitizedNodes.map(n => [n.id, n]));
  const normalizeToken = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  const resolveSocketId = (rawSocketId: any, sockets: Array<{ id: string; label?: string }> | undefined, fallbackId: string | undefined, nodeType: string, direction: 'input' | 'output'): { id: string | undefined; changed: boolean; reason?: string } => {
    const list = Array.isArray(sockets) ? sockets : [];
    const requested = rawSocketId !== undefined && rawSocketId !== null ? String(rawSocketId) : '';
    if (!requested) return { id: fallbackId, changed: Boolean(fallbackId), reason: 'missing' };
    if (list.some(s => s.id === requested)) return { id: requested, changed: false };
    const reqNorm = normalizeToken(requested);
    if (nodeType === 'output' && direction === 'input') {
      const outputAliases: Record<string, string> = { basecontext: 'color', surface: 'color', basecolor: 'color', albedo: 'color', roughness: 'smoothness', opacity: 'alpha', alphaclip: 'alphaClip', ao: 'occlusion' };
      const aliased = outputAliases[reqNorm];
      if (aliased && list.some(s => s.id === aliased)) return { id: aliased, changed: true, reason: `alias:${requested}` };
    }
    const byNormId = list.find(s => normalizeToken(s.id) === reqNorm);
    if (byNormId) return { id: byNormId.id, changed: true, reason: `normId:${requested}` };
    const byNormLabel = list.find(s => s.label && normalizeToken(s.label) === reqNorm);
    if (byNormLabel) return { id: byNormLabel.id, changed: true, reason: `label:${requested}` };
    const byContains = list.find(s => {
      const lid = normalizeToken(s.id);
      const ll = s.label ? normalizeToken(s.label) : '';
      return (ll && (ll.includes(reqNorm) || reqNorm.includes(ll))) || (lid && (lid.includes(reqNorm) || reqNorm.includes(lid)));
    });
    if (byContains) return { id: byContains.id, changed: true, reason: `contains:${requested}` };
    return { id: fallbackId, changed: Boolean(fallbackId), reason: `fallback:${requested}` };
  };

  let sanitizedConnections = normalized.connections.map((conn: any) => {
    const sourceNode = nodeById.get(conn.sourceNodeId);
    const targetNode = nodeById.get(conn.targetNodeId);
    if (!sourceNode || !targetNode) { stats.connections_invalid_removed++; return null; }
    const sourceMod = getNodeModule(sourceNode.type);
    const targetMod = getNodeModule(targetNode.type);
    const sourceDef = sourceMod?.definition;
    const targetDef = targetMod?.definition;
    if (!sourceDef || !targetDef) { stats.connections_invalid_removed++; return null; }
    const sourceSockets = Array.isArray((sourceNode as any).outputs) ? (sourceNode as any).outputs : (sourceDef.outputs as any);
    const targetSockets = Array.isArray((targetNode as any).inputs) ? (targetNode as any).inputs : (targetDef.inputs as any);

    const sourceFallback = (sourceNode.type === 'customFunction')
      ? (sourceSockets as any[])[0]?.id
      : getFallbackSocketId({ ...(sourceDef as any), id: sourceNode.id, x: 0, y: 0, data: {} } as any, 'output', sourceMod?.socketRules);
    const targetFallback = (targetNode.type === 'customFunction')
      ? (targetSockets as any[])[0]?.id
      : getFallbackSocketId({ ...(targetDef as any), id: targetNode.id, x: 0, y: 0, data: {} } as any, 'input', targetMod?.socketRules);

    const sourceResolved = resolveSocketId(conn.sourceSocketId, sourceSockets as any, sourceFallback || (sourceSockets as any[])[0]?.id, sourceNode.type, 'output');
    const targetResolved = resolveSocketId(conn.targetSocketId, targetSockets as any, targetFallback || (targetSockets as any[])[0]?.id, targetNode.type, 'input');
    if (!sourceResolved.id || !targetResolved.id) { stats.connections_invalid_removed++; return null; }
    return { id: conn.id || `conn-${Math.random().toString(36).slice(2)}`, sourceNodeId: sourceNode.id, sourceSocketId: sourceResolved.id, targetNodeId: targetNode.id, targetSocketId: targetResolved.id };
  }).filter(Boolean);

  const tempNodes: ShaderNode[] = sanitizedNodes.map(n => {
    const mod = getNodeModule(n.type);
    const def = mod?.definition;
    return {
      id: n.id,
      type: n.type as any,
      label: (n as any).label || def?.label || n.type,
      x: n.x,
      y: n.y,
      inputs: Array.isArray((n as any).inputs) ? (n as any).inputs : (def?.inputs || []),
      outputs: Array.isArray((n as any).outputs) ? (n as any).outputs : (def?.outputs || []),
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
    } catch { return 1; }
  };

  sanitizedConnections = (sanitizedConnections as any[]).map((c, idx) => ({ c, idx })).sort((a, b) => {
    const aSourceX = (nodeById.get(a.c.sourceNodeId)?.x ?? 0);
    const bSourceX = (nodeById.get(b.c.sourceNodeId)?.x ?? 0);
    if (a.c.targetNodeId !== b.c.targetNodeId) return a.c.targetNodeId.localeCompare(b.c.targetNodeId);
    if (a.c.targetSocketId !== b.c.targetSocketId) return a.c.targetSocketId.localeCompare(b.c.targetSocketId);
    if (aSourceX !== bSourceX) return bSourceX - aSourceX;
    return b.idx - a.idx;
  }).reduce((acc: any[], item) => {
    const c = item.c;
    const key = `${c.targetNodeId}::${c.targetSocketId}`;
    const max = getMaxIncoming(c.targetNodeId, c.targetSocketId);
    const current = acc.filter(x => `${x.targetNodeId}::${x.targetSocketId}` === key).length;
    if (current < max) acc.push(c); else stats.connections_trimmed_by_maxIncoming++;
    return acc;
  }, []);

  const outputHasIncoming = (sanitizedConnections as any[]).some(c => c && c.targetNodeId === 'output');
  let prunedNodes = sanitizedNodes;
  let prunedConnections = sanitizedConnections as any[];

  if (outputHasIncoming) {
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
        if (!keep.has(src)) { keep.add(src); stack.push(src); }
      }
    }
    prunedNodes = sanitizedNodes.filter(n => keep.has(n.id));
    stats.nodes_pruned_unreachable = sanitizedNodes.length - prunedNodes.length;
    const prunedNodeIds = new Set(prunedNodes.map(n => n.id));
    prunedConnections = (sanitizedConnections as any[]).filter(c => prunedNodeIds.has(c.sourceNodeId) && prunedNodeIds.has(c.targetNodeId));
  }

  const finalGraph = { nodes: prunedNodes, connections: prunedConnections };
  return {
    graph: finalGraph,
    report: {
      changed: stats.nodes_unknownType_removed > 0 || stats.nodes_id_renamed > 0 || stats.nodes_master_added > 0 || stats.nodes_master_conflict_renamed > 0 || stats.connections_invalid_removed > 0 || stats.connections_trimmed_by_maxIncoming > 0 || stats.nodes_pruned_unreachable > 0,
      issues, examples, stats, final: { nodeCount: prunedNodes.length, connectionCount: prunedConnections.length },
    },
  };
}

export function buildDynamicGraphContext(currentNodes: ShaderNode[], currentConnections: Connection[], prompt?: string): string {
  // Keep the current graph snapshot compact to avoid blowing up context.
  const snapshot = {
    nodes: currentNodes.map(n => ({
      id: n.id,
      type: n.type,
      x: Math.round(n.x),
      y: Math.round(n.y),
      ...(n.type === 'customFunction' || (n.data && ((n.data as any).customInputs?.length || (n.data as any).customOutputs?.length))
        ? {
          inputs: (n as any).inputs,
          outputs: (n as any).outputs,
        }
        : {}),
      data: n.data,
    })),
    connections: currentConnections.map(c => ({
      sourceNodeId: c.sourceNodeId,
      sourceSocketId: c.sourceSocketId,
      targetNodeId: c.targetNodeId,
      targetSocketId: c.targetSocketId,
    })),
  };
  const requiredMasterInputs = inferRequiredMasterInputs(prompt || '');

  return [
    'DYNAMIC_CONTEXT:',
    `- REQUIRED_MASTER_INPUTS (derived from user prompt): ${requiredMasterInputs.map(s => `output.${s}`).join(', ')}`,
    'CURRENT_GRAPH_SNAPSHOT (for modification tasks / ops base):',
    JSON.stringify(snapshot),
  ].join('\n');
}

export function convertToShaderNodes(rawNodes: any[]): ShaderNode[] {
  return rawNodes.map(n => {
    const mod = getNodeModule(n.type);
    const def = mod?.definition;

    // Prioritize node's own inputs/outputs if they exist (Agent's full JSON)
    // but fallback to registry definitions if they are missing or empty.
    const inputs = (Array.isArray(n.inputs) && n.inputs.length > 0) ? n.inputs : (def?.inputs || []);
    const outputs = (Array.isArray(n.outputs) && n.outputs.length > 0) ? n.outputs : (def?.outputs || []);

    return {
      id: n.id,
      type: n.type,
      label: n.label || def?.label || n.type,
      x: n.x || 0,
      y: n.y || 0,
      inputs,
      outputs,
      data: (n.data && typeof n.data === 'object') ? n.data : { ...(n.dataValue !== undefined ? { value: n.dataValue } : {}) }
    } as ShaderNode;
  });
}
