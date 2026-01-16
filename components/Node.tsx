

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ShaderNode, SocketType, Connection, GradientStop } from '../types';
import { Preview } from './Preview';
import { generateGLSL } from '../services/glslGenerator';
import { processTextureFile, createTextureAtlas } from '../services/textureUtils';
import { Upload, ArrowRight, Box, Square, CheckSquare, Square as SquareIcon, Image as ImageIcon, Loader2, Plus, X, ChevronDown, Check, ChevronUp, Layers, ChevronRight, Trash2 } from 'lucide-react';

interface NodeProps {
  node: ShaderNode;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onSocketMouseDown: (e: React.MouseEvent, nodeId: string, socketId: string, isInput: boolean, type: SocketType) => void;
  onSocketMouseUp: (e: React.MouseEvent, nodeId: string, socketId: string, isInput: boolean, type: SocketType) => void;
  onUpdateData: (id: string, data: any) => void;
  allNodes: ShaderNode[];
  allConnections: Connection[];
}

const getSocketColor = (type: SocketType) => {
  switch (type) {
    case 'float': return 'bg-gray-400 border-gray-500';
    case 'vec3': return 'bg-yellow-400 border-yellow-500';
    case 'color': return 'bg-pink-500 border-pink-600';
    case 'vec2': return 'bg-green-400 border-green-500';
    case 'vec4': return 'bg-purple-400 border-purple-500';
    case 'texture': return 'bg-pink-400 border-pink-500';
    case 'textureArray': return 'bg-pink-600 border-pink-700';
    case 'sampler': return 'bg-gray-500 border-gray-600';
    case 'samplerState': return 'bg-orange-500 border-orange-600';
    case 'gradient': return 'bg-red-400 border-red-500';
    case 'mat2': return 'bg-cyan-300 border-cyan-400';
    case 'mat3': return 'bg-cyan-400 border-cyan-500';
    case 'mat4': return 'bg-cyan-500 border-cyan-600';
    default: return 'bg-white';
  }
};

const NO_PREVIEW_TYPES = ['float', 'slider', 'time', 'color', 'vector2', 'vector3', 'vector4', 'uv', 'output', 'vertex', 'textureAsset', 'texture2DArrayAsset', 'gradient', 'screen', 'matrixConstruction', 'dielectricSpecular', 'position', 'mainLightDirection', 'object', 'samplerState', 'split', 'textureSize', 'camera', 'sceneDepth', 'sceneDepthDifference', 'flipbook', 'parallaxMapping', 'reciprocal'];

const WIDE_NODE_TYPES = ['matrixConstruction', 'swizzle', 'channelMask', 'invertColors', 'split', 'slider', 'texture2DArrayAsset', 'transform', 'gradient', 'colorspaceConversion', 'dielectricSpecular', 'sceneDepth', 'sceneDepthDifference', 'parallaxMapping', 'reciprocal'];

const ThrottledColorInput: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => {
    const [localValue, setLocalValue] = useState(value);
    const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);

        if (!throttleTimeoutRef.current) {
            throttleTimeoutRef.current = setTimeout(() => {
                onChange(newValue);
                throttleTimeoutRef.current = null;
            }, 100);
        }
    };

    return (
        <input 
            type="color" 
            className="absolute -top-2 -left-2 w-[200%] h-[200%] cursor-pointer p-0 m-0"
            value={localValue}
            onChange={handleChange}
            onMouseDown={e => e.stopPropagation()}
        />
    );
};

