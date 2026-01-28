




import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ShaderNode, SocketType, Connection, GradientStop } from '../types';
import { Preview } from './Preview';
import { generateGLSL } from '../services/render/glslGenerator';
import { processTextureFile, createTextureAtlas } from '../services/render/textureUtils';
import { Upload, ArrowRight, Box, Square, CheckSquare, Square as SquareIcon, Image as ImageIcon, Loader2, Plus, X, ChevronDown, Check, ChevronUp, Layers, ChevronRight, Trash2, Circle, AppWindow } from 'lucide-react';
import { getNodeModule } from '../nodes';
import { getEffectiveSockets } from '../nodes/runtime';
import { NodeModuleUI } from './NodeModuleUI';

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

// Legacy lists kept for backward compatibility until all nodes migrate to metadata/ui config
const LEGACY_NO_PREVIEW_TYPES = ['float', 'slider', 'time', 'color', 'vector2', 'vector3', 'vector4', 'uv', 'output', 'vertex', 'gradient', 'screen', 'matrixConstruction', 'dielectricSpecular', 'position', 'mainLightDirection', 'object', 'samplerState', 'split', 'textureSize', 'camera', 'sceneDepth', 'sceneDepthDifference', 'flipbook', 'parallaxMapping', 'reciprocal'];

