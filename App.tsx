
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Node } from './components/Node';
import { Preview } from './components/Preview';
import { SceneView } from './components/SceneView';
import { GlobalCanvas } from './components/GlobalCanvas'; // Import Global Canvas
import { GeminiAssistantSidebar } from './components/GeminiAssistantSidebar';
import { generateFragmentShader, generateVertexShader } from './services/render/glslGenerator';
import { geminiService } from './services/gemini/geminiService';
import { lintGraph } from './services/gemini/linter';
import { ShaderNode, Connection, Viewport, NodeType, SocketType, SocketDef, SessionAsset, GenerationPhase } from './types';
import { INITIAL_NODES, INITIAL_CONNECTIONS } from './initialGraph';
import { NODE_LIST, getNodeModule } from './nodes';
import { getEffectiveSockets } from './nodes/runtime';
import { previewSystem } from './services/render/previewSystem';
import { dispatchCommand } from './services/gemini/commands/dispatch';
import { Wand2, Download, Upload, ZoomIn, ZoomOut, MousePointer2, Box, Square, Save, Layers, Network, CheckCircle2, Loader2, Sparkles, FileJson, AlertCircle, Plus, FilePlus, Circle, AppWindow, Code2 } from 'lucide-react';
import { CodeEditor } from './components/CodeEditor';

