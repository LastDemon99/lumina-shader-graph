import React, { useRef, useState, useEffect } from 'react';
import { ShaderNode, SocketDef, SocketType } from '../types';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-glsl';
import 'prismjs/themes/prism-tomorrow.css';

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
    const saveTimerRef = useRef<number | null>(null);

    // CRITICAL: Only reset state when switching to a DIFFERENT node id
    useEffect(() => {
        if (node) {
            setCode(node.data.code || '');
            setInputs(node.inputs || []);
            setOutputs(node.outputs || []);
        }
    }, [node?.id]);

    useEffect(() => {
        if (!node) return;
        if (saveTimerRef.current) {
            window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        saveTimerRef.current = window.setTimeout(() => {
            const functionName = node.data?.functionName || 'main';
            onSave(node.id, { code, functionName, inputs, outputs });
            saveTimerRef.current = null;
        }, 650);
        return () => {
            if (saveTimerRef.current) {
                window.clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        };
    }, [code, inputs, outputs, node?.id, node?.data?.functionName, onSave]);

    if (!node) return null;

    const highlightCode = (code: string) => {
        // Fallback to clike if glsl is not loaded for some reason
        const lang = Prism.languages.glsl || Prism.languages.clike || {};
        return Prism.highlight(code, lang, 'glsl');
    };

    return (
        <div className="flex-1 flex overflow-auto bg-[#050505] scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent animate-in fade-in duration-300">
            <div className="min-h-full w-full font-mono text-sm leading-relaxed relative">
                <Editor
                    value={code}
                    onValueChange={code => setCode(code)}
                    highlight={highlightCode}
                    padding={32}
                    style={{
                        fontFamily: '"Fira Code", "Fira Mono", "Cascadia Code", "Source Code Pro", monospace',
                        fontSize: 14,
                        minHeight: '100%',
                    }}
                    className="prism-editor"
                    textareaClassName="outline-none"
                    preClassName="pointer-events-none"
                />

                <style>{`
                    .prism-editor textarea {
                        background: transparent !important;
                        color: transparent !important;
                        caret-color: #fff !important;
                        z-index: 1 !important;
                    }
                    .prism-editor pre {
                        z-index: 0 !important;
                    }
                    /* Custom Prism Overrides for a more "Lumina" look */
                    .token.keyword { color: #818cf8; font-weight: bold; }
                    .token.function { color: #60a5fa; }
                    .token.number { color: #f472b6; }
                    .token.builtin { color: #fbbf24; }
                    .token.operator { color: #94a3b8; }
                    .token.comment { color: #4b5563; font-style: italic; }
                    .token.string { color: #34d399; }
                    .token.type { color: #fb7185; }
                `}</style>
            </div>
        </div>
    );
};
