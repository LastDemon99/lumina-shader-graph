
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Node } from './components/Node';
import { Preview } from './components/Preview';
import { SceneView } from './components/SceneView';
import { GlobalCanvas } from './components/GlobalCanvas'; // Import Global Canvas
import { generateFragmentShader, generateVertexShader } from './services/glslGenerator';
import { geminiService } from './services/geminiService';
import { lintGraph } from './services/linter';
import { ShaderNode, Connection, Viewport, NodeType, SocketType } from './types';
import { INITIAL_NODES, NODE_DEFINITIONS, INITIAL_CONNECTIONS } from './constants';
import { Wand2, Download, Upload, ZoomIn, ZoomOut, MousePointer2, Box, Square, Save, Layers, Network, CheckCircle2, Loader2, Sparkles, FileJson, AlertCircle, Plus } from 'lucide-react';

const App: React.FC = () => {
  // --- Global State ---
  const [activeTab, setActiveTab] = useState<'graph' | 'scene'>('graph');

  // --- Graph State ---
  const [nodes, setNodes] = useState<ShaderNode[]>(INITIAL_NODES);
  const [connections, setConnections] = useState<Connection[]>(INITIAL_CONNECTIONS);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  
  // Selection State
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
  
  // Clipboard State
  const [clipboard, setClipboard] = useState<{ nodes: ShaderNode[], connections: Connection[] } | null>(null);

  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  
  // Preview State (Mini preview in Graph)
  const [previewMode, setPreviewMode] = useState<'2d' | '3d'>('3d');

  // Interaction State
  const [isDraggingNodes, setIsDraggingNodes] = useState(false);
  const [connecting, setConnecting] = useState<{ nodeId: string, socketId: string, isInput: boolean, type: SocketType, x: number, y: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [lastPan, setLastPan] = useState({ x: 0, y: 0 });

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, open: boolean } | null>(null);
  const [contextSearch, setContextSearch] = useState('');

  // AI Prompt
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState<string>('');
  
  // AI Status State
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'drafting' | 'linting' | 'refining'>('idle');
  const [linterLogs, setLinterLogs] = useState<string[]>([]);

  // File System State
  const [fileHandle, setFileHandle] = useState<any>(null); // Type 'any' to avoid TS errors with modern API in strict mode
  const [fileName, setFileName] = useState<string>('shader-graph');
  const [isSaved, setIsSaved] = useState(true); // Track unsaved changes slightly (visual only)
  const [fileSystemError, setFileSystemError] = useState<boolean>(false); // Track if FSA API is blocked

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
    nodes.filter(n => ['texture', 'sampleTexture2DLOD', 'gatherTexture2D', 'sampleTexture2DArray', 'calculateLevelOfDetailTexture', 'textureSize', 'parallaxMapping'].includes(n.type)).forEach(n => {
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
            let uniformName = `u_tex_${n.id.replace(/[-.]/g, '_')}`;
            if (assetConn) {
                uniformName = `u_tex_${assetConn.sourceNodeId.replace(/[-.]/g, '_')}`;
            }

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
            
            // PRIORITY LOGIC:
            if (map[uniformName]) {
                const existing = map[uniformName];
                if (existing.filter === 'Point') {
                    filter = 'Point';
                }
            }
            
            map[uniformName] = { url: assetUrl, wrap, filter };
        }
    });

    // 2. Handle Orphaned Texture Assets (for previewing the asset node itself)
    nodes.filter(n => n.type === 'textureAsset' || n.type === 'texture2DArrayAsset').forEach(n => {
        if (n.data.textureAsset) {
            const uniformName = `u_tex_${n.id.replace(/[-.]/g, '_')}`;
            if (!map[uniformName]) {
                map[uniformName] = { url: n.data.textureAsset, wrap: 'Repeat', filter: 'Linear' };
            }
        }
    });

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

      const idMap = new Map<string, string>();
      const newNodes: ShaderNode[] = [];

      clipboard.nodes.forEach(node => {
          const newId = `${node.type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          idMap.set(node.id, newId);
          newNodes.push({
              ...node,
              id: newId,
              x: node.x + offsetX,
              y: node.y + offsetY,
              data: JSON.parse(JSON.stringify(node.data)) 
          });
      });

      const newConnections: Connection[] = clipboard.connections.map(conn => ({
          id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          sourceNodeId: idMap.get(conn.sourceNodeId)!,
          targetNodeId: idMap.get(conn.targetNodeId)!,
          sourceSocketId: conn.sourceSocketId,
          targetSocketId: conn.targetSocketId
      }));

      setNodes(prev => [...prev, ...newNodes]);
      setConnections(prev => [...prev, ...newConnections]);
      setSelectedNodeIds(new Set(newNodes.map(n => n.id)));

  }, [clipboard, mousePos, viewport]);

  // --- File Save/Load Logic ---

  const loadGraphFromString = (jsonString: string) => {
      try {
          const data = JSON.parse(jsonString);
          if (data && typeof data === 'object' && Array.isArray((data as any).nodes) && Array.isArray((data as any).connections)) {
            const typedData = data as { nodes: ShaderNode[], connections: Connection[], previewMode?: '2d' | '3d' };
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
                setNodes(typedData.nodes);
                setConnections(typedData.connections);
                setIsSaved(true);
            }, 50);
          } else {
            alert('Invalid file format: Missing nodes or connections array.');
          }
      } catch (err: any) {
          console.error("Parse Error:", err);
          alert('Failed to parse file.');
      }
  };

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
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
          e.preventDefault();
          copySelection();
          return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
          const target = e.target as HTMLElement;
          if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
          e.preventDefault();
          pasteSelection();
          return;
      }

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

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
            if(rect) {
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
      setContextMenu({ x: e.clientX, y: e.clientY, open: true });
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
        if(rect) {
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
                const nodeX = (node.x * viewport.zoom) + viewport.x;
                const nodeY = (node.y * viewport.zoom) + viewport.y;
                const nodeW = 160 * viewport.zoom;
                const nodeH = 150 * viewport.zoom;
                if (startX < nodeX + nodeW && endX > nodeX && startY < nodeY + nodeH && endY > nodeY) {
                    newSelection.add(node.id);
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
    setConnecting({ nodeId, socketId, isInput, type, x: e.clientX, y: e.clientY });
  };

  const isTypeCompatible = (sourceType: SocketType, targetType: SocketType) => {
      if (sourceType === 'textureArray' && targetType !== 'textureArray') return false;
      if (targetType === 'textureArray' && sourceType !== 'textureArray') return false;
      return true; 
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
        const filtered = prev.filter(c => c.targetNodeId !== target.nodeId || c.targetSocketId !== target.socketId);
        return [...filtered, newConnection];
      });
    }
    setConnecting(null);
  };

  const updateNodeData = (id: string, data: any) => {
    setNodes(prev => prev.map(n => {
        if (n.id === id) {
            const newNode = { ...n, data: { ...n.data, ...data } };
            if (n.type === 'swizzle' && data.mask) {
                const maskLength = data.mask.length;
                let newType: SocketType = 'vec4';
                if (maskLength === 1) newType = 'float';
                else if (maskLength === 2) newType = 'vec2';
                else if (maskLength === 3) newType = 'vec3';
                newNode.outputs = [{ id: 'out', label: `Out(${maskLength})`, type: newType }];
            }
            return newNode;
        }
        return n;
    }));
  };

  const addNode = (type: NodeType, clientX?: number, clientY?: number) => {
    const def = NODE_DEFINITIONS[type];
    
    // Determine position: Mouse Pos or Center Screen
    let x = 0;
    let y = 0;
    
    if (clientX !== undefined && clientY !== undefined && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        x = (clientX - rect.left - viewport.x) / viewport.zoom;
        y = (clientY - rect.top - viewport.y) / viewport.zoom;
    } else {
        x = (-viewport.x + window.innerWidth/2) / viewport.zoom - 50;
        y = (-viewport.y + window.innerHeight/2) / viewport.zoom - 50;
    }

    const newNode: ShaderNode = {
      id: `${type}-${Date.now()}`,
      ...def,
      x: x,
      y: y,
      data: { value: type === 'color' ? '#ffffff' : type === 'float' ? 0.5 : undefined }
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

  const handleGeminiGenerate = async () => {
    if (!promptText) return;
    setGenerationPhase('drafting');
    setLinterLogs([]);
    const promptStr = String(promptText || '');
    const draft = await geminiService.generateOrModifyGraph(promptStr, nodes, connections);
    if (!draft || !draft.nodes) {
        setGenerationPhase('idle');
        return;
    }
    const draftNodes: ShaderNode[] = draft.nodes.map((n: any) => ({
         ...NODE_DEFINITIONS[n.type as NodeType],
         id: n.id,
         x: n.x,
         y: n.y,
         data: { value: n.dataValue }
    }));
    const draftConnections: Connection[] = draft.connections.map((c: any) => ({...c, id: c.id || `conn-${Math.random()}`}));
    setGenerationPhase('linting');
    const logs = lintGraph(draftNodes, draftConnections);
    setLinterLogs(logs);
    setGenerationPhase('refining');
    const refined = await geminiService.refineGraph(draft, logs);
    if (refined && refined.nodes) {
        const newNodes: ShaderNode[] = refined.nodes.map((n: any) => ({
             ...NODE_DEFINITIONS[n.type as NodeType],
             id: n.id,
             x: n.x,
             y: n.y,
             data: { value: n.dataValue }
        }));
        setNodes(newNodes);
        setConnections(refined.connections.map((c: any) => ({...c, id: c.id || `conn-${Math.random()}`})));
        setPromptOpen(false);
    }
    setGenerationPhase('idle');
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

  const allNodeKeys = Object.keys(NODE_DEFINITIONS).filter(k => k !== 'output');
  const contextFilteredNodes = allNodeKeys.filter(key => {
     const label = NODE_DEFINITIONS[key as NodeType].label.toLowerCase();
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
            <div className="flex bg-black rounded p-1 gap-1 ml-4">
                <button onClick={() => setActiveTab('graph')} className={`flex items-center gap-2 px-3 py-1 text-xs rounded transition-all ${activeTab === 'graph' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                  <Network className="w-3 h-3" /> Graph Editor
                </button>
                <button onClick={() => setActiveTab('scene')} className={`flex items-center gap-2 px-3 py-1 text-xs rounded transition-all ${activeTab === 'scene' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>
                  <Layers className="w-3 h-3" /> 3D Scene
                </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
               <button onClick={() => saveGraph(false)} className="bg-gray-800 hover:bg-gray-700 p-1.5 rounded text-gray-300 transition-colors" title="Save (Ctrl+S)"> <Save className="w-4 h-4" /> </button>
               <button onClick={() => saveGraph(true)} className="bg-gray-800 hover:bg-gray-700 p-1.5 rounded text-gray-300 transition-colors" title="Save As... (Ctrl+Shift+S)"> <Download className="w-4 h-4" /> </button>
               <button onClick={handleOpen} className="bg-gray-800 hover:bg-gray-700 p-1.5 rounded text-gray-300 cursor-pointer transition-colors" title="Open (Ctrl+O)"> <Upload className="w-4 h-4" /> </button>
               <input type="file" ref={fileInputRef} onChange={handleFallbackLoad} className="hidden" accept=".json" />
          </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex">
      <div className={`w-full h-full absolute inset-0 flex flex-col ${activeTab === 'graph' ? 'z-10' : 'z-0 invisible'}`}>
        <div className="absolute inset-0 w-full h-full graph-grid z-0 pointer-events-none opacity-50" />
        <GlobalCanvas />
        <div className={`absolute top-4 left-4 z-20 flex flex-col gap-4 w-64 pointer-events-none ${activeTab === 'graph' ? 'opacity-100' : 'opacity-0'}`}>
         {/* Tools Toolbar */}
         <div className="bg-[#1e1e1e] border border-gray-700 p-2 rounded-xl shadow-2xl pointer-events-auto flex flex-col shrink-0">
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setPromptOpen(!promptOpen)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-2 rounded flex justify-center items-center gap-2 transition-colors shadow-lg"> <Wand2 className="w-3 h-3" /> AI Assist </button>
            </div>
         </div>
         {/* AI Prompt Window */}
         {promptOpen && (
           <div className="bg-[#1e1e1e] border border-indigo-500 p-4 rounded-xl shadow-2xl pointer-events-auto animate-in slide-in-from-left-10 fade-in duration-200 shrink-0">
             <textarea className="w-full bg-black border border-gray-700 rounded p-2 text-xs text-white mb-2 focus:outline-none focus:border-indigo-500" placeholder="Describe a shader..." rows={3} value={promptText} onChange={e => setPromptText(e.target.value)} />
             <div className="space-y-2">
              <button onClick={handleGeminiGenerate} disabled={generationPhase !== 'idle'} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded flex justify-center items-center gap-2 transition-colors">
                {generationPhase === 'idle' && <>Generate Graph</>}
                {generationPhase !== 'idle' && <><Loader2 className="w-3 h-3 animate-spin"/> Processing...</>}
              </button>
             </div>
           </div>
         )}
        </div>

        <div className={`absolute top-4 right-4 w-72 z-20 pointer-events-auto flex flex-col gap-2 ${activeTab === 'graph' ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-full h-72 bg-black rounded-lg overflow-hidden border border-gray-700 shadow-xl relative group">
             <div className="absolute top-0 left-0 right-0 bg-gray-800/80 text-xs px-2 py-1 text-gray-400 font-bold border-b border-gray-700 z-10 flex justify-between items-center backdrop-blur-sm">
               <span>PREVIEW</span>
               <div className="flex gap-1">
                 <button onClick={() => setPreviewMode('2d')} className={`p-1 rounded hover:bg-gray-600 ${previewMode === '2d' ? 'text-white bg-gray-600' : ''}`}> <Square className="w-3 h-3" /> </button>
                 <button onClick={() => setPreviewMode('3d')} className={`p-1 rounded hover:bg-gray-600 ${previewMode === '3d' ? 'text-white bg-gray-600' : ''}`}> <Box className="w-3 h-3" /> </button>
               </div>
             </div>
             <div className="w-full h-full pt-7 pb-2 px-2 bg-[#000]">
                <SceneView 
                    active={activeTab === 'graph'}
                    fragShader={fragShader} 
                    vertShader={vertShader} 
                    forcedMesh={previewMode === '2d' ? 'plane' : 'sphere'}
                    textures={textureUniforms} 
                    showControls={false}
                    autoRotate={previewMode === '3d'}
                    cameraDistance={previewMode === '2d' ? 2.5 : 2.5}
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
                  onMouseDown={handleNodeMouseDown}
                  onSocketMouseDown={handleSocketMouseDown}
                  onSocketMouseUp={handleSocketMouseUp}
                  onUpdateData={updateNodeData}
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
                            onClick={() => addNode(type as NodeType, contextMenu.x, contextMenu.y)} 
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-blue-600 hover:text-white transition-colors"
                         >
                            {NODE_DEFINITIONS[type as NodeType].label}
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
      <div className={`w-full h-full absolute inset-0 bg-[#0a0a0a] ${activeTab === 'scene' ? 'z-10' : 'z-0 invisible'}`}>
        <SceneView fragShader={fragShader} vertShader={vertShader} active={activeTab === 'scene'} textures={textureUniforms} />
      </div>
      </div>
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
    </div>
  );
};

export default App;