export const Node: React.FC<NodeProps> = ({ 
  node, 
  selected, 
  onMouseDown, 
  onSocketMouseDown, 
  onSocketMouseUp, 
  onUpdateData, 
  allNodes,
  allConnections
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const arrayFileInputRef = useRef<HTMLInputElement>(null);
  const gradientRef = useRef<HTMLDivElement>(null);
  
  const previewMode = node.data.previewMode || '3d';
  const isPreviewCollapsed = node.data.previewCollapsed || false;
  const isNodeCollapsed = node.data.nodeCollapsed || false;
  
  const [isLoadingTexture, setIsLoadingTexture] = useState(false);
  const [isMaskOpen, setIsMaskOpen] = useState(false);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);

  const nodeFragShader = useMemo(() => {
    return generateGLSL(allNodes, allConnections, node.id);
  }, [node, allNodes, allConnections]);

  const textureUniforms = useMemo(() => {
    const map: Record<string, { url: string, wrap: string, filter: string }> = {};
    
    allNodes.filter(n => ['texture', 'sampleTexture2DLOD', 'gatherTexture2D', 'sampleTexture2DArray', 'textureSize', 'calculateLevelOfDetailTexture', 'parallaxMapping'].includes(n.type)).forEach(n => {
        let assetUrl = n.data.textureAsset;
        const assetConn = allConnections.find(c => c.targetNodeId === n.id && c.targetSocketId === 'texture');
        
        if (assetConn) {
             const sourceNode = allNodes.find(sn => sn.id === assetConn.sourceNodeId);
             if (sourceNode && sourceNode.data.textureAsset) {
                 assetUrl = sourceNode.data.textureAsset;
             }
        }

        if (assetUrl) {
            let uniformName = `u_tex_${n.id.replace(/[-.]/g, '_')}`;
            if (assetConn) {
                uniformName = `u_tex_${assetConn.sourceNodeId.replace(/[-.]/g, '_')}`;
            }

            let wrap = 'Repeat';
            // Gather nodes default to Point because Linear interpolation ruins the gather operation logic
            let filter = n.type === 'gatherTexture2D' ? 'Point' : 'Linear'; 
            
            const samplerConn = allConnections.find(c => c.targetNodeId === n.id && c.targetSocketId === 'sampler');
            if (samplerConn) {
                const samplerNode = allNodes.find(sn => sn.id === samplerConn.sourceNodeId);
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

    allNodes.filter(n => n.type === 'textureAsset' || n.type === 'texture2DArrayAsset').forEach(n => {
        if (n.data.textureAsset) {
            const uniformName = `u_tex_${n.id.replace(/[-.]/g, '_')}`;
            if (!map[uniformName]) {
                map[uniformName] = { url: n.data.textureAsset, wrap: 'Repeat', filter: 'Linear' };
            }
        }
    });

    return map;
  }, [allNodes, allConnections]);

  const canShowPreview = !NO_PREVIEW_TYPES.includes(node.type);
  const isObjectNode = node.type === 'object';
  const isWide = WIDE_NODE_TYPES.includes(node.type);

  const setPreviewMode = (mode: '2d' | '3d') => {
      onUpdateData(node.id, { previewMode: mode });
  };

  const handleInputChange = (socketId: string, value: any) => {
      const currentInputs = node.data.inputValues || {};
      onUpdateData(node.id, {
          inputValues: { ...currentInputs, [socketId]: value }
      });
  };

  const handleVec2Change = (socketId: string, axis: 'x' | 'y', val: string) => {
      const currentInputs = node.data.inputValues || {};
      const currentVec = currentInputs[socketId] || { x: 0, y: 0 };
      onUpdateData(node.id, {
          inputValues: { ...currentInputs, [socketId]: { ...currentVec, [axis]: parseFloat(val) } }
      });
  };

  const handleVec3Change = (socketId: string, axis: 'x' | 'y' | 'z', val: string) => {
      const currentInputs = node.data.inputValues || {};
      let currentVec = currentInputs[socketId];
      if (!currentVec || typeof currentVec !== 'object') currentVec = { x: 0, y: 0, z: 0 };
      onUpdateData(node.id, {
          inputValues: { ...currentInputs, [socketId]: { ...currentVec, [axis]: parseFloat(val) } }
      });
  };
  
  const handleVec4Change = (socketId: string, axis: 'x' | 'y' | 'z' | 'w', val: string) => {
      const currentInputs = node.data.inputValues || {};
      let currentVec = currentInputs[socketId];
      if (!currentVec || typeof currentVec !== 'object') currentVec = { x: 0, y: 0, z: 0, w: 0 };
      onUpdateData(node.id, {
          inputValues: { ...currentInputs, [socketId]: { ...currentVec, [axis]: parseFloat(val) } }
      });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setIsLoadingTexture(true);
      try {
          const dataUrl = await processTextureFile(file);
          onUpdateData(node.id, { textureAsset: dataUrl });
      } catch (err) {
          console.error("Texture Load Error:", err);
          alert("Failed to load texture. Please try a standard image format or uncompressed TGA.");
      } finally {
          setIsLoadingTexture(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const handleTextureArrayUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setIsLoadingTexture(true);
      try {
          const newLayers = [...(node.data.layers || [])];
          for (let i = 0; i < files.length; i++) {
              const url = await processTextureFile(files[i]);
              newLayers.push(url);
          }
          const atlasUrl = await createTextureAtlas(newLayers);
          onUpdateData(node.id, {
              layers: newLayers,
              textureAsset: atlasUrl,
              layerCount: newLayers.length
          });
      } catch (err: any) {
          console.error("Texture Array Load Error:", err);
          alert(err.message || "Failed to load texture array. Ensure all textures have the same dimensions.");
      } finally {
          setIsLoadingTexture(false);
          if (arrayFileInputRef.current) arrayFileInputRef.current.value = '';
      }
  };

  const removeArrayLayer = async (index: number) => {
      const newLayers = (node.data.layers || []).filter((_, i) => i !== index);
      try {
          if (newLayers.length > 0) {
              const atlasUrl = await createTextureAtlas(newLayers);
              onUpdateData(node.id, {
                  layers: newLayers,
                  textureAsset: atlasUrl,
                  layerCount: newLayers.length
              });
          } else {
              onUpdateData(node.id, {
                  layers: [],
                  textureAsset: undefined,
                  layerCount: 0
              });
          }
      } catch (e) {
          console.error("Error rebuilding atlas", e);
      }
  };
  
  // Gradient Logic
  const getGradientStops = () => {
      return node.data.gradientStops || [
          { id: '1', t: 0, color: '#000000' },
          { id: '2', t: 1, color: '#ffffff' }
      ];
  };

  const generateGradientCSS = (stops: GradientStop[]) => {
      // Sort for CSS generation
      const sorted = [...stops].sort((a, b) => a.t - b.t);
      return sorted.map(s => `${s.color} ${s.t * 100}%`).join(', ');
  };

  const updateStop = (id: string, updates: Partial<GradientStop>) => {
      const stops = getGradientStops().map(s => s.id === id ? { ...s, ...updates } : s);
      stops.sort((a, b) => a.t - b.t); // Keep logical order sorted
      onUpdateData(node.id, { gradientStops: stops });
  };

  const addStop = (t: number) => {
      const stops = getGradientStops();
      // Clamp t
      t = Math.max(0, Math.min(1, t));
      const newStop: GradientStop = { id: Date.now().toString(), t, color: '#888888' };
      const newStops = [...stops, newStop].sort((a, b) => a.t - b.t);
      onUpdateData(node.id, { gradientStops: newStops });
      setActiveStopId(newStop.id);
  };

  const removeStop = (id: string) => {
      const stops = getGradientStops();
      if (stops.length <= 2) return; // Minimum 2 stops
      const newStops = stops.filter(s => s.id !== id);
      onUpdateData(node.id, { gradientStops: newStops });
      if (activeStopId === id) setActiveStopId(null);
  };

  const handleGradientClick = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent drag
      if (!gradientRef.current) return;
      
      const rect = gradientRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const t = relativeX / rect.width;
      
      addStop(t);
  };

  const swizzleOptions = useMemo(() => {
      if (node.type !== 'swizzle') return null;
      const channels = ['x', 'y', 'z', 'w'];
      const options: string[] = [];
      for(let a of channels) options.push(a);
      for(let a of channels) for(let b of channels) options.push(a+b);
      for(let a of channels) for(let b of channels) for(let c of channels) options.push(a+b+c);
      for(let a of channels) for(let b of channels) for(let c of channels) for(let d of channels) options.push(a+b+c+d);
      return options;
  }, [node.type]);

  const renderSocketInput = (socketId: string, type: SocketType) => {
      if (isNodeCollapsed) return null;
      const isConnected = allConnections.some(c => c.targetNodeId === node.id && c.targetSocketId === socketId);
      if (isConnected) return null;

      const val = node.data.inputValues?.[socketId];

      if (type === 'float') {
          // Determine contextual defaults for better UX
          let fallback = 0;
          if (socketId === 'range') fallback = 0.5;
          else if (socketId === 'ior') fallback = 1.5;
          else if (socketId === 'contrast') fallback = 1.0;
          else if (socketId === 'amplitude') fallback = 1.0; // UPDATED: Match new scale (1.0 = 0.1)
          else if (socketId === 'scale') fallback = 1.0; // Noise scale usually > 0
          else if (['multiply', 'divide', 'power'].includes(node.type) && socketId === 'b') fallback = 1;
          
          const defaultVal = val !== undefined ? val : fallback;

          return (
              <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500 transition-colors nodrag">
                <input 
                    type="number" 
                    step="0.01"
                    className="w-12 h-4 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right"
                    value={defaultVal}
                    onChange={(e) => handleInputChange(socketId, e.target.value)}
                    onMouseDown={e => e.stopPropagation()} 
                />
              </div>
          );
      }

      if (socketId === 'uv' && type === 'vec2') {
          return (
             <div className="nodrag">
                <select 
                    className="bg-[#0a0a0a] text-[9px] text-gray-300 border border-gray-800 rounded h-4 outline-none nodrag cursor-pointer"
                    value={val || 'UV0'}
                    onChange={(e) => handleInputChange(socketId, e.target.value)}
                    onMouseDown={e => e.stopPropagation()}
                >
                    <option value="UV0">UV0</option>
                </select>
             </div>
          );
      }

      if (type === 'vec2') {
          const vec = val || { x: 0, y: 0 };
          return (
             <div className="flex flex-col gap-0.5 nodrag">
                <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                    <span className="text-[8px] text-red-400 pl-1 select-none font-bold">X</span>
                    <input 
                        type="number" step="0.1"
                        className="w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right"
                        value={vec.x}
                        onChange={(e) => handleVec2Change(socketId, 'x', e.target.value)}
                        onMouseDown={e => e.stopPropagation()} 
                    />
                </div>
                <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                    <span className="text-[8px] text-green-400 pl-1 select-none font-bold">Y</span>
                    <input 
                        type="number" step="0.1"
                        className="w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right"
                        value={vec.y}
                        onChange={(e) => handleVec2Change(socketId, 'y', e.target.value)}
                        onMouseDown={e => e.stopPropagation()} 
                    />
                </div>
             </div>
          );
      }

      if (type === 'vec3') {
          const vec = (val && typeof val === 'object') ? val : { x: 0, y: 0, z: 0 };
          return (
             <div className="flex flex-col gap-0.5 nodrag">
                <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                    <span className="text-[8px] text-red-400 pl-1 select-none font-bold w-2">X</span>
                    <input 
                        type="number" step="0.1"
                        className="w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right"
                        value={vec.x}
                        onChange={(e) => handleVec3Change(socketId, 'x', e.target.value)}
                        onMouseDown={e => e.stopPropagation()} 
                    />
                </div>
                <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                    <span className="text-[8px] text-green-400 pl-1 select-none font-bold w-2">Y</span>
                    <input 
                        type="number" step="0.1"
                        className="w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right"
                        value={vec.y}
                        onChange={(e) => handleVec3Change(socketId, 'y', e.target.value)}
                        onMouseDown={e => e.stopPropagation()} 
                    />
                </div>
                <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                    <span className="text-[8px] text-blue-400 pl-1 select-none font-bold w-2">Z</span>
                    <input 
                        type="number" step="0.1"
                        className="w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right"
                        value={vec.z}
                        onChange={(e) => handleVec3Change(socketId, 'z', e.target.value)}
                        onMouseDown={e => e.stopPropagation()} 
                    />
                </div>
             </div>
          );
      }
      
      if (type === 'vec4') {
          const vec = (val && typeof val === 'object') ? val : { x: 0, y: 0, z: 0, w: 0 };
          return (
             <div className="flex gap-0.5 nodrag">
                <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                    <span className="text-[7px] text-red-400 pl-0.5 select-none font-bold">X</span>
                    <input 
                        type="number" step="0.1"
                        className="w-6 h-3.5 bg-transparent text-[8px] text-gray-300 px-0.5 outline-none text-right"
                        value={vec.x}
                        onChange={(e) => handleVec4Change(socketId, 'x', e.target.value)}
                        onMouseDown={e => e.stopPropagation()} 
                    />
                </div>
                <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                    <span className="text-[7px] text-green-400 pl-0.5 select-none font-bold">Y</span>
                    <input 
                        type="number" step="0.1"
                        className="w-6 h-3.5 bg-transparent text-[8px] text-gray-300 px-0.5 outline-none text-right"
                        value={vec.y}
                        onChange={(e) => handleVec4Change(socketId, 'y', e.target.value)}
                        onMouseDown={e => e.stopPropagation()} 
                    />
                </div>
                <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                    <span className="text-[7px] text-blue-400 pl-0.5 select-none font-bold">Z</span>
                    <input 
                        type="number" step="0.1"
                        className="w-6 h-3.5 bg-transparent text-[8px] text-gray-300 px-0.5 outline-none text-right"
                        value={vec.z}
                        onChange={(e) => handleVec4Change(socketId, 'z', e.target.value)}
                        onMouseDown={e => e.stopPropagation()} 
                    />
                </div>
                <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                    <span className="text-[7px] text-gray-400 pl-0.5 select-none font-bold">W</span>
                    <input 
                        type="number" step="0.1"
                        className="w-6 h-3.5 bg-transparent text-[8px] text-gray-300 px-0.5 outline-none text-right"
                        value={vec.w}
                        onChange={(e) => handleVec4Change(socketId, 'w', e.target.value)}
                        onMouseDown={e => e.stopPropagation()} 
                    />
                </div>
             </div>
          );
      }

      if (type === 'color') {
           const defaultVal = (typeof val === 'string' && val.startsWith('#')) ? val : '#ffffff';
           return (
              <div className="flex items-center gap-1 bg-[#0a0a0a] border border-gray-700 rounded px-1 h-4 nodrag hover:border-gray-500 transition-colors relative w-12 overflow-hidden">
                  <ThrottledColorInput 
                      value={defaultVal}
                      onChange={(newVal) => handleInputChange(socketId, newVal)}
                  />
              </div>
           );
      }
      return null;
  };

  const isTextureInputConnected = (node.type === 'texture' || node.type === 'calculateLevelOfDetailTexture' || node.type === 'sampleTexture2DLOD' || node.type === 'gatherTexture2D' || node.type === 'sampleTexture2DArray' || node.type === 'textureSize' || node.type === 'parallaxMapping') && 
      allConnections.some(c => c.targetNodeId === node.id && c.targetSocketId === 'texture');

  const isDitherScreenPosConnected = node.type === 'dither' && 
      allConnections.some(c => c.targetNodeId === node.id && c.targetSocketId === 'screenPos');
      
  const isGradientConnected = node.type === 'sampleGradient' &&
      allConnections.some(c => c.targetNodeId === node.id && c.targetSocketId === 'gradient');

  let resolvedTexture = node.data.textureAsset;
  if (isTextureInputConnected) {
      const conn = allConnections.find(c => c.targetNodeId === node.id && c.targetSocketId === 'texture');
      if (conn) {
          const sourceNode = allNodes.find(n => n.id === conn.sourceNodeId);
          if (sourceNode && sourceNode.data.textureAsset) {
              resolvedTexture = sourceNode.data.textureAsset;
          }
      }
  }

  const handleHeaderDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      onUpdateData(node.id, { nodeCollapsed: !isNodeCollapsed });
  };

  return (
    <div
      id={`node-${node.id}`}
      className={`absolute ${isWide ? 'w-60' : 'w-40'} rounded-lg shadow-xl border ${selected ? 'border-blue-500 shadow-blue-500/30' : 'border-[#111]'} bg-[#1e1e1e] flex flex-col z-auto`}
      style={{ left: node.x, top: node.y }}
    >
      {/* Header */}
      <div 
        className={`h-7 rounded-t-lg flex items-center px-2 cursor-grab active:cursor-grabbing border-b border-black ${selected ? 'bg-blue-600' : isObjectNode ? 'bg-[#eab308]/90 border-yellow-500 text-white shadow-inner' : 'bg-[#2a2a2a]'}`}
        onMouseDown={(e) => onMouseDown(e, node.id)}
        onDoubleClick={handleHeaderDoubleClick}
      >
        <span className="text-[11px] font-semibold text-gray-100 flex-1 truncate">{node.label}</span>
        
        <button 
            className="text-white/50 hover:text-white p-0.5 rounded nodrag ml-auto"
            onClick={(e) => { 
                e.stopPropagation(); 
                onUpdateData(node.id, { nodeCollapsed: !isNodeCollapsed });
            }}
            title={isNodeCollapsed ? "Expand Node" : "Collapse Node"}
            onMouseDown={e => e.stopPropagation()}
        >
            {isNodeCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Body */}
      <div className={`p-2 relative flex flex-col gap-2 ${isNodeCollapsed ? 'pb-1' : ''}`}>
        
        {canShowPreview && !isNodeCollapsed && (
          <div className="flex flex-col rounded overflow-hidden border border-gray-700">
              <div className="h-5 bg-[#252525] flex items-center justify-between px-1 border-b border-gray-800">
                  <div className="flex items-center gap-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onUpdateData(node.id, { previewCollapsed: !isPreviewCollapsed }); }} 
                        className="text-gray-400 hover:text-white p-0.5 nodrag"
                        onMouseDown={e => e.stopPropagation()}
                      >
                          {isPreviewCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                      </button>
                      <span className="text-[9px] text-gray-400 font-semibold select-none">Preview</span>
                  </div>
                  
                  {!isPreviewCollapsed && (
                    <div className="flex gap-0.5 rounded p-0.5 nodrag" onMouseDown={e => e.stopPropagation()}>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setPreviewMode('2d'); }} 
                            className={`p-0.5 rounded hover:bg-white/10 ${previewMode === '2d' ? 'text-blue-400' : 'text-gray-500'}`}
                            title="2D View"
                        >
                            <Square className="w-2.5 h-2.5" />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setPreviewMode('3d'); }} 
                            className={`p-0.5 rounded hover:bg-white/10 ${previewMode === '3d' ? 'text-blue-400' : 'text-gray-500'}`}
                            title="3D View"
                        >
                            <Box className="w-2.5 h-2.5" />
                        </button>
                    </div>
                  )}
              </div>

              <div 
                className={`w-full bg-black relative group transition-all duration-300 ${isPreviewCollapsed ? 'h-0' : 'aspect-square'}`}
              >
                {!isPreviewCollapsed && (
                    <Preview 
                        fragShader={nodeFragShader} 
                        mode={previewMode} 
                        textures={textureUniforms} 
                        nodeId={node.id}
                    />
                )}
              </div>
          </div>
        )}
        
        {!isNodeCollapsed && (
            <>
                {/* GEOMETRY NODES SPACE SELECTOR */}
                {['position', 'normal', 'tangent', 'bitangent', 'viewDirection', 'viewVector'].includes(node.type) && (
                    <div className="w-full h-6 rounded border border-gray-700 bg-[#0a0a0a] flex items-center px-1 nodrag mb-1">
                        <span className="text-[9px] text-gray-500 mr-2">Space</span>
                        <select 
                            className="bg-[#0a0a0a] text-[10px] text-white w-full outline-none border-none cursor-pointer"
                            value={node.data.space || 'World'}
                            onChange={(e) => onUpdateData(node.id, { space: e.target.value })}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <option value="World">World</option>
                            <option value="Object">Object</option>
                            <option value="View">View</option>
                            <option value="Tangent">Tangent</option>
                            {node.type === 'position' && <option value="Absolute World">Absolute World</option>}
                        </select>
                    </div>
                )}

                {/* RECIPROCAL NODE UI */}
                {node.type === 'reciprocal' && (
                    <div className="w-full h-6 rounded border border-gray-700 bg-[#0a0a0a] flex items-center px-1 nodrag mb-1">
                        <span className="text-[9px] text-gray-500 mr-2">Method</span>
                        <select 
                            className="bg-[#0a0a0a] text-[10px] text-white w-full outline-none border-none cursor-pointer"
                            value={node.data.reciprocalMethod || 'Default'}
                            onChange={(e) => onUpdateData(node.id, { reciprocalMethod: e.target.value })}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <option value="Default">Default</option>
                            <option value="Fast">Fast</option>
                        </select>
                    </div>
                )}

                {/* SCREEN POSITION UI */}
                {node.type === 'screenPosition' && (
                    <div className="w-full h-6 rounded border border-gray-700 bg-[#0a0a0a] flex items-center px-1 nodrag mb-1">
                        <span className="text-[9px] text-gray-500 mr-2">Mode</span>
                        <select 
                            className="bg-[#0a0a0a] text-[10px] text-white w-full outline-none border-none cursor-pointer"
                            value={node.data.screenPositionMode || 'Default'}
                            onChange={(e) => onUpdateData(node.id, { screenPositionMode: e.target.value })}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <option value="Default">Default</option>
                            <option value="Raw">Raw</option>
                            <option value="Center">Center</option>
                            <option value="Tiled">Tiled</option>
                            <option value="Pixel">Pixel</option>
                        </select>
                    </div>
                )}

                {/* FLIPBOOK NODE UI */}
                {node.type === 'flipbook' && (
                    <div className="flex flex-col gap-1 nodrag mb-1">
                         <div className="flex items-center justify-between px-1 h-6 bg-[#0a0a0a] border border-gray-700 rounded">
                            <span className="text-[9px] text-gray-400">Invert X</span>
                            <button 
                                onClick={() => onUpdateData(node.id, { invertX: !node.data.invertX })}
                                onMouseDown={e => e.stopPropagation()}
                                className="text-gray-400 hover:text-white"
                            >
                                {node.data.invertX ? <CheckSquare className="w-3 h-3" /> : <SquareIcon className="w-3 h-3" />}
                            </button>
                         </div>
                         <div className="flex items-center justify-between px-1 h-6 bg-[#0a0a0a] border border-gray-700 rounded">
                            <span className="text-[9px] text-gray-400">Invert Y</span>
                            <button 
                                onClick={() => onUpdateData(node.id, { invertY: !node.data.invertY })}
                                onMouseDown={e => e.stopPropagation()}
                                className="text-gray-400 hover:text-white"
                            >
                                {node.data.invertY ? <CheckSquare className="w-3 h-3" /> : <SquareIcon className="w-3 h-3" />}
                            </button>
                         </div>
                    </div>
                )}

                {/* PARALLAX MAPPING UI */}
                {node.type === 'parallaxMapping' && (
                    <div className="w-full h-6 rounded border border-gray-700 bg-[#0a0a0a] flex items-center px-1 nodrag mb-1">
                        <span className="text-[9px] text-gray-500 mr-2 flex-1">Sample Channel</span>
                        <select 
                            className="bg-[#0a0a0a] text-[10px] text-white w-14 outline-none border-none cursor-pointer"
                            value={node.data.parallaxChannel || 'g'}
                            onChange={(e) => onUpdateData(node.id, { parallaxChannel: e.target.value })}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <option value="r">Red</option>
                            <option value="g">Green</option>
                            <option value="b">Blue</option>
                            <option value="a">Alpha</option>
                        </select>
                    </div>
                )}

                {/* SCENE DEPTH UI */}
                {node.type === 'sceneDepth' && (
                    <div className="w-full h-6 rounded border border-gray-700 bg-[#0a0a0a] flex items-center px-1 nodrag mb-1">
                        <span className="text-[9px] text-gray-500 mr-2">Sampling</span>
                        <select 
                            className="bg-[#0a0a0a] text-[10px] text-white w-full outline-none border-none cursor-pointer"
                            value={node.data.sceneDepthMode || 'Linear01'}
                            onChange={(e) => onUpdateData(node.id, { sceneDepthMode: e.target.value })}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <option value="Linear01">Linear 01</option>
                            <option value="Raw">Raw</option>
                            <option value="Eye">Eye</option>
                        </select>
                    </div>
                )}

                {/* SCENE DEPTH DIFFERENCE UI */}
                {node.type === 'sceneDepthDifference' && (
                    <div className="w-full h-6 rounded border border-gray-700 bg-[#0a0a0a] flex items-center px-1 nodrag mb-1">
                        <span className="text-[9px] text-gray-500 mr-2">Sampling Mode</span>
                        <select 
                            className="bg-[#0a0a0a] text-[10px] text-white w-full outline-none border-none cursor-pointer"
                            value={node.data.sceneDepthMode || 'Linear01'}
                            onChange={(e) => onUpdateData(node.id, { sceneDepthMode: e.target.value })}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <option value="Linear01">Linear 01</option>
                            <option value="Raw">Raw</option>
                            <option value="Eye">Eye</option>
                        </select>
                    </div>
                )}

                {/* TRANSFORM NODE UI */}
                {node.type === 'transform' && (
                    <div className="flex flex-col gap-1 nodrag mb-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-gray-500 w-8">From</span>
                            <select 
                                className="bg-[#0a0a0a] border border-gray-700 rounded text-[10px] text-white outline-none h-5 flex-1 w-full cursor-pointer"
                                value={node.data.transformSpaceFrom || 'Object'}
                                onChange={(e) => onUpdateData(node.id, { transformSpaceFrom: e.target.value })}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <option value="Object">Object</option>
                                <option value="World">World</option>
                                <option value="View">View</option>
                                <option value="Tangent">Tangent</option>
                                <option value="Absolute World">Absolute World</option>
                                <option value="Screen">Screen</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-gray-500 w-8">To</span>
                            <select 
                                className="bg-[#0a0a0a] border border-gray-700 rounded text-[10px] text-white outline-none h-5 flex-1 w-full cursor-pointer"
                                value={node.data.transformSpaceTo || 'World'}
                                onChange={(e) => onUpdateData(node.id, { transformSpaceTo: e.target.value })}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <option value="Object">Object</option>
                                <option value="World">World</option>
                                <option value="View">View</option>
                                <option value="Tangent">Tangent</option>
                                <option value="Absolute World">Absolute World</option>
                                <option value="Screen">Screen</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-gray-500 w-8">Type</span>
                            <select 
                                className="bg-[#0a0a0a] border border-gray-700 rounded text-[10px] text-white outline-none h-5 flex-1 w-full cursor-pointer"
                                value={node.data.transformType || 'Position'}
                                onChange={(e) => onUpdateData(node.id, { transformType: e.target.value })}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <option value="Position">Position</option>
                                <option value="Direction">Direction</option>
                                <option value="Normal">Normal</option>
                            </select>
                        </div>
                    </div>
                )}

                {/* COLORSPACE CONVERSION UI */}
                {node.type === 'colorspaceConversion' && (
                    <div className="flex flex-col gap-1 nodrag mb-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-gray-500 w-8">From</span>
                            <select 
                                className="bg-[#0a0a0a] border border-gray-700 rounded text-[10px] text-white outline-none h-5 flex-1 w-full cursor-pointer"
                                value={node.data.conversionFrom || 'RGB'}
                                onChange={(e) => onUpdateData(node.id, { conversionFrom: e.target.value })}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <option value="RGB">RGB</option>
                                <option value="Linear">Linear</option>
                                <option value="HSV">HSV</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-gray-500 w-8">To</span>
                            <select 
                                className="bg-[#0a0a0a] border border-gray-700 rounded text-[10px] text-white outline-none h-5 flex-1 w-full cursor-pointer"
                                value={node.data.conversionTo || 'Linear'}
                                onChange={(e) => onUpdateData(node.id, { conversionTo: e.target.value })}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <option value="RGB">RGB</option>
                                <option value="Linear">Linear</option>
                                <option value="HSV">HSV</option>
                            </select>
                        </div>
                    </div>
                )}

                {/* GRADIENT NODE UI */}
                {node.type === 'gradient' && (
                    <div className="flex flex-col gap-2 nodrag">
                        <div className="relative group">
                            {/* Gradient Bar Container */}
                            <div 
                                ref={gradientRef}
                                className="h-6 w-full rounded border border-gray-600 relative cursor-crosshair overflow-visible bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiM0MDQwNDAiLz48cGF0aCBkPSJNTAgMEw4IDBaIiBmaWxsPSIjNTA1MDUwIi8+PC9zdmc+')] bg-repeat"
                                onClick={handleGradientClick}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                {/* The visual gradient */}
                                <div 
                                    className="absolute inset-0 rounded"
                                    style={{ background: `linear-gradient(to right, ${generateGradientCSS(getGradientStops())})` }}
                                />
                                
                                {/* Stops */}
                                {getGradientStops().map(stop => (
                                    <div 
                                        key={stop.id}
                                        className={`absolute top-0 bottom-0 w-0 flex flex-col items-center justify-end z-10 group/stop`}
                                        style={{ left: `${stop.t * 100}%` }}
                                        onClick={(e) => { e.stopPropagation(); setActiveStopId(stop.id); }}
                                    >
                                        {/* Markers */}
                                        <div className={`w-3 h-3 -mt-3.5 absolute top-0 transform rotate-180 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent ${activeStopId === stop.id ? 'border-b-blue-500 scale-125' : 'border-b-white'} drop-shadow-md cursor-pointer hover:scale-110 transition-transform`} />
                                        <div className={`w-3 h-3 -mb-3.5 absolute bottom-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent ${activeStopId === stop.id ? 'border-b-blue-500 scale-125' : 'border-b-white'} drop-shadow-md cursor-pointer hover:scale-110 transition-transform`} />
                                        <div className={`w-0.5 h-full ${activeStopId === stop.id ? 'bg-white' : 'bg-black/50'} `} />
                                    </div>
                                ))}
                            </div>
                            <div className="absolute top-full w-full text-center text-[9px] text-gray-500 opacity-0 group-hover:opacity-100 pointer-events-none pt-1">
                                Click bar to add stop
                            </div>
                        </div>

                        {/* Active Stop Controls */}
                        {activeStopId && (() => {
                            const stop = getGradientStops().find(s => s.id === activeStopId);
                            if (!stop) return null;
                            return (
                                <div className="flex items-center gap-1 bg-[#0a0a0a] border border-gray-700 p-1 rounded animate-in fade-in slide-in-from-top-1">
                                    <div className="w-6 h-6 rounded border border-gray-600 relative overflow-hidden shrink-0">
                                        <ThrottledColorInput 
                                            value={stop.color} 
                                            onChange={(c) => updateStop(stop.id, { color: c })}
                                        />
                                    </div>
                                    <div className="flex-1 flex items-center bg-gray-900 border border-gray-800 rounded px-1">
                                        <span className="text-[9px] text-gray-500 mr-1">T</span>
                                        <input 
                                            type="number" step="0.01" min="0" max="1"
                                            className="w-full bg-transparent text-[10px] text-white outline-none h-5 text-right"
                                            value={stop.t}
                                            onChange={(e) => updateStop(stop.id, { t: parseFloat(e.target.value) })}
                                            onMouseDown={e => e.stopPropagation()}
                                        />
                                    </div>
                                    <button 
                                        className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
                                        onClick={() => removeStop(stop.id)}
                                        title="Delete Stop"
                                        onMouseDown={e => e.stopPropagation()}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* METAL REFLECTANCE UI */}
                {node.type === 'metalReflectance' && (
                    <div className="w-full h-6 rounded border border-gray-700 bg-[#0a0a0a] flex items-center px-1 nodrag mb-1">
                        <span className="text-[9px] text-gray-500 mr-2">Metal</span>
                        <select 
                            className="bg-[#0a0a0a] text-[10px] text-white w-full outline-none border-none cursor-pointer"
                            value={node.data.metalType || 'Iron'}
                            onChange={(e) => onUpdateData(node.id, { metalType: e.target.value })}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <option value="Iron">Iron</option>
                            <option value="Silver">Silver</option>
                            <option value="Aluminium">Aluminium</option>
                            <option value="Gold">Gold</option>
                            <option value="Copper">Copper</option>
                            <option value="Chromium">Chromium</option>
                            <option value="Nickel">Nickel</option>
                            <option value="Titanium">Titanium</option>
                            <option value="Cobalt">Cobalt</option>
                            <option value="Platinum">Platinum</option>
                        </select>
                    </div>
                )}

                {/* DIELECTRIC SPECULAR UI */}
                {node.type === 'dielectricSpecular' && (
                    <div className="w-full h-6 rounded border border-gray-700 bg-[#0a0a0a] flex items-center px-1 nodrag mb-1">
                        <span className="text-[9px] text-gray-500 mr-2">Material</span>
                        <select 
                            className="bg-[#0a0a0a] text-[10px] text-white w-full outline-none border-none cursor-pointer"
                            value={node.data.dielectricMaterial || 'Common'}
                            onChange={(e) => onUpdateData(node.id, { dielectricMaterial: e.target.value })}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <option value="Common">Common</option>
                            <option value="RustedMetal">Rusted Metal</option>
                            <option value="Water">Water</option>
                            <option value="Ice">Ice</option>
                            <option value="Glass">Glass</option>
                            <option value="Custom">Custom</option>
                        </select>
                    </div>
                )}

                {/* GENERIC TEXTURE CONTROLS */}
                {((node.type === 'texture' || node.type === 'calculateLevelOfDetailTexture' || node.type === 'sampleTexture2DLOD' || node.type === 'gatherTexture2D' || node.type === 'sampleTexture2DArray' || node.type === 'textureSize' || node.type === 'parallaxMapping') || node.type === 'textureAsset') && (
                   <div className="flex flex-col gap-2 nodrag">
                     <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/png, image/jpeg, image/jpg, image/webp, .tga"
                        onChange={handleImageUpload}
                     />

                     {node.type === 'texture' && !isTextureInputConnected && (
                        <div className="grid grid-cols-2 gap-1 mb-1">
                            <div className="flex flex-col">
                                <span className="text-[9px] text-gray-500">Type</span>
                                <select 
                                    className="bg-[#0a0a0a] border border-gray-700 rounded text-[10px] text-white outline-none h-5"
                                    value={node.data.textureType || 'Default'}
                                    onChange={(e) => onUpdateData(node.id, { textureType: e.target.value })}
                                    onMouseDown={e => e.stopPropagation()}
                                >
                                    <option value="Default">Default</option>
                                    <option value="Normal">Normal</option>
                                </select>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[9px] text-gray-500">Space</span>
                                <select 
                                    className="bg-[#0a0a0a] border border-gray-700 rounded text-[10px] text-white outline-none h-5 cursor-pointer"
                                    value={node.data.space || 'Tangent'}
                                    onChange={(e) => onUpdateData(node.id, { space: e.target.value })}
                                    onMouseDown={e => e.stopPropagation()}
                                >
                                    <option value="Tangent">Tangent</option>
                                    <option value="Object">Object</option>
                                </select>
                            </div>
                        </div>
                     )}

                     {node.type === 'textureAsset' ? (
                         <div className="w-full aspect-square bg-[#0a0a0a] border border-gray-700 rounded relative group overflow-hidden flex items-center justify-center">
                             {isLoadingTexture ? (
                                 <div className="flex flex-col items-center gap-1">
                                    <Loader2 className="w-5 h-5 animate-spin text-blue-500"/>
                                    <span className="text-[9px] text-gray-400">Loading...</span>
                                 </div>
                             ) : resolvedTexture ? (
                                 <div className="w-full h-full relative">
                                     <img src={resolvedTexture} className="w-full h-full object-cover" alt="texture" />
                                 </div>
                             ) : (
                                 <div className="text-[9px] text-gray-600 text-center px-2">No Texture</div>
                             )}
                             
                             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                                 <button 
                                     className="bg-gray-200 text-black p-1.5 rounded-full hover:bg-white shadow-lg transform scale-95 group-hover:scale-100 transition-transform"
                                     onClick={() => fileInputRef.current?.click()}
                                     onMouseDown={e => e.stopPropagation()}
                                     title="Upload Texture (PNG, JPG, TGA)"
                                 >
                                     <Upload className="w-4 h-4" />
                                 </button>
                             </div>
                         </div>
                     ) : (
                         !isTextureInputConnected && node.type !== 'sampleTexture2DArray' && (
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between bg-[#0a0a0a] border border-gray-700 rounded p-1">
                                   <span className="text-[9px] text-gray-500 pl-1 flex items-center gap-1"><ImageIcon className="w-3 h-3"/> Source</span>
                                   <button 
                                        className="bg-gray-800 hover:bg-gray-700 text-[9px] text-gray-200 px-2 py-0.5 rounded border border-gray-600 transition-colors disabled:opacity-50"
                                        onClick={() => fileInputRef.current?.click()}
                                        onMouseDown={e => e.stopPropagation()}
                                        disabled={isLoadingTexture}
                                   >
                                       {isLoadingTexture ? 'Loading...' : (node.data.textureAsset ? 'Change Asset' : 'Select Asset')}
                                   </button>
                                </div>
                            </div>
                         )
                     )}

                     {node.type === 'calculateLevelOfDetailTexture' && (
                         <div className="flex items-center justify-between px-1 h-6 bg-[#0a0a0a] border border-gray-700 rounded">
                            <span className="text-[9px] text-gray-400">Clamp</span>
                            <button 
                                onClick={() => onUpdateData(node.id, { clamp: !node.data.clamp })}
                                onMouseDown={e => e.stopPropagation()}
                                className="text-gray-400 hover:text-white"
                            >
                                {node.data.clamp ? <CheckSquare className="w-3 h-3" /> : <SquareIcon className="w-3 h-3" />}
                            </button>
                         </div>
                     )}
                   </div>
                )}

                {/* TEXTURE 2D ARRAY ASSET UI */}
                {node.type === 'texture2DArrayAsset' && (
                    <div className="flex flex-col gap-2 nodrag">
                        {/* ... Texture Array Logic ... */}
                        <input 
                            type="file" 
                            ref={arrayFileInputRef} 
                            className="hidden" 
                            accept="image/png, image/jpeg, image/jpg, image/webp, .tga"
                            multiple
                            onChange={handleTextureArrayUpload}
                        />
                        
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] text-gray-400 font-semibold flex items-center gap-1">
                                <Layers className="w-3 h-3"/> {node.data.layerCount || 0} Layers
                            </span>
                            <button 
                                className="bg-blue-600 hover:bg-blue-500 text-white p-1 rounded text-[9px] flex items-center gap-1"
                                onClick={() => arrayFileInputRef.current?.click()}
                                onMouseDown={e => e.stopPropagation()}
                                disabled={isLoadingTexture}
                            >
                            {isLoadingTexture ? <Loader2 className="w-3 h-3 animate-spin"/> : <Plus className="w-3 h-3" />} Add
                            </button>
                        </div>

                        <div className="grid grid-cols-4 gap-1 max-h-32 overflow-y-auto scrollbar-thin bg-black/20 p-1 rounded">
                            {(node.data.layers || []).map((layerSrc, idx) => (
                                <div key={idx} className="relative group aspect-square border border-gray-700 rounded overflow-hidden">
                                    <img src={layerSrc} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <button 
                                            className="text-red-400 hover:text-red-200"
                                            onClick={() => removeArrayLayer(idx)}
                                            onMouseDown={e => e.stopPropagation()}
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="absolute bottom-0 right-0 bg-black/80 text-[8px] px-1 text-gray-300">
                                        {idx}
                                    </div>
                                </div>
                            ))}
                            {(node.data.layers?.length === 0 || !node.data.layers) && (
                                <div className="col-span-4 text-[9px] text-gray-600 text-center py-4 border border-dashed border-gray-700 rounded">
                                    No textures loaded.<br/>Same size required.
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
                {/* SAMPLER STATE NODE UI */}
                {node.type === 'samplerState' && (
                    <div className="flex flex-col gap-2 nodrag">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-400">Filter</span>
                            <select 
                                className="bg-[#0a0a0a] border border-gray-700 rounded text-[10px] text-white outline-none h-5 w-20"
                                value={node.data.samplerFilter || 'Linear'}
                                onChange={(e) => onUpdateData(node.id, { samplerFilter: e.target.value })}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <option value="Linear">Linear</option>
                                <option value="Point">Point</option>
                                <option value="Trilinear">Trilinear</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-400">Wrap</span>
                            <select 
                                className="bg-[#0a0a0a] border border-gray-700 rounded text-[10px] text-white outline-none h-5 w-20"
                                value={node.data.samplerWrap || 'Repeat'}
                                onChange={(e) => onUpdateData(node.id, { samplerWrap: e.target.value })}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <option value="Repeat">Repeat</option>
                                <option value="Clamp">Clamp</option>
                                <option value="Mirror">Mirror</option>
                                <option value="MirrorOnce">Mirror Once</option>
                            </select>
                        </div>
                    </div>
                )}

                {/* SLIDER NODE UI */}
                {node.type === 'slider' && (
                    <div className="flex flex-col gap-3 nodrag">
                        <div className="flex items-center gap-2">
                            <input 
                                type="range"
                                min={node.data.minValue ?? 0}
                                max={node.data.maxValue ?? 1}
                                step={0.01}
                                value={node.data.value ?? 0.5}
                                onChange={(e) => onUpdateData(node.id, { value: parseFloat(e.target.value) })}
                                className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
                                onMouseDown={e => e.stopPropagation()}
                            />
                            <div className="w-10 bg-[#0a0a0a] border border-gray-700 rounded px-1 flex items-center">
                                <input 
                                    type="number"
                                    step={0.01}
                                    className="w-full h-5 bg-transparent text-[10px] text-white outline-none text-right"
                                    value={node.data.value ?? 0.5}
                                    onChange={(e) => onUpdateData(node.id, { value: e.target.value })}
                                    onMouseDown={e => e.stopPropagation()}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex items-center gap-2 flex-1">
                                <span className="text-[10px] text-gray-400">Min</span>
                                <div className="flex-1 bg-[#0a0a0a] border border-gray-700 rounded px-1">
                                    <input 
                                        type="number"
                                        step={0.1}
                                        className="w-full h-5 bg-transparent text-[10px] text-white outline-none"
                                        value={node.data.minValue ?? 0}
                                        onChange={(e) => onUpdateData(node.id, { minValue: e.target.value })}
                                        onMouseDown={e => e.stopPropagation()}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-1">
                                <span className="text-[10px] text-gray-400">Max</span>
                                <div className="flex-1 bg-[#0a0a0a] border border-gray-700 rounded px-1">
                                    <input 
                                        type="number"
                                        step={0.1}
                                        className="w-full h-5 bg-transparent text-[10px] text-white outline-none"
                                        value={node.data.maxValue ?? 1}
                                        onChange={(e) => onUpdateData(node.id, { maxValue: e.target.value })}
                                        onMouseDown={e => e.stopPropagation()}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* CHANNEL MASK UI */}
                {node.type === 'channelMask' && (
                    <div className="relative w-full nodrag mb-1">
                        <div className="flex items-center justify-between mb-1">
                             <span className="text-[9px] text-gray-500">Channels</span>
                        </div>
                        <button 
                            className="w-full h-6 bg-[#0a0a0a] border border-gray-700 rounded flex items-center justify-between px-2 text-[10px] text-white hover:border-gray-500 transition-colors"
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                setIsMaskOpen(!isMaskOpen); 
                            }}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <span className="truncate tracking-widest">{node.data.channelMask || 'None'}</span>
                            <ChevronDown className="w-3 h-3 text-gray-500" />
                        </button>

                        {isMaskOpen && (
                            <div className="absolute top-full left-0 w-full bg-[#1e1e1e] border border-gray-600 rounded shadow-2xl mt-1 flex flex-col overflow-hidden z-[100]">
                                <button 
                                    className="px-2 py-1.5 text-[9px] text-left text-gray-300 hover:bg-gray-700 hover:text-white border-b border-gray-800"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateData(node.id, { channelMask: '' });
                                    }}
                                    onMouseDown={e => e.stopPropagation()}
                                >
                                    Nothing
                                </button>
                                <button 
                                    className="px-2 py-1.5 text-[9px] text-left text-gray-300 hover:bg-gray-700 hover:text-white border-b border-gray-800"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateData(node.id, { channelMask: 'RGBA' });
                                    }}
                                    onMouseDown={e => e.stopPropagation()}
                                >
                                    Everything
                                </button>

                                {['Red', 'Green', 'Blue', 'Alpha'].map(label => {
                                    const char = label[0];
                                    const current = node.data.channelMask || 'RGBA';
                                    const isActive = current.includes(char);
                                    return (
                                        <button
                                            key={char}
                                            className={`flex items-center gap-2 px-2 py-1.5 text-[9px] hover:bg-gray-700 w-full text-left ${isActive ? 'text-blue-400' : 'text-gray-400'}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const order = ['R', 'G', 'B', 'A'];
                                                let newMask = isActive ? current.replace(char, '') : current + char;
                                                newMask = order.filter(c => newMask.includes(c)).join('');
                                                onUpdateData(node.id, { channelMask: newMask });
                                            }}
                                            onMouseDown={e => e.stopPropagation()}
                                        >
                                            <div className={`w-2.5 h-2.5 rounded border flex items-center justify-center ${isActive ? 'bg-blue-600 border-blue-600' : 'border-gray-600'}`}>
                                                {isActive && <Check className="w-2 h-2 text-white" />}
                                            </div>
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Matrix Construction & Swizzle UI */}
                {node.type === 'matrixConstruction' && (
                <div className="w-full h-6 rounded border border-gray-700 bg-[#0a0a0a] flex items-center px-1 nodrag">
                        <span className="text-[9px] text-gray-500 mr-2">Mode</span>
                        <select 
                            className="bg-[#0a0a0a] text-[10px] text-white w-full outline-none border-none cursor-pointer"
                            value={node.data.matrixMode || 'Row'}
                            onChange={(e) => onUpdateData(node.id, { matrixMode: e.target.value })}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <option value="Row">Row</option>
                            <option value="Column">Column</option>
                        </select>
                </div>
                )}
                
                {node.type === 'swizzle' && swizzleOptions && (
                <div className="flex flex-col gap-1 nodrag">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-gray-500">Mask</span>
                        <span className="text-[9px] text-blue-400 font-mono">{node.data.mask || 'xyzw'}</span>
                    </div>
                    <select 
                        className="w-full h-6 bg-[#0a0a0a] border border-gray-700 rounded text-[10px] text-white outline-none cursor-pointer"
                        value={node.data.mask || 'xyzw'}
                        onChange={(e) => onUpdateData(node.id, { mask: e.target.value })}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <optgroup label="Float (1)">
                            {swizzleOptions.filter(o => o.length === 1).map(o => <option key={o} value={o}>{o}</option>)}
                        </optgroup>
                        <optgroup label="Vector 2">
                            {swizzleOptions.filter(o => o.length === 2).map(o => <option key={o} value={o}>{o}</option>)}
                        </optgroup>
                        <optgroup label="Vector 3">
                            {swizzleOptions.filter(o => o.length === 3).map(o => <option key={o} value={o}>{o}</option>)}
                        </optgroup>
                        <optgroup label="Vector 4">
                            {swizzleOptions.filter(o => o.length === 4).map(o => <option key={o} value={o}>{o}</option>)}
                        </optgroup>
                    </select>
                </div>
                )}

                {/* Static Inputs */}
                {node.type === 'color' && (
                <div className="w-full h-8 rounded border border-gray-700 overflow-hidden relative nodrag">
                        <ThrottledColorInput 
                            value={node.data.value || '#ffffff'}
                            onChange={(newVal) => onUpdateData(node.id, { value: newVal })}
                        />
                </div>
                )}
                {node.type === 'float' && (
                <div className="flex items-center bg-[#0a0a0a] border border-gray-700 rounded px-2 focus-within:border-blue-500 nodrag">
                    <span className="text-[10px] text-gray-500 mr-2 font-mono">Value</span>
                    <input 
                    type="number" 
                    className="w-full h-6 bg-transparent text-[10px] text-white outline-none"
                    step="0.1"
                    value={node.data.value || 0}
                    onChange={(e) => onUpdateData(node.id, { value: e.target.value })}
                    onMouseDown={e => e.stopPropagation()}
                    />
                </div>
                )}
            </>
        )}
        
        {/* Sockets - (Existing Code) */}
        <div className="flex justify-between gap-4">
            <div className="flex flex-col gap-2 pt-1 w-full">
                {node.inputs.map((socket) => {
                    // Logic to hide/show sockets based on Dielectric Material mode
                    if (node.type === 'dielectricSpecular') {
                        const mode = node.data.dielectricMaterial || 'Common';
                        
                        // Range is only for Common
                        if (socket.id === 'range' && mode !== 'Common') return null;
                        
                        // IOR is only for Custom
                        if (socket.id === 'ior' && mode !== 'Custom') return null;
                        
                        // If it's a Preset (Water, Ice, etc), both are hidden
                    }

                    if (isNodeCollapsed) {
                        const isConnected = allConnections.some(c => c.targetNodeId === node.id && c.targetSocketId === socket.id);
                        if (!isConnected) return null;
                    }

                    return (
                        <div key={socket.id} className="flex flex-col gap-1 min-h-[20px] relative justify-center">
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                    <div 
                                        id={`socket-${node.id}-${socket.id}-in`}
                                        className="relative flex items-center justify-center w-6 h-6 -ml-3 cursor-crosshair group"
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            onSocketMouseDown(e, node.id, socket.id, true, socket.type);
                                        }}
                                        onMouseUp={(e) => {
                                            e.stopPropagation();
                                            onSocketMouseUp(e, node.id, socket.id, true, socket.type);
                                        }}
                                    >
                                        <div className={`w-2.5 h-2.5 rounded-full border border-[#111] ${getSocketColor(socket.type)} group-hover:scale-125 transition-transform z-10 shadow-sm`} />
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-medium pointer-events-none">{socket.label}</span>
                                </div>
                                {renderSocketInput(socket.id, socket.type)}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-col gap-2 pt-1 items-end">
                {node.outputs.map((socket) => {
                    if (isNodeCollapsed) {
                        const isConnected = allConnections.some(c => c.sourceNodeId === node.id && c.sourceSocketId === socket.id);
                        if (!isConnected) return null;
                    }

                    return (
                    <div key={socket.id} className="flex items-center gap-2 min-h-[20px] relative justify-end">
                        <span className="text-[10px] text-gray-400 font-medium pointer-events-none">{socket.label}</span>
                        <div 
                            id={`socket-${node.id}-${socket.id}-out`}
                            className="relative flex items-center justify-center w-6 h-6 -mr-3 cursor-crosshair group"
                             onMouseDown={(e) => {
                                e.stopPropagation();
                                onSocketMouseDown(e, node.id, socket.id, false, socket.type);
                            }}
                            onMouseUp={(e) => {
                                e.stopPropagation();
                                onSocketMouseUp(e, node.id, socket.id, false, socket.type);
                            }}
                        >
                            <div className={`w-2.5 h-2.5 rounded-full border border-[#111] ${getSocketColor(socket.type)} group-hover:scale-125 transition-transform z-10 shadow-sm`} />
                        </div>
                    </div>
                )})}
            </div>
        </div>
      </div>
    </div>
  );
};
