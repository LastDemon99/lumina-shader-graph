import React, { useState, useEffect } from 'react';
import { ShaderNode, SocketDef, SocketType } from '../types';
import { Save, X, Code2, Plus, Trash2, Info } from 'lucide-react';

interface CodeEditorProps {
    node: ShaderNode | null;
    onSave: (nodeId: string, data: { code: string, functionName: string, inputs: SocketDef[], outputs: SocketDef[] }) => void;
    onClose: () => void;
}

const SOCKET_TYPES: SocketType[] = ['float', 'vec2', 'vec3', 'vec4', 'color', 'texture', 'samplerState', 'gradient'];

export const CodeEditor: React.FC<CodeEditorProps> = ({ node, onSave, onClose }) => {
    const [code, setCode] = useState('');
    const [inputs, setInputs] = useState<SocketDef[]>([]);
    const [outputs, setOutputs] = useState<SocketDef[]>([]);

    // CRITICAL: Only reset state when switching to a DIFFERENT node id
    useEffect(() => {
        if (node) {
            setCode(node.data.code || '');
            setInputs(node.inputs || []);
            setOutputs(node.outputs || []);
        }
    }, [node?.id]);

    if (!node) return null;

    const addInput = () => {
        const id = `in${inputs.length + 1}`;
        setInputs([...inputs, { id, label: id, type: 'float' }]);
    };

    const addOutput = () => {
        const id = `out${outputs.length + 1}`;
        setOutputs([...outputs, { id, label: id, type: 'float' }]);
    };

    const removeInput = (index: number) => {
        setInputs(inputs.filter((_, i) => i !== index));
    };

    const removeOutput = (index: number) => {
        setOutputs(outputs.filter((_, i) => i !== index));
    };

    const updateSocket = (isInput: boolean, index: number, field: keyof SocketDef, value: string) => {
        const list = isInput ? [...inputs] : [...outputs];
        list[index] = { ...list[index], [field]: value };
        if (isInput) setInputs(list);
        else setOutputs(list);
    };

    // NOTE: In this shader-graph, sockets typed as 'texture' do not behave like a GLSL sampler variable.
    // They represent an already-sampled color in most node previews (vec4), because GLSL ES 1.0 can't
    // pass sampler2D values around nor use out sampler2D parameters.
    const glslParamType = (t: string) => {
        if (t === 'texture' || t === 'textureArray') return 'vec4';
        if (t === 'color') return 'vec3';
        return t;
    };

    return (
        <div className="flex-1 flex flex-col bg-[#0d0d0d] animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="h-12 border-b border-gray-800 flex items-center justify-between px-6 bg-[#141414]">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-blue-500/10 rounded">
                        <Code2 className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">Node Script Editor</span>
                        <span className="text-[10px] text-gray-500 font-mono">NODE_UID: {node.id}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onSave(node.id, { code, functionName: 'main', inputs, outputs })}
                        className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded shadow-lg shadow-blue-500/20 text-xs font-bold transition-all active:scale-95"
                    >
                        <Save className="w-3.5 h-3.5" /> Save Changes
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/5 rounded text-gray-500 hover:text-gray-300 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Editor Area (full width after removing left panel) */}
                <div className="flex-1 relative bg-[#050505]">
                    <textarea
                        className="absolute inset-0 w-full h-full bg-transparent text-gray-300 font-mono text-sm p-8 outline-none resize-none focus:ring-0 scrollbar-thin overflow-y-auto leading-relaxed"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        spellCheck={false}
                        autoFocus
                        placeholder="// Escribe tu GLSL aquí siguiendo la convención main..."
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="h-10 border-t border-gray-800 flex items-center px-6 bg-[#0a0a0a] text-[10px] text-gray-500 gap-6">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>Namespace Isolation Active</span>
                </div>
                <span className="text-gray-700">|</span>
                <div className="flex gap-4 italic text-gray-600">
                    <span>El compilador mapeará automáticamente `void main` a un ID único para evitar colisiones.</span>
                </div>
            </div>
        </div>
    );
};