const App: React.FC = () => {
  const suppressManualHistoryRef = useRef(false);
  const prevSnapshotRef = useRef<{ nodes: ShaderNode[]; connections: Connection[] } | null>(null);
  const pendingOpsRef = useRef<any[]>([]);
  const manualOpsDebounceRef = useRef<number | null>(null);

  const parseBool = useCallback((value: any) => {
    if (value === true) return true;
    const s = String(value ?? '').trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'on';
  }, []);

  const persistentChatEnabled = useMemo(() => {
    return parseBool((import.meta as any).env?.VITE_GEMINI_PERSIST_CHAT_SESSION ?? (import.meta.env as any)?.VITE_GEMINI_PERSIST_CHAT_SESSION);
  }, [parseBool]);

  const graphOutputMode = useMemo(() => {
    const raw = (import.meta as any).env?.VITE_GEMINI_GRAPH_OUTPUT_MODE ?? (import.meta.env as any)?.VITE_GEMINI_GRAPH_OUTPUT_MODE;
    const v = String(raw ?? '').trim().toLowerCase();
    return v === 'ops' ? 'ops' : 'graph';
  }, []);

  const [lastAiMeta, setLastAiMeta] = useState<any | null>(null);
  const [lastResponseText, setLastResponseText] = useState<string | null>(null);
  const [lastAssistantResponse, setLastAssistantResponse] = useState<string | null>(null);

  const getDefinitionOrPlaceholder = useCallback((type: string) => {
    return (
      getNodeModule(type)?.definition ?? {
        type,
        label: type,
        inputs: [],
        outputs: [],
      }
    );
  }, []);

  const handleNewGraph = () => {
    if (confirm('Are you sure you want to create a new graph? Unsaved changes will be lost.')) {
      suppressManualHistoryRef.current = true;
      geminiService.resetPersistentGraphSession();
      geminiService.setPersistentGraphBaseline(INITIAL_NODES, INITIAL_CONNECTIONS);
      setNodes(INITIAL_NODES);
      setConnections(INITIAL_CONNECTIONS);
      setViewport({ x: 0, y: 0, zoom: 1 });
      setSelectedNodeIds(new Set());
      setFileHandle(null);
      setFileName(null);
      setIsSaved(true);
      // allow one tick for state to settle
      setTimeout(() => {
        suppressManualHistoryRef.current = false;
      }, 0);
    }
  };

  // --- Global State ---
  const [activeTab, setActiveTab] = useState<'graph' | 'scene' | 'code'>('graph');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  // --- Graph State ---
  const [nodes, setNodes] = useState<ShaderNode[]>(INITIAL_NODES);
  const [connections, setConnections] = useState<Connection[]>(INITIAL_CONNECTIONS);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });

  // Selection State
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);

  // Expert AI Focus (node attachments)
  const [attachedNodeIds, setAttachedNodeIds] = useState<Set<string>>(new Set());

  // Clipboard State
  const [clipboard, setClipboard] = useState<{ nodes: ShaderNode[], connections: Connection[] } | null>(null);

  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);

  // Preview State (Mini preview in Graph)
  const [previewMode, setPreviewMode] = useState<'2d' | '3d'>('2d');
  const [previewObject, setPreviewObject] = useState<'sphere' | 'cube' | 'plane'>('sphere');

  // Interaction State
  const [isDraggingNodes, setIsDraggingNodes] = useState(false);
  const [connecting, setConnecting] = useState<{ nodeId: string, socketId: string, isInput: boolean, type: SocketType, x: number, y: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [lastPan, setLastPan] = useState({ x: 0, y: 0 });

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, clientX: number, clientY: number, open: boolean } | null>(null);
  const [contextSearch, setContextSearch] = useState('');

  const toggleAttachSelection = useCallback(() => {
    const selection = Array.from(selectedNodeIds);
    if (!selection.length) return;

    setAttachedNodeIds(prev => {
      const next = new Set(prev);
      const allAttached = selection.every(id => next.has(id));
      if (allAttached) {
        selection.forEach(id => next.delete(id));
      } else {
        selection.forEach(id => next.add(id));
      }
      return next;
    });
  }, [selectedNodeIds]);

  const clearAttachedNodes = useCallback(() => {
    setAttachedNodeIds(new Set());
  }, []);

  const attachedNodesSummary = useMemo(() => {
    const ids = attachedNodeIds.size ? Array.from(attachedNodeIds) : ([] as string[]);
    if (!ids.length) return [] as Array<{ id: string; label: string; type: string }>;
    const byId = new Map(nodes.map(n => [n.id, n] as const));
    const resolved = ids
      .map(id => byId.get(id))
      .filter((n): n is (typeof nodes)[number] => Boolean(n));
    return resolved.map(n => ({ id: n.id, label: n.label, type: n.type }));
  }, [attachedNodeIds, nodes]);

  const focusText = useMemo(() => {
    const seedIds: string[] = attachedNodeIds.size ? Array.from(attachedNodeIds.values()) : [];
    if (!seedIds.length) return '';

    const incoming = new Map<string, Connection[]>();
    const outgoing = new Map<string, Connection[]>();
    for (const c of connections) {
      if (!incoming.has(c.targetNodeId)) incoming.set(c.targetNodeId, []);
      if (!outgoing.has(c.sourceNodeId)) outgoing.set(c.sourceNodeId, []);
      incoming.get(c.targetNodeId)!.push(c);
      outgoing.get(c.sourceNodeId)!.push(c);
    }

    const visited = new Set<string>(seedIds);
    const queue: string[] = [...seedIds];
    const MAX_NODES = 80;

    while (queue.length && visited.size < MAX_NODES) {
      const id = queue.shift()!;
      const inc = incoming.get(id) || [];
      const out = outgoing.get(id) || [];

      for (const c of inc) {
        if (visited.size >= MAX_NODES) break;
        if (!visited.has(c.sourceNodeId)) {
          visited.add(c.sourceNodeId);
          queue.push(c.sourceNodeId);
        }
      }
      for (const c of out) {
        if (visited.size >= MAX_NODES) break;
        if (!visited.has(c.targetNodeId)) {
          visited.add(c.targetNodeId);
          queue.push(c.targetNodeId);
        }
      }
    }

    const subNodes = nodes
      .filter(n => visited.has(n.id))
      .map(n => ({ id: n.id, type: n.type, label: n.label }));
    const subConnections = connections
      .filter(c => visited.has(c.sourceNodeId) && visited.has(c.targetNodeId))
      .map(c => ({
        sourceNodeId: c.sourceNodeId,
        sourceSocketId: c.sourceSocketId,
        targetNodeId: c.targetNodeId,
        targetSocketId: c.targetSocketId,
      }));

    const payload = {
      attachedNodeIds: seedIds,
      focusMode: 'branch',
      subgraph: { nodes: subNodes, connections: subConnections },
    };

    let json = '';
    try {
      json = JSON.stringify(payload);
    } catch {
      json = String(payload);
    }

    const clipped = json.length > 6000 ? `${json.slice(0, 6000)}…` : json;
    return (
      'FOCUS (expert attachments): The user attached a focused subgraph. Prefer making edits within this subgraph unless asked otherwise.\n' +
      clipped
    );
  }, [attachedNodeIds, nodes, connections]);



  // AI Status State
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>('idle');
  const [linterLogs, setLinterLogs] = useState<string[]>([]);

  // Session Asset Library (in-memory)
  const [sessionAssets, setSessionAssets] = useState<SessionAsset[]>([]);

  const addSessionAsset = useCallback((dataUrl: string, suggestedName?: string) => {
    const s = String(dataUrl || '');
    if (!s.startsWith('data:image/')) {
      setLinterLogs(prev => [...prev, 'Asset add failed: only data:image/* is supported right now.']);
      return;
    }

    const mimeMatch = s.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const nameBase = String(suggestedName || '').trim();
    const name = nameBase || `asset-${sessionAssets.length + 1}`;

    const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setSessionAssets(prev => [...prev, { id, name, dataUrl: s, mimeType, createdAt: Date.now() }]);
    setLinterLogs(prev => [...prev, `Asset saved: ${name}`]);
  }, [sessionAssets.length]);

  const insertTextureAssetNodeFromAsset = useCallback((assetId: string) => {
    const asset = sessionAssets.find(a => a.id === assetId);
    if (!asset) return;

    const outNode = nodes.find(n => n.id === 'output') || nodes.find(n => n.type === 'output');
    const baseX = (outNode?.x ?? 600) - 520;
    const baseY = (outNode?.y ?? 180) + 140;

    const id = `texture2DAsset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const texMod = getNodeModule('texture2DAsset');
    const textureNode: ShaderNode = {
      id,
      ...getDefinitionOrPlaceholder('texture2DAsset'),
      x: baseX,
      y: baseY,
      data: {
        ...(texMod?.initialData ? (texMod.initialData(id) as any) : {}),
        textureAsset: asset.dataUrl,
      },
    };

    setNodes(prev => [...prev, textureNode]);
    setSelectedNodeIds(new Set([id]));
    setLinterLogs(prev => [...prev, `Inserted texture node from asset: ${asset.name}`]);
  }, [nodes, sessionAssets, getDefinitionOrPlaceholder]);

  const applyTextureDataUrlToTarget = useCallback((opts: {
    dataUrl: string;
    mimeType: string;
    targetNodeId: string;
    targetSocketId: string;
    operation: 'multiply' | 'replace';
    channel: 'rgba' | 'rgb' | 'r' | 'g' | 'b' | 'a';
    log?: (msg: string) => void;
  }) => {
    const handleLog = opts.log || (() => { });
    const makeId = (type: string) => `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const mkConn = (sourceNodeId: string, sourceSocketId: string, targetNodeId: string, targetSocketId: string): Connection => ({
      id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      sourceNodeId,
      sourceSocketId,
      targetNodeId,
      targetSocketId,
    });

    const targetNodeId = opts.targetNodeId || 'output';
    const targetSocketId = opts.targetSocketId || 'color';
    const operation = opts.operation || 'multiply';
    const channel = opts.channel || 'rgba';

    // Place nodes near the output node if present.
    const outNode = nodes.find(n => n.id === 'output') || nodes.find(n => n.type === 'output');
    const baseX = (outNode?.x ?? 600) - 600;
    const baseY = (outNode?.y ?? 180) - 80;

    const texId = makeId('texture2DAsset');
    const texMod = getNodeModule('texture2DAsset');
    const textureNode: ShaderNode = {
      id: texId,
      ...getDefinitionOrPlaceholder('texture2DAsset'),
      x: baseX,
      y: baseY,
      data: {
        ...(texMod?.initialData ? (texMod.initialData(texId) as any) : {}),
        textureAsset: opts.dataUrl,
      },
    };

    const newNodes: ShaderNode[] = [textureNode];
    const newConns: Connection[] = [];

    // Remove existing connection into the target socket (we will replace it)
    const existingTargetConn = connections.find(c => c.targetNodeId === targetNodeId && c.targetSocketId === targetSocketId);
    const nextConnectionsBase = existingTargetConn
      ? connections.filter(c => c.id !== existingTargetConn.id)
      : connections;

    const isFloatTarget = ['alpha', 'specular', 'smoothness', 'occlusion'].includes(targetSocketId);
    const isNormalTarget = targetSocketId === 'normal';

    const getTextureSourceForTarget = (): { sourceNodeId: string; sourceSocketId: string } => {
      if (isNormalTarget) {
        const nId = makeId('normalUnpack');
        const nMod = getNodeModule('normalUnpack');
        newNodes.push({
          id: nId,
          ...getDefinitionOrPlaceholder('normalUnpack'),
          x: baseX + 240,
          y: baseY + 140,
          data: {
            ...(nMod?.initialData ? (nMod.initialData(nId) as any) : {}),
            space: 'Tangent',
          },
        });
        newConns.push(mkConn(texId, 'out', nId, 'in'));
        return { sourceNodeId: nId, sourceSocketId: 'out' };
      }

      if (isFloatTarget || channel === 'r' || channel === 'g' || channel === 'b' || channel === 'a') {
        const sId = makeId('split');
        const sMod = getNodeModule('split');
        newNodes.push({
          id: sId,
          ...getDefinitionOrPlaceholder('split'),
          x: baseX + 240,
          y: baseY + 10,
          data: {
            ...(sMod?.initialData ? (sMod.initialData(sId) as any) : {}),
          },
        });
        newConns.push(mkConn(texId, 'out', sId, 'in'));

        const ch = (channel === 'r' || channel === 'g' || channel === 'b' || channel === 'a')
          ? channel
          : (targetSocketId === 'alpha' ? 'a' : 'r');

        return { sourceNodeId: sId, sourceSocketId: ch };
      }

      return { sourceNodeId: texId, sourceSocketId: 'out' };
    };

    const texSource = getTextureSourceForTarget();

    if (operation === 'multiply') {
      const mulId = makeId('multiply');
      const mulMod = getNodeModule('multiply');
      newNodes.push({
        id: mulId,
        ...getDefinitionOrPlaceholder('multiply'),
        x: baseX + 480,
        y: baseY + (isNormalTarget ? 140 : 10),
        data: {
          ...(mulMod?.initialData ? (mulMod.initialData(mulId) as any) : {}),
        },
      });

      if (existingTargetConn) {
        newConns.push(mkConn(existingTargetConn.sourceNodeId, existingTargetConn.sourceSocketId, mulId, 'a'));
      }
      newConns.push(mkConn(texSource.sourceNodeId, texSource.sourceSocketId, mulId, 'b'));
      newConns.push(mkConn(mulId, 'out', targetNodeId, targetSocketId));
    } else {
      newConns.push(mkConn(texSource.sourceNodeId, texSource.sourceSocketId, targetNodeId, targetSocketId));
    }

    setNodes(prev => [...prev, ...newNodes]);
    setConnections([...nextConnectionsBase, ...newConns]);

    handleLog(`Applied texture to ${targetNodeId}.${targetSocketId} (${operation}, channel=${channel}).`);
  }, [connections, getDefinitionOrPlaceholder, nodes]);

  // File System State
  const [fileHandle, setFileHandle] = useState<any>(null); // Type 'any' to avoid TS errors with modern API in strict mode
  const [fileName, setFileName] = useState<string>('shader-graph');
  const [isSaved, setIsSaved] = useState(true); // Track unsaved changes slightly (visual only)
  const [fileSystemError, setFileSystemError] = useState<boolean>(false); // Track if FSA API is blocked

  // Some browser extensions emit noisy unhandled rejections (chrome.runtime message channel closed).
  // In dev, this can look like an app failure; filter the known pattern only.
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason: any = (event as any).reason;
      const msg = (reason && (reason.message || reason.toString?.())) ? String(reason.message || reason.toString()) : '';
      if (
        msg.includes('A listener indicated an asynchronous response') &&
        msg.includes('message channel closed')
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  // Derived - Master Shader
  const fragShader = useMemo(() => {
    try {
      return generateFragmentShader(nodes, connections);
    } catch (e) {
      console.error("Fragment Generation Error:", e);
      return "void main() { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); }";
    }
  }, [nodes, connections]);

  const vertShader = useMemo(() => {
    try {
      return generateVertexShader(nodes, connections);
    } catch (e) {
      console.error("Vertex Generation Error:", e);
      return "void main() { gl_Position = vec4(0.0); }";
    }
  }, [nodes, connections]);

  // Derived - Texture Maps for Uniforms with Sampler State
  const textureUniforms = useMemo(() => {
    // Map stores { url, wrap, filter } instead of just url string
    const map: Record<string, { url: string, wrap: string, filter: string }> = {};

    // 1. Handle Texture Nodes with Internal Assets (No input connection) or gathered from input
    // FIXED: Added 'calculateLevelOfDetailTexture', 'textureSize', and 'parallaxMapping' to ensure main scene gets data
    nodes.filter(n => getNodeModule(n.type)?.metadata?.isTextureSampler).forEach(n => {
      // Determine Asset URL
      let assetUrl = n.data.textureAsset;
      const assetConn = connections.find(c => c.targetNodeId === n.id && c.targetSocketId === 'texture');

      if (assetConn) {
        const sourceNode = nodes.find(sn => sn.id === assetConn.sourceNodeId);
        if (sourceNode && sourceNode.data.textureAsset) {
          assetUrl = sourceNode.data.textureAsset;
        }
      }

      if (assetUrl) {
        const uniformName = `u_tex_${n.id.replace(/[-.]/g, '_')}`;

        // Resolve Sampler State
        let wrap = 'Repeat';
        let filter = 'Linear';
        const samplerConn = connections.find(c => c.targetNodeId === n.id && c.targetSocketId === 'sampler');
        if (samplerConn) {
          const samplerNode = nodes.find(sn => sn.id === samplerConn.sourceNodeId);
          if (samplerNode) {
            wrap = samplerNode.data.samplerWrap || 'Repeat';
            filter = samplerNode.data.samplerFilter || 'Linear';
          }
        }

        map[uniformName] = { url: assetUrl, wrap, filter };
      }
    });

    // 2. (Redundant) Orphaned Texture Assets are now handled by Step 1 via metadata.isTextureSampler

    return map;
  }, [nodes, connections]);

  // Refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLInputElement>(null);

  // Focus context search
  useEffect(() => {
    if (contextMenu?.open && contextMenuRef.current) {
      contextMenuRef.current.focus();
    }
  }, [contextMenu]);

  // Mark as unsaved on changes
  useEffect(() => {
    setIsSaved(false);
  }, [nodes, connections]);

  // --- Handlers ---

  const canDeleteNode = (id: string) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return false;
    // Protect Master nodes
    return node.type !== 'output' && node.type !== 'vertex';
  };

  const deleteSelected = () => {
    const idsToDelete = Array.from(selectedNodeIds).filter(id => canDeleteNode(id as string));
    if (idsToDelete.length === 0) return;

    setNodes(prev => prev.filter(n => !idsToDelete.includes(n.id)));
    setConnections(prev => prev.filter(c => !idsToDelete.includes(c.sourceNodeId) && !idsToDelete.includes(c.targetNodeId)));
    setSelectedNodeIds(new Set());
  };

  // --- Copy / Paste Logic ---

  const copySelection = useCallback(() => {
    if (selectedNodeIds.size === 0) return;

    const nodesToCopy = nodes.filter(n => selectedNodeIds.has(n.id));
    const connectionsToCopy = connections.filter(c =>
      selectedNodeIds.has(c.sourceNodeId) && selectedNodeIds.has(c.targetNodeId)
    );

    setClipboard({
      nodes: JSON.parse(JSON.stringify(nodesToCopy)),
      connections: JSON.parse(JSON.stringify(connectionsToCopy))
    });
  }, [nodes, connections, selectedNodeIds]);

  const pasteSelection = useCallback(() => {
    if (!clipboard || clipboard.nodes.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    clipboard.nodes.forEach(n => {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
    });

    const graphMouseX = (mousePos.x - viewport.x) / viewport.zoom;
    const graphMouseY = (mousePos.y - viewport.y) / viewport.zoom;
    const useMouse = mousePos.x !== 0 || mousePos.y !== 0;
    const offsetX = useMouse ? graphMouseX - minX : 50;
    const offsetY = useMouse ? graphMouseY - minY : 50;

    const getNextNodeId = (type: string, existingNodes: ShaderNode[]) => {
      let i = 0;
      const prefix = type ? `${type}_` : 'n';
      while (existingNodes.some(n => n.id === `${prefix}${i}`)) i++;
      return `${prefix}${i}`;
    };

    const getNextConnId = (existingConns: Connection[]) => {
      let i = 0;
      while (existingConns.some(c => c.id === `c${i}`)) i++;
      return `c${i}`;
    };

    const idMap = new Map<string, string>();
    const newNodes: ShaderNode[] = [];
    let currentNodesSnapshot = [...nodes];

    clipboard.nodes.forEach(node => {
      const newId = getNextNodeId(node.type, currentNodesSnapshot);
      idMap.set(node.id, newId);
      const newNode = {
        ...node,
        id: newId,
        x: node.x + offsetX,
        y: node.y + offsetY,
        data: JSON.parse(JSON.stringify(node.data))
      };
      newNodes.push(newNode);
      currentNodesSnapshot.push(newNode);
    });

    let currentConnsSnapshot = [...connections];
    const newConnections: Connection[] = clipboard.connections.map(conn => {
      const newId = getNextConnId(currentConnsSnapshot);
      const newConn = {
        id: newId,
        sourceNodeId: idMap.get(conn.sourceNodeId)!,
        targetNodeId: idMap.get(conn.targetNodeId)!,
        sourceSocketId: conn.sourceSocketId,
        targetSocketId: conn.targetSocketId
      };
      currentConnsSnapshot.push(newConn);
      return newConn;
    });

    setNodes(prev => [...prev, ...newNodes]);
    setConnections(prev => [...prev, ...newConnections]);
    setSelectedNodeIds(new Set(newNodes.map(n => n.id)));

  }, [clipboard, mousePos, viewport, nodes, connections]);

  // --- File Save/Load Logic ---

  const loadGraphFromString = (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      if (data && typeof data === 'object' && Array.isArray((data as any).nodes) && Array.isArray((data as any).connections)) {
        const typedData = data as { nodes: ShaderNode[], connections: Connection[], previewMode?: '2d' | '3d' };

        // Normalize legacy Custom Function labels that were incorrectly overwritten by functionName.
        const defaultCustomFnLabel = getNodeModule('customFunction')?.definition?.label || 'Custom Function';
        const normalizedNodes = typedData.nodes.map(n => {
          if (n.type !== 'customFunction') return n;
          const fn = (n.data as any)?.functionName;
          if (!n.label || (fn && n.label === fn) || n.label === 'main') {
            return { ...n, label: defaultCustomFnLabel };
          }
          return n;
        });

        suppressManualHistoryRef.current = true;
        geminiService.resetPersistentGraphSession();

        setViewport({ x: 0, y: 0, zoom: 1 });
        setSelectedNodeIds(new Set<string>());

        if (typedData.previewMode) {
          setPreviewMode(typedData.previewMode);
        } else {
          setPreviewMode('3d');
        }

        setNodes([]);
        setConnections([]);

        setTimeout(() => {
          setNodes(normalizedNodes);
          setConnections(typedData.connections);
          setIsSaved(true);

          geminiService.setPersistentGraphBaseline(normalizedNodes, typedData.connections);
          suppressManualHistoryRef.current = false;
        }, 50);
      } else {
        alert('Invalid file format: Missing nodes or connections array.');
      }
    } catch (err: any) {
      console.error("Parse Error:", err);
      alert('Failed to parse file.');
    }
  };

  const toConnKey = (c: Connection) => `${c.sourceNodeId}:${c.sourceSocketId}->${c.targetNodeId}:${c.targetSocketId}`;

  const diffGraphToOps = (
    prev: { nodes: ShaderNode[]; connections: Connection[] },
    next: { nodes: ShaderNode[]; connections: Connection[] }
  ): any[] => {
    const ops: any[] = [];

    const prevNodesById = new Map(prev.nodes.map(n => [n.id, n] as const));
    const nextNodesById = new Map(next.nodes.map(n => [n.id, n] as const));

    // Node deletes
    for (const [id] of prevNodesById) {
      if (!nextNodesById.has(id)) {
        ops.push({ action: 'delete', id });
      }
    }

    // Node adds + edits
    for (const [id, node] of nextNodesById) {
      const prevNode = prevNodesById.get(id);
      if (!prevNode) {
        ops.push({
          action: 'add',
          id,
          node_content: {
            id: node.id,
            type: node.type,
            x: node.x,
            y: node.y,
            ...(node.data ? { data: node.data } : {}),
          },
        });
        continue;
      }

      const patch: any = {};
      if (prevNode.x !== node.x) patch.x = node.x;
      if (prevNode.y !== node.y) patch.y = node.y;

      const prevData = prevNode.data ?? {};
      const nextData = node.data ?? {};
      const dataPatch: any = {};
      const keys = new Set([...Object.keys(prevData), ...Object.keys(nextData)]);
      for (const k of keys) {
        if ((prevData as any)[k] !== (nextData as any)[k]) {
          dataPatch[k] = (nextData as any)[k];
        }
      }
      if (Object.keys(dataPatch).length > 0) patch.data = dataPatch;

      if (Object.keys(patch).length > 0) {
        ops.push({ action: 'edit', id, node_content: patch });
      }
    }

    // Connection diffs (add/delete)
    const prevConnKeys = new Map(prev.connections.map(c => [toConnKey(c), c] as const));
    const nextConnKeys = new Map(next.connections.map(c => [toConnKey(c), c] as const));

    const addConns: any[] = [];
    for (const [k, c] of nextConnKeys) {
      if (!prevConnKeys.has(k)) {
        addConns.push({
          sourceNodeId: c.sourceNodeId,
          sourceSocketId: c.sourceSocketId,
          targetNodeId: c.targetNodeId,
          targetSocketId: c.targetSocketId,
          ...(c.id ? { id: c.id } : {}),
        });
      }
    }

    const delConns: any[] = [];
    for (const [k, c] of prevConnKeys) {
      if (!nextConnKeys.has(k)) {
        delConns.push({
          sourceNodeId: c.sourceNodeId,
          sourceSocketId: c.sourceSocketId,
          targetNodeId: c.targetNodeId,
          targetSocketId: c.targetSocketId,
          ...(c.id ? { id: c.id } : {}),
        });
      }
    }

    if (addConns.length > 0) {
      ops.push({ action: 'edit', id: 'output', connection_content: addConns });
    }
    if (delConns.length > 0) {
      ops.push({ action: 'edit', id: 'output', connections_delete: delConns });
    }

    return ops;
  };

  useEffect(() => {
    // Keep a baseline for persistent chat (even if persistence is disabled, this is a no-op).
    if (!prevSnapshotRef.current) {
      prevSnapshotRef.current = { nodes, connections };
      geminiService.setPersistentGraphBaseline(nodes, connections);
      return;
    }

    const prev = prevSnapshotRef.current;
    const next = { nodes, connections };
    prevSnapshotRef.current = next;

    if (suppressManualHistoryRef.current) return;

    const ops = diffGraphToOps(prev, next);
    if (ops.length === 0) return;

    // Debounce + coalesce to avoid spamming history during drags.
    pendingOpsRef.current.push(...ops);
    if (manualOpsDebounceRef.current) window.clearTimeout(manualOpsDebounceRef.current);
    manualOpsDebounceRef.current = window.setTimeout(() => {
      const batch = pendingOpsRef.current.splice(0, pendingOpsRef.current.length);
      if (batch.length > 0) {
        geminiService.appendManualGraphOpsToPersistentHistory(batch, (msg: string) => {
          setLinterLogs(prevLogs => [...prevLogs, msg]);
        }).catch(() => {
          // ignore
        });
      }
    }, 400);
  }, [nodes, connections]);

  const handleOpen = useCallback(async () => {
    let usedNative = false;
    setFileSystemError(false);

    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
          multiple: false
        });
        const file = await handle.getFile();
        const text = await file.text();
        loadGraphFromString(text);
        setFileHandle(handle);
        setFileName(file.name.replace('.json', ''));
        usedNative = true;
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn("Native file picker failed, falling back.", err);
          setFileSystemError(true);
        } else {
          usedNative = true;
        }
      }
    }
    if (!usedNative) {
      fileInputRef.current?.click();
    }
  }, []);

  const handleFallbackLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      const target = event.target as FileReader;
      if (typeof target?.result === 'string') {
        loadGraphFromString(target.result);
        setFileName(file.name.replace('.json', ''));
        setFileHandle(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const saveGraph = useCallback(async (forceSaveAs = false) => {
    const data = JSON.stringify({ nodes, connections, previewMode }, null, 2);
    const supportsFileSystem = 'showSaveFilePicker' in window;
    let targetHandle = fileHandle;

    if (supportsFileSystem && (forceSaveAs || !targetHandle)) {
      try {
        const opts = {
          suggestedName: `${fileName}.json`,
          types: [{ description: 'JSON File', accept: { 'application/json': ['.json'] } }],
        };
        // @ts-ignore
        targetHandle = await window.showSaveFilePicker(opts);
        setFileHandle(targetHandle);
        setFileName(targetHandle.name.replace('.json', ''));
        setFileSystemError(false);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.warn("Native Save failed, falling back:", err);
        setFileSystemError(true);
      }
    }

    if (targetHandle) {
      try {
        const writable = await targetHandle.createWritable();
        await writable.write(data);
        await writable.close();
        setIsSaved(true);
        return;
      } catch (err) {
        console.error("Write failed:", err);
        alert("Failed to write to file. Downloading copy instead.");
      }
    }

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName || 'shader-graph'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setIsSaved(true);
  }, [nodes, connections, previewMode, fileHandle, fileName]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTextTarget = (el: HTMLElement | null | undefined) => {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || Boolean((el as any).isContentEditable);
      };

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveGraph(e.shiftKey);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpen();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const target = e.target as HTMLElement;
        if (isTextTarget(target)) return;

        const selection = window.getSelection();
        const hasSelectedText = Boolean(selection && selection.toString().length > 0);
        const hasNodeSelection = selectedNodeIds.size > 0 && activeTab === 'graph';

        // If there are nodes selected, always update the internal node clipboard.
        // If there is also text selected, let the browser copy the text normally.
        if (hasNodeSelection) {
          copySelection();
        }
        if (hasSelectedText) return;

        // No text selection: in graph mode, Ctrl+C should copy nodes.
        if (hasNodeSelection) {
          e.preventDefault();
          return;
        }

        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        const target = e.target as HTMLElement;
        if (isTextTarget(target)) return;

        const hasNodeClipboard = Boolean(clipboard && clipboard.nodes && clipboard.nodes.length > 0);
        if (activeTab === 'graph' && hasNodeClipboard) {
          e.preventDefault();
          pasteSelection();
          return;
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewGraph();
        return;
      }

      const target = e.target as HTMLElement;
      if (isTextTarget(target)) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeIds.size > 0 && activeTab === 'graph') {
          deleteSelected();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds, activeTab, nodes, connections, previewMode, fileHandle, fileName, saveGraph, handleOpen, copySelection, pasteSelection]);

  const getGraphCoordinates = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTab !== 'graph') return;
    if (contextMenu?.open) setContextMenu(null);

    if (e.button === 1) {
      e.preventDefault();
      setPanning(true);
      setLastPan({ x: e.clientX, y: e.clientY });
      return;
    }
    if (e.button === 0 && !connecting) {
      if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === 'svg') {
        if (!e.ctrlKey) setSelectedNodeIds(new Set());
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y });
        }
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (activeTab !== 'graph') return;
    e.preventDefault();
    setContextSearch('');
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setContextMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        clientX: e.clientX,
        clientY: e.clientY,
        open: true,
      });
    } else {
      setContextMenu({ x: e.clientX, y: e.clientY, clientX: e.clientX, clientY: e.clientY, open: true });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (activeTab !== 'graph') return;
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setMousePos({ x: e.clientX, y: e.clientY });
    }
    if (panning) {
      const dx = e.clientX - lastPan.x;
      const dy = e.clientY - lastPan.y;
      setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setLastPan({ x: e.clientX, y: e.clientY });
      return;
    }
    if (selectionBox) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setSelectionBox(prev => prev ? ({ ...prev, currentX: x, currentY: y }) : null);
      }
      return;
    }
    if (isDraggingNodes && selectedNodeIds.size > 0) {
      const dx = e.movementX / viewport.zoom;
      const dy = e.movementY / viewport.zoom;
      setNodes(prev => prev.map(n => {
        if (selectedNodeIds.has(n.id)) {
          return { ...n, x: n.x + dx, y: n.y + dy };
        }
        return n;
      }));
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (activeTab !== 'graph') return;
    if (panning) setPanning(false);
    if (selectionBox) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect && canvasRef.current) {
        const startX = Math.min(selectionBox.startX, selectionBox.currentX);
        const startY = Math.min(selectionBox.startY, selectionBox.currentY);
        const endX = Math.max(selectionBox.startX, selectionBox.currentX);
        const endY = Math.max(selectionBox.startY, selectionBox.currentY);

        const newSelection = new Set(e.ctrlKey ? selectedNodeIds : []);
        nodes.forEach(node => {
          const el = document.getElementById(`node-${node.id}`);
          if (el) {
            const nodeRect = el.getBoundingClientRect();
            // Calculate coordinates relative to the canvas container (same space as selectionBox)
            const canvasRect = canvasRef.current!.getBoundingClientRect();
            const nodeLeft = nodeRect.left - canvasRect.left;
            const nodeTop = nodeRect.top - canvasRect.top;

            // Check intersection (AABB)
            if (
              startX < nodeLeft + nodeRect.width &&
              endX > nodeLeft &&
              startY < nodeTop + nodeRect.height &&
              endY > nodeTop
            ) {
              newSelection.add(node.id);
            }
          }
        });
        setSelectedNodeIds(newSelection);
      }
      setSelectionBox(null);
    }
    setIsDraggingNodes(false);
    setConnecting(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (activeTab !== 'graph') return;
    // Disable zoom if context menu is open
    if (contextMenu?.open) return;

    e.stopPropagation();
    const newZoom = Math.max(0.1, Math.min(3, viewport.zoom - e.deltaY * 0.001));
    setViewport(prev => ({ ...prev, zoom: newZoom }));
  };

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (contextMenu?.open) setContextMenu(null);
    if (e.ctrlKey) {
      const newSet = new Set(selectedNodeIds);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      setSelectedNodeIds(newSet);
    } else {
      if (!selectedNodeIds.has(id)) setSelectedNodeIds(new Set([id]));
    }
    setIsDraggingNodes(true);
  };

  const handleSocketMouseDown = (e: React.MouseEvent, nodeId: string, socketId: string, isInput: boolean, type: SocketType) => {
    e.stopPropagation();
    e.preventDefault();
    // Ensure draft connection end follows cursor immediately (even before first mousemove)
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setMousePos({ x: e.clientX, y: e.clientY });
    }
    setConnecting({ nodeId, socketId, isInput, type, x: e.clientX, y: e.clientY });
  };

  const getMaxConnectionsForSocket = (
    nodeId: string,
    socketId: string,
    direction: 'input' | 'output',
  ): number => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return direction === 'input' ? 1 : Number.POSITIVE_INFINITY;

    const mod = getNodeModule(node.type);
    const sockets = direction === 'input' ? node.inputs : node.outputs;
    const effective = getEffectiveSockets(node, sockets, direction, connections, mod?.socketRules);
    const socket = effective.find(s => s.id === socketId);
    return socket?.maxConnections ?? (direction === 'input' ? 1 : Number.POSITIVE_INFINITY);
  };

  const isTypeCompatible = (sourceType: SocketType, targetType: SocketType) => {
    if (sourceType === targetType) return true;

    // Special case: "Texture Asset" style nodes expose outputs as `texture` / `textureArray` in the UI,
    // but they actually emit a sampled `vec4` value for preview/codegen.
    // Allow wiring those outputs into numeric/vector sockets (e.g. Custom Function vec4 input).
    const vectorTypes = ['float', 'vec2', 'vec3', 'vec4', 'color', 'mat2', 'mat3', 'mat4'];
    if ((sourceType === 'texture' || sourceType === 'textureArray') && vectorTypes.includes(targetType)) {
      return true;
    }

    // Strict blocking for critical types to prevent illegal shader operations (like vec4 * mat3)
    const strictTypes = ['texture', 'textureArray', 'sampler', 'gradient', 'samplerState'];
    if (strictTypes.includes(sourceType) || strictTypes.includes(targetType)) {
      return sourceType === targetType;
    }

    // Allow general vector/float/matrix conversions (handled downstream by castTo)
    // (kept permissive; actual casting happens in glslGenerator.castTo)
    if (vectorTypes.includes(sourceType) && vectorTypes.includes(targetType)) {
      return true;
    }

    return false;
  };

  const handleSocketMouseUp = (e: React.MouseEvent, nodeId: string, socketId: string, isInput: boolean, type: SocketType) => {
    e.stopPropagation();
    if (connecting) {
      if (connecting.nodeId === nodeId) return;
      if (connecting.isInput === isInput) return;

      const source = connecting.isInput ? { nodeId, socketId, type } : { nodeId: connecting.nodeId, socketId: connecting.socketId, type: connecting.type };
      const target = connecting.isInput ? { nodeId: connecting.nodeId, socketId: connecting.socketId, type: connecting.type } : { nodeId, socketId, type };

      if (!isTypeCompatible(source.type, target.type)) return;

      const newConnection = {
        id: `conn-${Date.now()}`,
        sourceNodeId: source.nodeId,
        sourceSocketId: source.socketId,
        targetNodeId: target.nodeId,
        targetSocketId: target.socketId
      };

      setConnections(prev => {
        if (prev.some(c =>
          c.sourceNodeId === newConnection.sourceNodeId &&
          c.sourceSocketId === newConnection.sourceSocketId &&
          c.targetNodeId === newConnection.targetNodeId &&
          c.targetSocketId === newConnection.targetSocketId
        )) {
          return prev;
        }

        const targetMax = getMaxConnectionsForSocket(target.nodeId, target.socketId, 'input');
        const sourceMax = getMaxConnectionsForSocket(source.nodeId, source.socketId, 'output');

        let next = prev;

        if (Number.isFinite(targetMax)) {
          const targetCount = next.filter(c => c.targetNodeId === target.nodeId && c.targetSocketId === target.socketId).length;
          if (targetMax === 1) {
            next = next.filter(c => c.targetNodeId !== target.nodeId || c.targetSocketId !== target.socketId);
          } else if (targetCount >= targetMax) {
            return prev;
          }
        }

        if (Number.isFinite(sourceMax)) {
          const sourceCount = next.filter(c => c.sourceNodeId === source.nodeId && c.sourceSocketId === source.socketId).length;
          if (sourceMax === 1) {
            next = next.filter(c => c.sourceNodeId !== source.nodeId || c.sourceSocketId !== source.socketId);
          } else if (sourceCount >= sourceMax) {
            return prev;
          }
        }

        return [...next, newConnection];
      });
    }
    setConnecting(null);
  };

  const updateNodeData = (id: string, data: any) => {
    setNodes(prev => prev.map(n => {
      if (n.id === id) {
        return { ...n, data: { ...n.data, ...data } };
      }
      return n;
    }));
  };

  const handleOpenCodeEditor = useCallback((nodeId: string) => {
    setEditingNodeId(nodeId);
    setActiveTab('code');
  }, []);

  const parseCustomFunctionSocketsFromCode = (code: string): { inputs: any[]; outputs: any[] } | null => {
    const src = String(code || '');

    // Strip comments to avoid matching signatures inside commented code.
    const withoutBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const withoutLineComments = withoutBlockComments.replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');

    const m = /\bvoid\s+main\s*\(/.exec(withoutLineComments);
    if (!m) return null;

    // Extract the parameter list by scanning until the matching ')'.
    const start = m.index + m[0].length;
    let depth = 1;
    let end = start;
    while (end < withoutLineComments.length && depth > 0) {
      const ch = withoutLineComments[end];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      end++;
    }
    if (depth !== 0) return null;

    const argsRaw = withoutLineComments.slice(start, end - 1).trim();
    if (!argsRaw) return { inputs: [], outputs: [] };

    const args = argsRaw.split(',').map(s => s.trim()).filter(Boolean);

    const mapType = (glslType: string) => {
      const t = glslType.trim();
      if (t === 'float' || t === 'int' || t === 'vec2' || t === 'vec3' || t === 'vec4' || t === 'mat2' || t === 'mat3' || t === 'mat4') {
        return t === 'int' ? 'float' : t;
      }
      if (t === 'color') return 'color';
      if (t === 'sampler2D') return 'texture';
      if (t === 'sampler2DArray') return 'textureArray';
      return null;
    };

    const normalizeId = (name: string) => {
      const cleaned = name.replace(/\[[^\]]*\]$/g, '').trim();
      // Keep ids safe for downstream codegen
      const safe = cleaned.replace(/[^A-Za-z0-9_]/g, '_');
      if (!/^[A-Za-z_]/.test(safe)) return `p_${safe}`;
      return safe;
    };

    const inputs: any[] = [];
    const outputs: any[] = [];
    const skipQualifiers = new Set(['in', 'const', 'flat', 'smooth', 'noperspective', 'centroid', 'patch', 'sample']);

    for (const arg of args) {
      const cleanedArg = arg.replace(/layout\s*\([^)]*\)\s*/g, ' ').trim();
      const tokens = cleanedArg.split(/\s+/).filter(Boolean);
      if (tokens.length < 2) continue;

      let idx = 0;
      let qualifier: 'out' | 'inout' | null = null;
      while (idx < tokens.length - 1) {
        const token = tokens[idx];
        if (token === 'out' || token === 'inout') {
          qualifier = token;
          idx++;
          continue;
        }
        if (skipQualifiers.has(token)) {
          idx++;
          continue;
        }
        break;
      }

      const typeToken = tokens[idx++];
      const nameToken = tokens[idx++];
      if (!typeToken || !nameToken) continue;

      const socketType = mapType(typeToken);
      if (!socketType) continue;

      const id = normalizeId(nameToken);
      const socket = { id, label: id, type: socketType };

      if (qualifier === 'out' || qualifier === 'inout') outputs.push(socket);
      else inputs.push(socket);
    }

    return { inputs, outputs };
  };

  const handleSaveCustomFunction = useCallback((nodeId: string, data: { code: string, functionName: string, inputs: any[], outputs: any[] }) => {
    const parsed = parseCustomFunctionSocketsFromCode(data.code);
    const nextInputs = (parsed && parsed.inputs.length > 0) ? parsed.inputs : data.inputs;
    const nextOutputs = (parsed && parsed.outputs.length > 0) ? parsed.outputs : data.outputs;

    const diffSockets = (oldList: SocketDef[] = [], newList: SocketDef[] = []) => {
      const map: Record<string, string> = {};
      const removed = new Set<string>();
      const limit = Math.min(oldList.length, newList.length);
      for (let i = 0; i < limit; i++) {
        const oldId = oldList[i]?.id;
        const newId = newList[i]?.id;
        if (oldId && newId && oldId !== newId) {
          map[oldId] = newId;
        }
      }
      for (let i = limit; i < oldList.length; i++) {
        const oldId = oldList[i]?.id;
        if (oldId) removed.add(oldId);
      }
      return { map, removed };
    };

    let inputRemap: Record<string, string> = {};
    let outputRemap: Record<string, string> = {};
    const removedInputIds = new Set<string>();
    const removedOutputIds = new Set<string>();

    setNodes(prev => prev.map(n => {
      if (n.id === nodeId) {
        const defaultLabel = getNodeModule('customFunction')?.definition?.label || 'Custom Function';
        const nextLabel = (n.type === 'customFunction' && (n.label === data.functionName || !n.label))
          ? defaultLabel
          : n.label;

        const { map: inMap, removed: inRemoved } = diffSockets(Array.isArray(n.inputs) ? n.inputs : [], nextInputs);
        inputRemap = { ...inputRemap, ...inMap };
        inRemoved.forEach(id => removedInputIds.add(id));

        const { map: outMap, removed: outRemoved } = diffSockets(Array.isArray(n.outputs) ? n.outputs : [], nextOutputs);
        outputRemap = { ...outputRemap, ...outMap };
        outRemoved.forEach(id => removedOutputIds.add(id));

        return {
          ...n,
          label: nextLabel,
          inputs: nextInputs,
          outputs: nextOutputs,
          data: {
            ...n.data,
            code: data.code,
            functionName: data.functionName,
            customInputs: nextInputs,
            customOutputs: nextOutputs
          }
        };
      }
      return n;
    }));

    const needsConnectionUpdate = Object.keys(inputRemap).length > 0 || removedInputIds.size > 0 || Object.keys(outputRemap).length > 0 || removedOutputIds.size > 0;
    if (needsConnectionUpdate) {
      setConnections(prev => prev.reduce<Connection[]>((acc, conn) => {
        let updated = conn;
        let shouldDrop = false;

        if (conn.targetNodeId === nodeId) {
          const mapped = inputRemap[conn.targetSocketId];
          if (mapped) {
            updated = { ...updated, targetSocketId: mapped };
          } else if (removedInputIds.has(conn.targetSocketId)) {
            shouldDrop = true;
          }
        }

        if (conn.sourceNodeId === nodeId) {
          const mapped = outputRemap[conn.sourceSocketId];
          if (mapped) {
            updated = { ...updated, sourceSocketId: mapped };
          } else if (removedOutputIds.has(conn.sourceSocketId)) {
            shouldDrop = true;
          }
        }

        if (shouldDrop) return acc;
        acc.push(updated);
        return acc;
      }, []));
    }

    setLinterLogs(prev => [...prev, `Custom Function "${data.functionName}" saved and recompiled.`]);
  }, []);

  const addNode = (type: NodeType, clientX?: number, clientY?: number) => {
    const mod = getNodeModule(type);
    const def = getDefinitionOrPlaceholder(type);

    let i = 0;
    const prefix = type ? `${type}_` : 'n';
    while (nodes.some(n => n.id === `${prefix}${i}`)) i++;
    const id = `${prefix}${i}`;

    // Determine position: Mouse Pos or Center Screen
    let x = 0;
    let y = 0;

    if (clientX !== undefined && clientY !== undefined && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      x = (clientX - rect.left - viewport.x) / viewport.zoom;
      y = (clientY - rect.top - viewport.y) / viewport.zoom;
    } else {
      x = (-viewport.x + window.innerWidth / 2) / viewport.zoom - 50;
      y = (-viewport.y + window.innerHeight / 2) / viewport.zoom - 50;
    }

    const newNode: ShaderNode = {
      id,
      ...def,
      x: x,
      y: y,
      data: mod?.initialData
        ? ({ ...(mod.initialData(id) as any) })
        : ({ value: type === 'color' ? '#ffffff' : type === 'float' ? 0.5 : undefined } as any)
    };
    if (type === 'remap') newNode.data.inputValues = { inMinMax: { x: -1, y: 1 }, outMinMax: { x: 0, y: 1 } };
    setNodes(prev => [...prev, newNode]);

    // Close context menu if open
    setContextMenu(null);
  };

  const deleteConnection = (id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
  };

  const getSocketPos = (nodeId: string, socketId: string, isInput: boolean) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    const socketDomId = `socket-${nodeId}-${socketId}-${isInput ? 'in' : 'out'}`;
    const nodeDomId = `node-${nodeId}`;
    const socketEl = document.getElementById(socketDomId);
    const nodeEl = document.getElementById(nodeDomId);
    if (socketEl && nodeEl) {
      const sRect = socketEl.getBoundingClientRect();
      const nRect = nodeEl.getBoundingClientRect();
      const relativeX = (sRect.left - nRect.left + sRect.width / 2) / viewport.zoom;
      const relativeY = (sRect.top - nRect.top + sRect.height / 2) / viewport.zoom;
      return { x: node.x + relativeX, y: node.y + relativeY };
    }
    return { x: node.x + (isInput ? -9 : 169), y: node.y + 50 };
  };

  const runGeminiPipeline = async (prompt: string, attachment?: string, selectedAssetId?: string) => {
    if (!prompt && !attachment) return;

    let finalPrompt = prompt;
    if (selectedAssetId) {
      const asset = sessionAssets.find(a => a.id === selectedAssetId);
      if (asset) {
        finalPrompt = `[CONTEXT: The attached image is asset ID "${asset.id}" (name: "${asset.name}")]\n${prompt}`;
      }
    }

    suppressManualHistoryRef.current = true;
    setGenerationPhase('drafting');
    setLinterLogs(['Planning...']);

    const handleLog = (msg: string) => {
      setLinterLogs(prev => [...prev, msg]);
    };

    const handleUpdate = (draftNodes: any[], draftConnections: any[]) => {
      const mappedNodes: ShaderNode[] = draftNodes.map((n: any) => {
        const mod = getNodeModule(n.type);
        const initialData = mod?.initialData ? (mod.initialData(n.id) as any) : {};
        const aiData = (n.data && typeof n.data === 'object') ? { ...n.data } : {};
        if (n.dataValue !== undefined && aiData.value === undefined) aiData.value = n.dataValue;

        const node: ShaderNode = {
          ...getDefinitionOrPlaceholder(n.type),
          ...n,
          id: n.id,
          x: n.x ?? 0,
          y: n.y ?? 0,
          data: { ...initialData, ...aiData },
        };
        // Restore custom sockets if they were lost in the AI/Serialization roundtrip
        if (node.type === 'customFunction' && node.data.customInputs) {
          node.inputs = node.data.customInputs;
          node.outputs = node.data.customOutputs || node.outputs;
        }
        if (node.type === 'remap' && !node.data.inputValues) node.data.inputValues = { inMinMax: { x: -1, y: 1 }, outMinMax: { x: 0, y: 1 } };
        return node;
      });
      setNodes(mappedNodes);
      setConnections(draftConnections.map((c: any) => ({ ...c, id: c.id || `conn-${Math.random()}` })));
    };

    const handleVisualRequest = async (nodeId: string) => {
      // Small tick to ensure React state update -> DOM update -> Canvas render
      await new Promise(r => requestAnimationFrame(r));

      const isAnimated = /agua|movimiento|onda|fluir|viento|anima|time|tiempo/i.test(finalPrompt);

      if (isAnimated) {
        // Capture 5 frames over 2 seconds for motion analysis
        const frames = await previewSystem.captureSequence(nodeId, 2.0, 2.5);
        return frames[frames.length - 1] || null;
      } else {
        return previewSystem.capturePreview(nodeId);
      }
    };

    const result = await geminiService.generateOrModifyGraph(finalPrompt, nodes, connections, sessionAssets, attachment, handleLog, handleUpdate, handleVisualRequest);
    const draft = (result as any)?.graph ?? result;
    const responseText = (result as any)?.responseText as string | undefined;
    const meta = (result as any)?.meta as any | undefined;

    if (responseText) setLastResponseText(responseText);

    if (meta) {
      setLastAiMeta(meta);
      if (meta.usedPersistentChat) handleLog('Chat: persistent editor session enabled.');
      if (meta.omittedDynamicGraphContext) handleLog('Chat: using baseline/history (omitting dynamic snapshot).');
    }

    if (!draft || !draft.nodes) {
      setLinterLogs(prev => [...prev, 'Failed to generate draft.']);
      setGenerationPhase('idle');
      suppressManualHistoryRef.current = false;
      return;
    }

    // Final Architecture Polish
    setGenerationPhase('linting');
    const finalNodes = draft.nodes.map((n: any) => {
      const mod = getNodeModule(n.type);
      const initialData = mod?.initialData ? (mod.initialData(n.id) as any) : {};
      const aiData = (n.data && typeof n.data === 'object') ? { ...n.data } : {};
      if (n.dataValue !== undefined && aiData.value === undefined) aiData.value = n.dataValue;

      const node: ShaderNode = {
        ...getDefinitionOrPlaceholder(n.type),
        ...n,
        id: n.id,
        x: n.x ?? 0,
        y: n.y ?? 0,
        data: { ...initialData, ...aiData },
      };
      if (node.type === 'customFunction' && node.data.customInputs) {
        node.inputs = node.data.customInputs;
        node.outputs = node.data.customOutputs || node.outputs;
      }
      if (node.type === 'remap' && !node.data.inputValues) node.data.inputValues = { inMinMax: { x: -1, y: 1 }, outMinMax: { x: 0, y: 1 } };
      return node;
    });
    const finalConns = draft.connections.map((c: any) => ({ ...c, id: c.id || `conn-${Math.random()}` }));

    const logs = lintGraph(finalNodes, finalConns);
    setLinterLogs(prev => [...prev, logs.length > 0 ? 'Linter found issues. Fixing...' : 'Graph structure validated.']);

    setGenerationPhase('refining');

    // Final Visual QC Pass
    await new Promise(r => requestAnimationFrame(r));
    const finalImage = previewSystem.capturePreview('output') || previewSystem.capturePreview(finalNodes[finalNodes.length - 1].id);

    const refined = await geminiService.refineGraph(draft, logs, meta?.agent || 'architect', handleLog, finalImage || undefined);

    // Choose refined version only if it is not degenerate.
    // Some refinement responses can accidentally return only the master nodes (vertex/output),
    // which would look like the scene was "cleared".
    const isUsableGraph = (g: any) => {
      const nodesArr = Array.isArray(g?.nodes) ? g.nodes : [];
      const connsArr = Array.isArray(g?.connections) ? g.connections : [];
      const hasNonMasterNode = nodesArr.some((n: any) => n && n.id && n.id !== 'output' && n.id !== 'vertex');
      const hasAnyConnection = connsArr.length > 0;
      const hasOutputIncoming = connsArr.some((c: any) => c && c.targetNodeId === 'output');
      return hasNonMasterNode && hasAnyConnection && hasOutputIncoming;
    };

    const finalResult = (refined && isUsableGraph(refined)) ? refined : draft;
    if (refined && finalResult === draft) {
      setLinterLogs(prev => [...prev, 'Refine produced a degenerate graph; keeping the draft to avoid clearing the scene.']);
    }

    const newNodes: ShaderNode[] = finalResult.nodes.map((n: any) => {
      const mod = getNodeModule(n.type);
      const initialData = mod?.initialData ? (mod.initialData(n.id) as any) : {};
      const aiData = (n.data && typeof n.data === 'object') ? { ...n.data } : {};
      if (n.dataValue !== undefined && aiData.value === undefined) aiData.value = n.dataValue;

      const node: ShaderNode = {
        ...getDefinitionOrPlaceholder(n.type),
        ...n,
        id: n.id,
        x: n.x ?? 0,
        y: n.y ?? 0,
        data: { ...initialData, ...aiData },
      };
      if (node.type === 'customFunction' && node.data.customInputs) {
        node.inputs = node.data.customInputs;
        node.outputs = node.data.customOutputs || node.outputs;
      }
      if (node.type === 'remap' && !node.data.inputValues) node.data.inputValues = { inMinMax: { x: -1, y: 1 }, outMinMax: { x: 0, y: 1 } };
      return node;
    });

    const newConnections: Connection[] = finalResult.connections.map((c: any) => ({ ...c, id: c.id || `conn-${Math.random()}` }));

    setNodes(newNodes);
    setConnections(newConnections);

    // Persisted chat lifecycle rules:
    // - Always set baseline after an AI-applied change.
    geminiService.setPersistentGraphBaseline(newNodes, newConnections);
    // - If this was a "generate" (architect) run, clear the chat session so edits start fresh.
    if (meta?.agent === 'architect' || meta?.command === 'generate') {
      geminiService.resetPersistentGraphSession();
      geminiService.setPersistentGraphBaseline(newNodes, newConnections);
    }

    suppressManualHistoryRef.current = false;

    setGenerationPhase('idle');
  };

  const runGeminiTexturePipeline = async (texturePrompt: string, referenceAttachment?: string) => {
    const cleanPrompt = String(texturePrompt || '').trim();
    if (!cleanPrompt && !referenceAttachment) return;

    setGenerationPhase('routing');
    setLinterLogs(['Inferring texture intent...']);

    const handleLog = (msg: string) => setLinterLogs(prev => [...prev, msg]);

    try {
      const inferred = await geminiService.inferTextureRequest(cleanPrompt, handleLog);
      const imagePrompt = inferred?.imagePrompt || cleanPrompt;
      const targetNodeId = inferred?.target?.nodeId || 'output';
      const targetSocketId = inferred?.target?.socketId || 'color';
      const operation = inferred?.operation || 'multiply';
      const channel = inferred?.channel || 'rgba';

      handleLog(`Target: ${targetNodeId}.${targetSocketId} (${operation}, channel=${channel})`);

      setLinterLogs(prev => [...prev, 'Generating texture...']);
      setGenerationPhase('drafting');
      const generated = await geminiService.generateTextureDataUrl(imagePrompt, referenceAttachment, handleLog);
      if (!generated?.dataUrl) {
        handleLog('Texture generation failed.');
        setGenerationPhase('idle');
        return;
      }

      // Auto-save generated texture into the session library
      setSessionAssets(prev => {
        const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const name = `gen-texture-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        return [...prev, { id, name, dataUrl: generated.dataUrl, mimeType: generated.mimeType, createdAt: Date.now() }];
      });

      applyTextureDataUrlToTarget({
        dataUrl: generated.dataUrl,
        mimeType: generated.mimeType,
        targetNodeId,
        targetSocketId,
        operation,
        channel,
        log: handleLog,
      });
    } catch (e: any) {
      console.error(e);
      setLinterLogs(prev => [...prev, `Texture pipeline error: ${e?.message || String(e)}`]);
    } finally {
      setGenerationPhase('idle');
    }
  };

  const handleGeminiGenerate = async (
    prompt: string,
    attachment?: string,
    chatContext?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
    ,
    selectedAssetId?: string
  ) => {
    if (!prompt && !attachment) return;

    const trimmed = String(prompt || '').trim();
    const isSlash = trimmed.startsWith('/');
    const effectivePrompt = (!isSlash && focusText) ? `${focusText}\n\nUSER REQUEST:\n${prompt}` : prompt;

    setLastAssistantResponse(null);
    setLastAiMeta(null);

    let inferredCmd: string | undefined;
    if (!isSlash) {
      setGenerationPhase('routing');
      const intent = await geminiService.inferGlobalIntent(prompt, attachment);
      if (intent && intent.confidence >= 0.7) {
        setLinterLogs(prev => [...prev, `Router: inferred ${intent.command} (${Math.round(intent.confidence * 100)}% confidence)`]);
        inferredCmd = intent.command;
      }
    }

    const handled = await dispatchCommand(
      { prompt: effectivePrompt, attachment, chatContext, selectedAssetId, focusText: focusText || undefined, intentCommand: inferredCmd },
      {
        geminiService,
        nodes,
        connections,
        sessionAssets,
        setNodes,
        setConnections,
        setSessionAssets,
        setGenerationPhase,
        setLinterLogs,
        addSessionAsset,
        applyTextureDataUrlToTarget,
        runGeminiTexturePipeline,
        runGeminiPipeline,
        onAssistantResponse: (text: string) => {
          setLastAssistantResponse(text);
          setLastAiMeta({ agent: 'consultant' });
        },
      }
    );

    if (handled) return;

    await runGeminiPipeline(effectivePrompt, attachment, selectedAssetId);
  };

  const renderConnections = () => {
    return connections.map(conn => {
      const p1 = getSocketPos(conn.sourceNodeId, conn.sourceSocketId, false);
      const p2 = getSocketPos(conn.targetNodeId, conn.targetSocketId, true);
      const dist = Math.abs(p1.x - p2.x) * 0.5;
      const path = `M ${p1.x} ${p1.y} C ${p1.x + dist} ${p1.y}, ${p2.x - dist} ${p2.y}, ${p2.x} ${p2.y}`;
      const isHovered = hoveredConnectionId === conn.id;
      return (
        <g key={conn.id}
          onMouseEnter={() => setHoveredConnectionId(conn.id)}
          onMouseLeave={() => setHoveredConnectionId(null)}
          onClick={(e) => { e.stopPropagation(); deleteConnection(conn.id); }}
          className="cursor-pointer pointer-events-auto"
        >
          <path d={path} stroke="transparent" strokeWidth="15" fill="none" />
          <path d={path} stroke={isHovered ? "#ff4444" : "#555"} strokeWidth={isHovered ? "5" : "3"} fill="none" className="transition-all duration-200" />
        </g>
      );
    });
  };

  const renderDraftConnection = () => {
    if (!connecting) return null;
    const p1 = getSocketPos(connecting.nodeId, connecting.socketId, connecting.isInput);
    const p2 = { x: (mousePos.x - viewport.x) / viewport.zoom, y: (mousePos.y - viewport.y) / viewport.zoom };
    const start = connecting.isInput ? p2 : p1;
    const end = connecting.isInput ? p1 : p2;
    const dist = Math.abs(start.x - end.x) * 0.5;
    const path = `M ${start.x} ${start.y} C ${start.x + dist} ${start.y}, ${end.x - dist} ${end.y}, ${end.x} ${end.y}`;
    return <path d={path} stroke="#fff" strokeWidth="3" fill="none" strokeDasharray="5,5" className="pointer-events-none" />;
  };

  const allNodeKeys = Array.from(new Set(NODE_LIST.flatMap(c => c.types))).filter(k => k !== 'output');
  const contextFilteredNodes = allNodeKeys.filter(key => {
    const label = (getDefinitionOrPlaceholder(key) as any).label.toLowerCase();
    return label.includes(contextSearch.toLowerCase());
  });

  return (
    <div className="w-screen h-screen bg-[#111] overflow-hidden flex flex-col relative" onContextMenu={e => e.preventDefault()}>
      <div className="h-12 bg-[#1e1e1e] border-b border-gray-700 flex items-center justify-between px-4 z-50 shrink-0 relative z-20">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text mr-4">Lumina</h1>
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border ${fileSystemError ? 'border-red-900 bg-red-950/30' : fileHandle ? 'border-green-900 bg-green-950/30' : 'border-gray-700 bg-black'}`}>
            {fileSystemError ? (<AlertCircle className="w-3 h-3 text-red-400" />) : (<FileJson className={`w-3 h-3 ${fileHandle ? 'text-green-400' : 'text-gray-500'}`} />)}
            <span className={`text-xs font-mono ${fileSystemError ? 'text-red-300' : fileHandle ? 'text-green-100' : 'text-gray-500'}`}>
              {fileName}.json {!isSaved && <span className="text-yellow-500 ml-1">*</span>}
            </span>
          </div>

          <div className="flex items-center gap-2 ml-2">
            {persistentChatEnabled && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-blue-900 bg-blue-950/30">
                <Sparkles className="w-3 h-3 text-blue-300" />
                <span className="text-[10px] font-mono text-blue-200">chat:persistent</span>
              </div>
            )}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-gray-700 bg-black">
              <span className="text-[10px] font-mono text-gray-300">out:{graphOutputMode}</span>
            </div>
            {lastAiMeta?.agent && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded border border-gray-700 bg-black">
                <span className="text-[10px] font-mono text-gray-300">agent:{String(lastAiMeta.agent)}</span>
              </div>
            )}
          </div>

          <div className="flex bg-black rounded p-1 gap-1 ml-4">
            <button onClick={() => setActiveTab('graph')} className={`flex items-center gap-2 px-3 py-1 text-xs rounded transition-all ${activeTab === 'graph' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
              <Network className="w-3 h-3" /> Graph Editor
            </button>
            <button onClick={() => setActiveTab('scene')} className={`flex items-center gap-2 px-3 py-1 text-xs rounded transition-all ${activeTab === 'scene' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
              <Layers className="w-3 h-3" /> 3D Scene
            </button>
            {editingNodeId && (
              <button onClick={() => setActiveTab('code')} className={`flex items-center gap-2 px-3 py-1 text-xs rounded transition-all ${activeTab === 'code' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                <Code2 className="w-3 h-3" /> Code
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleNewGraph} className="bg-gray-800 hover:bg-gray-700 p-1.5 rounded text-gray-300 transition-colors" title="New Graph (Ctrl+Shift+N)"> <FilePlus className="w-4 h-4" /> </button>
          <button onClick={() => saveGraph(false)} className="bg-gray-800 hover:bg-gray-700 p-1.5 rounded text-gray-300 transition-colors" title="Save (Ctrl+S)"> <Save className="w-4 h-4" /> </button>
          <button onClick={() => saveGraph(true)} className="bg-gray-800 hover:bg-gray-700 p-1.5 rounded text-gray-300 transition-colors" title="Save As... (Ctrl+Shift+S)"> <Download className="w-4 h-4" /> </button>
          <button onClick={handleOpen} className="bg-gray-800 hover:bg-gray-700 p-1.5 rounded text-gray-300 cursor-pointer transition-colors" title="Open (Ctrl+O)"> <Upload className="w-4 h-4" /> </button>
          <input type="file" ref={fileInputRef} onChange={handleFallbackLoad} className="hidden" accept=".json" />
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex">
        {/* New Sidebar */}
        <GeminiAssistantSidebar
          onGenerate={handleGeminiGenerate}
          generationPhase={generationPhase}
          lastAssistantResponse={lastAssistantResponse}
          logs={linterLogs}
          lastMeta={lastAiMeta}
          lastResult={lastResponseText}
          assets={sessionAssets}
          onAddAsset={addSessionAsset}
          onUseAssetAsTextureNode={insertTextureAssetNodeFromAsset}
          attachedNodes={attachedNodesSummary}
          onClearAttachedNodes={clearAttachedNodes}
        />

        <div className={`flex-1 h-full relative flex flex-col ${activeTab === 'graph' ? 'z-10 flex' : 'z-0 hidden'}`}>
          <div className="absolute inset-0 w-full h-full graph-grid z-0 pointer-events-none opacity-50" />
          <GlobalCanvas />
          {/* Old AI UI Removed */}

          <div className={`absolute top-4 right-4 w-72 z-20 pointer-events-auto flex flex-col gap-2 ${activeTab === 'graph' ? 'opacity-100' : 'opacity-0'}`}>
            <div className="w-full h-72 bg-black rounded-lg overflow-hidden border border-gray-700 shadow-xl relative group">
              <div className="absolute top-0 left-0 right-0 bg-gray-800/80 text-xs px-2 py-1 text-gray-400 font-bold border-b border-gray-700 z-10 flex justify-between items-center backdrop-blur-sm">
                <span>PREVIEW</span>
                <div className="flex gap-1 items-center">
                  <button onClick={() => setPreviewMode('2d')} className={`p-1 rounded hover:bg-gray-600 ${previewMode === '2d' ? 'text-white bg-gray-600' : 'text-gray-400'}`} title="2D View"> <Square className="w-3 h-3" /> </button>
                  <button onClick={() => setPreviewMode('3d')} className={`p-1 rounded hover:bg-gray-600 ${previewMode === '3d' ? 'text-white bg-gray-600' : 'text-gray-400'}`} title="3D View"> <Box className="w-3 h-3" /> </button>

                  {previewMode === '3d' && (
                    <>
                      <div className="w-[1px] h-3 bg-gray-600 mx-1" />
                      <button onClick={() => setPreviewObject('sphere')} className={`p-1 rounded hover:bg-gray-600 ${previewObject === 'sphere' ? 'text-blue-400' : 'text-gray-400'}`} title="Sphere"> <Circle className="w-3 h-3" /> </button>
                      <button onClick={() => setPreviewObject('cube')} className={`p-1 rounded hover:bg-gray-600 ${previewObject === 'cube' ? 'text-blue-400' : 'text-gray-400'}`} title="Cube"> <Box className="w-3 h-3" /> </button>
                      <button onClick={() => setPreviewObject('plane')} className={`p-1 rounded hover:bg-gray-600 ${previewObject === 'plane' ? 'text-blue-400' : 'text-gray-400'}`} title="Plane"> <Square className="w-3 h-3" /> </button>
                    </>
                  )}
                </div>
              </div>
              <div className="w-full h-full pt-7 pb-2 px-2 bg-[#000]">
                <SceneView
                  active={activeTab === 'graph'}
                  fragShader={fragShader}
                  vertShader={vertShader}
                  forcedMesh={previewMode === '2d' ? 'plane' : previewObject}
                  textures={textureUniforms}
                  showControls={false}
                  autoRotate={false}
                  mode={previewMode}
                  cameraDistance={
                    previewMode === '2d' ? 2.5 :
                      previewObject === 'cube' ? 4.5 :
                        previewObject === 'plane' ? 3.2 :
                          3.2
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="bg-gray-800 p-2 rounded text-gray-400 hover:text-white border border-gray-700 shadow-lg" onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}> <ZoomIn className="w-4 h-4" /> </button>
            </div>
          </div>

          <div
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-default overflow-hidden z-10"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
            onWheel={handleWheel}
          >
            <div className="absolute origin-top-left transition-transform duration-75 ease-linear" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
              <svg className="absolute top-0 left-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible z-0">
                {renderConnections()}
                {renderDraftConnection()}
              </svg>
              {nodes.map(node => (
                <div key={node.id} className="z-10">
                  <Node
                    node={node}
                    selected={selectedNodeIds.has(node.id)}
                    attached={attachedNodeIds.has(node.id)}
                    onToggleAttachSelection={toggleAttachSelection}
                    onMouseDown={handleNodeMouseDown}
                    onSocketMouseDown={handleSocketMouseDown}
                    onSocketMouseUp={handleSocketMouseUp}
                    onUpdateData={updateNodeData}
                    onOpenEditor={handleOpenCodeEditor}
                    allNodes={nodes}
                    allConnections={connections}
                  />
                </div>
              ))}
            </div>

            {selectionBox && (
              <div
                className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-30"
                style={{
                  left: Math.min(selectionBox.startX, selectionBox.currentX),
                  top: Math.min(selectionBox.startY, selectionBox.currentY),
                  width: Math.abs(selectionBox.currentX - selectionBox.startX),
                  height: Math.abs(selectionBox.currentY - selectionBox.startY)
                }}
              />
            )}

            <div className="absolute bottom-4 left-4 text-gray-500 text-xs pointer-events-none z-30">
              Right Click: Add Node • Middle Click: Pan • Ctrl+Click: Multi-Select • Ctrl+S: Save
            </div>

            {/* Context Menu */}
            {contextMenu && contextMenu.open && (
              <div
                className="absolute bg-[#1e1e1e] border border-gray-600 rounded shadow-2xl w-48 flex flex-col overflow-hidden z-[100]"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="p-2 border-b border-gray-700 bg-[#252525]">
                  <input
                    ref={contextMenuRef}
                    className="w-full bg-black border border-gray-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
                    placeholder="Search Node..."
                    value={contextSearch}
                    onChange={(e) => setContextSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-60 overflow-y-auto scrollbar-thin">
                  {contextFilteredNodes.length > 0 ? (
                    contextFilteredNodes.map(type => (
                      <button
                        key={type}
                        onClick={() => addNode(type as NodeType, contextMenu.clientX, contextMenu.clientY)}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-blue-600 hover:text-white transition-colors"
                      >
                        {(getDefinitionOrPlaceholder(type) as any).label}
                      </button>
                    ))
                  ) : (
                    <div className="text-center text-[10px] text-gray-500 py-2">No results</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className={`flex-1 h-full relative bg-[#0a0a0a] ${activeTab === 'scene' ? 'z-10 flex' : 'z-0 hidden'}`}>
          <SceneView fragShader={fragShader} vertShader={vertShader} active={activeTab === 'scene'} textures={textureUniforms} />
        </div>
        <div className={`flex-1 h-full relative bg-[#0a0a0a] flex ${activeTab === 'code' ? 'z-10 flex' : 'z-0 hidden'}`}>
          <CodeEditor
            key={editingNodeId || 'none'}
            node={nodes.find(n => n.id === editingNodeId) || null}
            onSave={handleSaveCustomFunction}
            onClose={() => setActiveTab('graph')}
          />
        </div>
      </div>
      {/* Fullscreen Overlay Disabled for Dev Mode
      {generationPhase !== 'idle' && (
        <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300 cursor-wait">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
            <Wand2 className="w-16 h-16 text-indigo-400 animate-bounce relative z-10" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">AI Shader Architect</h2>
          <div className="flex items-center gap-3 text-indigo-300 font-mono text-sm bg-indigo-950/50 px-4 py-2 rounded-full border border-indigo-500/30">
            {generationPhase === 'drafting' && <><Loader2 className="w-4 h-4 animate-spin" /> Drafting...</>}
            {generationPhase === 'linting' && <><CheckCircle2 className="w-4 h-4 animate-pulse" /> Validating...</>}
            {generationPhase === 'refining' && <><Sparkles className="w-4 h-4 animate-pulse" /> Refining...</>}
          </div>
        </div>
      )} 
      */}
    </div>
  );
};

export default App;
