import React, { useState, useEffect } from 'react';
import { ShaderNode } from '../types';
import { Save, X, Code2 } from 'lucide-react';

interface CodeEditorProps {
    node: ShaderNode | null;
    onSave: (nodeId: string, code: string) => void;
    onClose: () => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ node, onSave, onClose }) => {
    const [code, setCode] = useState('');

    useEffect(() => {
        if (node) {
            setCode(node.data.code || '');
        }
    }, [node]);

    if (!node) return null;

    return (
        <div className="flex-1 flex flex-col bg-[#1e1e1e] border-l border-gray-800 animate-in slide-in-from-right duration-300">
            <div className="h-10 border-b border-gray-800 flex items-center justify-between px-4 bg-[#252525]">
                <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-semibold text-gray-200">Custom Function: {node.label}</span>
                    <span className="text-[10px] text-gray-500 font-mono">({node.id})</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onSave(node.id, code)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-medium transition-colors"
                    >
                        <Save className="w-3.5 h-3.5" /> Save Changes
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 px-2 hover:bg-white/10 rounded text-gray-400 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex-1 relative">
                <textarea
                    className="absolute inset-0 w-full h-full bg-transparent text-gray-300 font-mono text-sm p-4 outline-none resize-none focus:ring-0"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    spellCheck={false}
                    autoFocus
                />
            </div>

            <div className="h-8 border-t border-gray-800 flex items-center px-4 bg-[#1a1a1a] text-[10px] text-gray-500 gap-4">
                <span>GLSL Standard Library Available</span>
                <span>• Use provided input variables</span>
                <span>• Assign results to output variables</span>
            </div>
        </div>
    );
};