const LEGACY_WIDE_NODE_TYPES = ['color', 'slider', 'texture2DArrayAsset', 'gradient'];


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

    const previewMode = node.data.previewMode || '2d';
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

        allNodes.filter(n => getNodeModule(n.type)?.metadata?.isTextureSampler).forEach(n => {
            let assetUrl = n.data.textureAsset;
            const assetConn = allConnections.find(c => c.targetNodeId === n.id && c.targetSocketId === 'texture');

            if (assetConn) {
                const sourceNode = allNodes.find(sn => sn.id === assetConn.sourceNodeId);
                if (sourceNode && sourceNode.data.textureAsset) {
                    assetUrl = sourceNode.data.textureAsset;
                }
            }

            if (assetUrl) {
                const uniformName = `u_tex_${n.id.replace(/[-.]/g, '_')}`;

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

    const nodeModule = getNodeModule(node.type);
    const registryUi = nodeModule?.ui;
    const registrySocketRules = nodeModule?.socketRules;

    // RULE: Prioritize module-defined behavior over legacy centralized lists.
    const canShowPreview = registryUi?.preview
        ? registryUi.preview.enabled
        : !LEGACY_NO_PREVIEW_TYPES.includes(node.type);

    const isWide = registryUi?.width === 'wide' || LEGACY_WIDE_NODE_TYPES.includes(node.type);
    const isExtraWide = registryUi?.width === 'extraWide';

    // Header Style Setup: Instance Override > Metadata > Specific Legacy > Default
    const headerColorClass = node.data.headerColor
        ? node.data.headerColor
        : (nodeModule?.metadata?.headerColor
            ? nodeModule.metadata.headerColor
            : (node.type === 'object'
                ? 'bg-[#eab308]/90 border-yellow-500 text-white shadow-inner'
                : 'bg-[#2a2a2a]'));

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

    const isNodeSelected = selected;

    const getNodeWidthClass = () => {
        if (isExtraWide) return 'w-[480px]';
        if (isWide) return 'w-60';
        return 'w-44';
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
        for (let a of channels) options.push(a);
        for (let a of channels) for (let b of channels) options.push(a + b);
        for (let a of channels) for (let b of channels) for (let c of channels) options.push(a + b + c);
        for (let a of channels) for (let b of channels) for (let c of channels) for (let d of channels) options.push(a + b + c + d);
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
                        <span className="text-[8px] text-red-400 pl-1 select-none font-bold w-2">X</span>
                        <input
                            type="number" step="0.1"
                            className="w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right"
                            value={vec.x}
                            onChange={(e) => handleVec2Change(socketId, 'x', e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                        />
                    </div>
                    <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                        <span className="text-[8px] text-green-400 pl-1 select-none font-bold w-2">Y</span>
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
                <div className="flex flex-col gap-0.5 nodrag">
                    <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                        <span className="text-[8px] text-red-400 pl-1 select-none font-bold w-2">X</span>
                        <input
                            type="number" step="0.1"
                            className="w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right"
                            value={vec.x}
                            onChange={(e) => handleVec4Change(socketId, 'x', e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                        />
                    </div>
                    <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                        <span className="text-[8px] text-green-400 pl-1 select-none font-bold w-2">Y</span>
                        <input
                            type="number" step="0.1"
                            className="w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right"
                            value={vec.y}
                            onChange={(e) => handleVec4Change(socketId, 'y', e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                        />
                    </div>
                    <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                        <span className="text-[8px] text-blue-400 pl-1 select-none font-bold w-2">Z</span>
                        <input
                            type="number" step="0.1"
                            className="w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right"
                            value={vec.z}
                            onChange={(e) => handleVec4Change(socketId, 'z', e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                        />
                    </div>
                    <div className="flex items-center bg-[#0a0a0a] rounded border border-gray-800 focus-within:border-blue-500">
                        <span className="text-[8px] text-gray-400 pl-1 select-none font-bold w-2">W</span>
                        <input
                            type="number" step="0.1"
                            className="w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right"
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

    const isTextureInputConnected = getNodeModule(node.type)?.metadata?.isTextureSampler &&
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
            className={`absolute ${isWide ? 'w-60' : 'w-44'} rounded-lg shadow-xl border ${selected ? 'border-blue-500 shadow-blue-500/30' : 'border-[#111]'} bg-[#1e1e1e] flex flex-col z-auto`}
            style={{ left: node.x, top: node.y }}
        >
            {/* Header */}
            <div
                className={`h-7 rounded-t-lg flex items-center px-2 cursor-grab active:cursor-grabbing border-b border-black ${selected ? 'bg-blue-600' : headerColorClass}`}
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

                                    {previewMode === '3d' && (
                                        <>
                                            <div className="w-[1px] h-3 bg-gray-800 mx-0.5" />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onUpdateData(node.id, { previewObject: 'sphere' }); }}
                                                className={`p-0.5 rounded hover:bg-white/10 ${node.data.previewObject === 'sphere' || !node.data.previewObject ? 'text-blue-400' : 'text-gray-500'}`}
                                                title="Sphere"
                                            >
                                                <Circle className="w-2.5 h-2.5" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onUpdateData(node.id, { previewObject: 'box' }); }}
                                                className={`p-0.5 rounded hover:bg-white/10 ${node.data.previewObject === 'box' ? 'text-blue-400' : 'text-gray-500'}`}
                                                title="Box"
                                            >
                                                <Box className="w-2.5 h-2.5" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onUpdateData(node.id, { previewObject: 'quad' }); }}
                                                className={`p-0.5 rounded hover:bg-white/10 ${node.data.previewObject === 'quad' ? 'text-blue-400' : 'text-gray-500'}`}
                                                title="Quad"
                                            >
                                                <Square className="w-2.5 h-2.5" />
                                            </button>
                                        </>
                                    )}
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
                                    previewObject={node.data.previewObject}
                                    rotation={node.data.previewRotation}
                                    onRotationChange={(newRot) => onUpdateData(node.id, { previewRotation: newRot })}
                                />
                            )}
                        </div>
                    </div>
                )}

                {!isNodeCollapsed && (
                    registryUi ? (
                        <NodeModuleUI
                            ui={registryUi}
                            node={node}
                            allConnections={allConnections}
                            onUpdateData={onUpdateData}
                        />
                    ) : null
                )}

                {/* Sockets - (Existing Code) */}
                <div className="flex justify-between gap-4">
                    <div className="flex flex-col gap-2 pt-1 w-full">
                        {getEffectiveSockets(node, node.inputs, 'input', allConnections, registrySocketRules)
                            .filter(socket => socket.visible)
                            .map((socket) => {
                                const hideUnconnected = registrySocketRules?.collapse?.hideUnconnectedSockets ?? true;
                                if (isNodeCollapsed && hideUnconnected) {
                                    const isConnected = allConnections.some(c => c.targetNodeId === node.id && c.targetSocketId === socket.id);
                                    if (!isConnected) return null;
                                }

                                return (
                                    <div key={socket.id} className={`flex flex-col gap-1 min-h-[20px] relative justify-center ${socket.enabled ? '' : 'opacity-50'}`}>
                                        <div className="flex items-center justify-between w-full">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    id={`socket-${node.id}-${socket.id}-in`}
                                                    className={`relative flex items-center justify-center w-6 h-6 -ml-3 group ${socket.enabled ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        if (!socket.enabled) return;
                                                        onSocketMouseDown(e, node.id, socket.id, true, socket.type);
                                                    }}
                                                    onMouseUp={(e) => {
                                                        e.stopPropagation();
                                                        if (!socket.enabled) return;
                                                        onSocketMouseUp(e, node.id, socket.id, true, socket.type);
                                                    }}
                                                >
                                                    <div className={`w-3 h-3 rounded-full border border-[#111] ${getSocketColor(socket.type)} ${socket.enabled ? 'group-hover:scale-125' : ''} transition-transform z-10 shadow-sm`} />
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
                        {getEffectiveSockets(node, node.outputs, 'output', allConnections, registrySocketRules)
                            .filter(socket => socket.visible)
                            .map((socket) => {
                                const hideUnconnected = registrySocketRules?.collapse?.hideUnconnectedSockets ?? true;
                                if (isNodeCollapsed && hideUnconnected) {
                                    const isConnected = allConnections.some(c => c.sourceNodeId === node.id && c.sourceSocketId === socket.id);
                                    if (!isConnected) return null;
                                }

                                return (
                                    <div key={socket.id} className={`flex items-center gap-2 min-h-[20px] relative justify-end ${socket.enabled ? '' : 'opacity-50'}`}>
                                        <span className="text-[10px] text-gray-400 font-medium pointer-events-none">{socket.label}</span>
                                        <div
                                            id={`socket-${node.id}-${socket.id}-out`}
                                            className={`relative flex items-center justify-center w-6 h-6 -mr-3 group ${socket.enabled ? 'cursor-crosshair' : 'cursor-not-allowed'}`}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                if (!socket.enabled) return;
                                                onSocketMouseDown(e, node.id, socket.id, false, socket.type);
                                            }}
                                            onMouseUp={(e) => {
                                                e.stopPropagation();
                                                if (!socket.enabled) return;
                                                onSocketMouseUp(e, node.id, socket.id, false, socket.type);
                                            }}
                                        >
                                            <div className={`w-3 h-3 rounded-full border border-[#111] ${getSocketColor(socket.type)} ${socket.enabled ? 'group-hover:scale-125' : ''} transition-transform z-10 shadow-sm`} />
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            </div>
        </div >
    );
};
