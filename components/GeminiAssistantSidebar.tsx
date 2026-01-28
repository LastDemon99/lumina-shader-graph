import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Mic, X, ChevronLeft, ChevronRight, Sparkles, Image as ImageIcon, Loader2, Play } from 'lucide-react';

export interface SessionAsset {
    id: string;
    name: string;
    dataUrl: string;
    mimeType: string;
    createdAt: number;
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    attachment?: string; // Base64
    debug?: {
        thoughts: string[];
        logs: string[];
    };
}

interface GeminiAssistantSidebarProps {
    onGenerate: (
        prompt: string,
        attachment?: string,
        chatContext?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
        selectedAssetId?: string
    ) => void;
    generationPhase: 'idle' | 'drafting' | 'linting' | 'refining';
    logs: string[];

    assets: SessionAsset[];
    onAddAsset: (dataUrl: string, suggestedName?: string) => void;
    onUseAssetAsTextureNode: (assetId: string) => void;
}

export const GeminiAssistantSidebar: React.FC<GeminiAssistantSidebarProps> = ({
    onGenerate,
    generationPhase,
    logs,
    assets,
    onAddAsset,
    onUseAssetAsTextureNode,
}) => {
    const phaseLabel =
        generationPhase === 'drafting'
            ? 'Analyzing Request & Planning...'
            : generationPhase === 'linting'
                ? 'Validating Graph Structure...'
                : generationPhase === 'refining'
                    ? 'Refining & Polishing...'
                    : '';

    const [collapsed, setCollapsed] = useState(false);
    const [activePanel, setActivePanel] = useState<'chat' | 'assets'>('chat');
    const [prompt, setPrompt] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: 'Hello! I am your AI Shader Architect powered by Gemini 3. Describe an effect, ask questions, or attach a reference image to get started.'
        }
    ]);

    // Capture logs/thoughts per run and persist them into chat history when the run finishes.
    const prevPhaseRef = useRef<GeminiAssistantSidebarProps['generationPhase']>('idle');
    const lastLogLenRef = useRef<number>(0);
    const runTranscriptRef = useRef<string[]>([]);

    useEffect(() => {
        const prev = prevPhaseRef.current;

        // Start of run
        if (prev === 'idle' && generationPhase !== 'idle') {
            runTranscriptRef.current = [];
            lastLogLenRef.current = 0;
        }

        // During run: append new lines (logs resets at the start; handle shrink)
        if (generationPhase !== 'idle') {
            if (logs.length < lastLogLenRef.current) {
                lastLogLenRef.current = 0;
            }
            const start = lastLogLenRef.current;
            const delta = logs.slice(start);
            if (delta.length > 0) {
                runTranscriptRef.current.push(...delta);
            }
            lastLogLenRef.current = logs.length;
        }

        // End of run: persist transcript into history
        if (prev !== 'idle' && generationPhase === 'idle') {
            const transcript = runTranscriptRef.current.length > 0 ? runTranscriptRef.current : logs;
            const thoughts = transcript.filter(l => String(l).startsWith('THOUGHT:'));
            const normalLogs = transcript.filter(l => !String(l).startsWith('THOUGHT:'));

            setMessages(prevMsgs => [
                ...prevMsgs,
                {
                    id: `run-${Date.now()}`,
                    role: 'assistant',
                    content: 'Done. Graph updated. Open Debug to inspect logs/thoughts.',
                    debug: { thoughts, logs: normalLogs },
                }
            ]);

            runTranscriptRef.current = [];
            lastLogLenRef.current = logs.length;
        }

        prevPhaseRef.current = generationPhase;
    }, [generationPhase, logs]);

    const [attachment, setAttachment] = useState<string | null>(null);
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const promptInputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64data = reader.result as string;
                    setAttachment(base64data);
                };
                reader.readAsDataURL(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            recorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Failed to start recording:", err);
            alert("Could not access microphone.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handleSend = () => {
        let finalPrompt = prompt;
        let finalAttachment = attachment;

        // Auto-detect YouTube URLs in prompt if no attachment is present
        if (!finalAttachment && prompt.trim()) {
            const ytRegex = /(https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+|https?:\/\/youtu\.be\/[a-zA-Z0-9_-]+)/;
            const match = prompt.match(ytRegex);
            if (match) {
                finalAttachment = match[0];
                // Optional: remove URL from prompt? No, better keep it as context.
            }
        }

        if ((!finalPrompt.trim() && !finalAttachment) || generationPhase !== 'idle') return;

        const newMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: finalPrompt,
            attachment: finalAttachment || undefined
        };

        setMessages(prev => [...prev, newMessage]);

        const chatContext = [...messages, newMessage]
            .slice(-12)
            .map(m => ({ role: m.role, content: m.content }));

        onGenerate(finalPrompt, finalAttachment || undefined, chatContext, selectedAssetId || undefined);

        setPrompt('');
        setAttachment(null);
        setSelectedAssetId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (typeof evt.target?.result === 'string') {
                    setAttachment(evt.target.result);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const [isDragging, setIsDragging] = useState(false);

    const primeChatWithAssetCommand = (asset: SessionAsset, commandPrefix: string) => {
        setAttachment(asset.dataUrl);
        setPrompt(commandPrefix);
        setSelectedAssetId(asset.id);
        setCollapsed(false);
        setActivePanel('chat');

        // Focus after panel switch renders
        setTimeout(() => {
            promptInputRef.current?.focus();
            const el = promptInputRef.current;
            if (el) {
                const len = el.value.length;
                el.setSelectionRange(len, len);
            }
        }, 0);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (file && (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/'))) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (typeof evt.target?.result === 'string') {
                    setAttachment(evt.target.result);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const addCurrentAttachmentAsAsset = () => {
        if (!attachment) return;
        if (!attachment.startsWith('data:image/')) {
            alert('Only image attachments can be saved as texture assets.');
            return;
        }
        onAddAsset(attachment);
        setAttachment(null);
        setCollapsed(false);
        setActivePanel('assets');
    };

    if (collapsed) {
        return (
            <div className="w-12 h-full bg-[#1e1e1e] border-r border-gray-800 flex flex-col items-center py-4 z-40 shrink-0 transition-all duration-300">
                <button
                    onClick={() => { setCollapsed(false); setActivePanel('chat'); }}
                    className="p-2 bg-indigo-600 rounded-lg text-white hover:bg-indigo-500 shadow-lg mb-4"
                    title="Open AI Assistant"
                >
                    <Sparkles className="w-5 h-5" />
                </button>

                <button
                    onClick={() => { setCollapsed(false); setActivePanel('assets'); }}
                    className="p-2 bg-gray-800 rounded-lg text-gray-200 hover:bg-gray-700 shadow mb-4"
                    title="Open Asset Library"
                >
                    <ImageIcon className="w-5 h-5" />
                </button>

                <div className="flex-1 w-[1px] bg-gray-800" />
            </div>
        );
    }

    return (
        <div className="w-[350px] h-full bg-[#1e1e1e] border-r border-gray-700 flex flex-col z-40 shrink-0 shadow-2xl transition-all duration-300 flex flex-col">
            {/* Header */}
            <div className="h-14 border-b border-gray-700 flex items-center justify-between px-4 bg-[#181818]">
                <div className="flex items-center gap-2 text-white font-semibold">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <span>AI Architect</span>
                    <span className="text-[10px] bg-indigo-900/50 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-700">Gemini 3</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActivePanel('chat')}
                        className={`text-xs px-2 py-1 rounded border ${activePanel === 'chat' ? 'border-indigo-600 bg-indigo-600/20 text-indigo-200' : 'border-gray-700 text-gray-300 hover:bg-gray-800'}`}
                        title="Chat"
                    >
                        Chat
                    </button>
                    <button
                        onClick={() => setActivePanel('assets')}
                        className={`text-xs px-2 py-1 rounded border ${activePanel === 'assets' ? 'border-indigo-600 bg-indigo-600/20 text-indigo-200' : 'border-gray-700 text-gray-300 hover:bg-gray-800'}`}
                        title="Asset Library"
                    >
                        Library
                    </button>
                    <button onClick={() => setCollapsed(true)} className="text-gray-400 hover:text-white" title="Collapse">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {activePanel === 'assets' ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-700">
                    <div className="text-xs text-gray-300 border border-gray-700 rounded-lg p-3 bg-[#141414]">
                        <div className="font-semibold text-gray-100 mb-1">Session Asset Library</div>
                        <div className="text-gray-400">
                            Assets are reusable texture sources saved for this session. Chat attachments are treated as reference by default.
                        </div>
                        <div className="mt-2 flex gap-2 flex-wrap">
                            <label className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-200 hover:bg-gray-800 cursor-pointer">
                                Upload Image
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        const reader = new FileReader();
                                        reader.onload = (evt) => {
                                            const res = evt.target?.result;
                                            if (typeof res === 'string') {
                                                onAddAsset(res, f.name);
                                            }
                                        };
                                        reader.readAsDataURL(f);
                                    }}
                                />
                            </label>

                            {attachment?.startsWith('data:image/') && (
                                <button
                                    onClick={addCurrentAttachmentAsAsset}
                                    className="text-xs px-2 py-1 rounded border border-indigo-700 bg-indigo-700/20 text-indigo-200 hover:bg-indigo-700/30"
                                    title="Save current chat attachment as an asset"
                                >
                                    Save Attached Image
                                </button>
                            )}
                        </div>
                    </div>

                    {assets.length === 0 ? (
                        <div className="text-sm text-gray-500">No assets yet. Use Upload Image or /addasset &lt;instructions&gt; with an attached image.</div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {assets.slice().sort((a, b) => b.createdAt - a.createdAt).map(a => (
                                <div key={a.id} className="border border-gray-700 rounded-lg overflow-hidden bg-[#111]">
                                    <div className="aspect-square bg-black">
                                        {a.dataUrl.startsWith('data:image/') ? (
                                            <img src={a.dataUrl} alt={a.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">Unsupported</div>
                                        )}
                                    </div>
                                    <div className="p-2">
                                        <div className="text-xs text-gray-100 font-semibold truncate" title={a.name}>{a.name}</div>
                                        <div className="text-[10px] text-gray-500 truncate" title={a.mimeType}>{a.mimeType}</div>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <button
                                                className="w-full text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white"
                                                onClick={() => primeChatWithAssetCommand(a, `/useasset `)}
                                                title="Attach this asset and prep /useasset to apply it to the graph"
                                            >
                                                Use
                                            </button>
                                            <button
                                                className="w-full text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-100 border border-gray-700"
                                                onClick={() => primeChatWithAssetCommand(a, `/editasset `)}
                                                title="Attach this asset and prep /editasset to edit it"
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <>
            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-700">
                {messages.map(msg => (
                    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[90%] rounded-xl p-3 text-xs md:text-sm ${msg.role === 'user'
                            ? 'bg-indigo-600 text-white rounded-br-none'
                            : 'bg-[#2a2a2a] text-gray-200 border border-gray-700 rounded-bl-none'
                            }`}>
                            {msg.attachment && (
                                <div className="mb-2 relative rounded overflow-hidden border border-white/20 bg-black/40 p-1">
                                    {msg.attachment.startsWith('data:image/') ? (
                                        <img src={msg.attachment} alt="Attachment" className="max-w-full h-auto max-h-32 object-cover" />
                                    ) : msg.attachment.startsWith('data:video/') ? (
                                        <video src={msg.attachment} controls className="max-w-full h-auto max-h-32" />
                                    ) : msg.attachment.startsWith('data:audio/') ? (
                                        <audio src={msg.attachment} controls className="w-full h-8" />
                                    ) : msg.attachment.startsWith('http') ? (
                                        <div className="flex items-center gap-2 p-2 overflow-hidden bg-red-900/20">
                                            <Play className="w-4 h-4 text-red-500 shrink-0" />
                                            <span className="truncate text-[10px] text-gray-300 font-mono">{msg.attachment}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 p-2 overflow-hidden">
                                            <Paperclip className="w-4 h-4 text-indigo-400 shrink-0" />
                                            <span className="truncate text-[10px] text-gray-400">{msg.attachment.split(';')[0]}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="whitespace-pre-wrap">{msg.content}</div>

                            {msg.debug && (
                                <details className="mt-3 border-t border-gray-700 pt-2">
                                    <summary className="cursor-pointer select-none text-[11px] text-indigo-300 hover:text-indigo-200">
                                        Debug (Thoughts: {msg.debug.thoughts.length}, Logs: {msg.debug.logs.length})
                                    </summary>

                                    {msg.debug.thoughts.length > 0 && (
                                        <details className="mt-2">
                                            <summary className="cursor-pointer select-none text-[11px] text-gray-300 hover:text-white">
                                                Thoughts
                                            </summary>
                                            <div className="mt-2 max-h-40 overflow-y-auto rounded border border-gray-700 bg-black/20 p-2 font-mono text-[10px] text-gray-200 whitespace-pre-wrap break-words">
                                                {msg.debug.thoughts.map((t, i) => (
                                                    <div key={i} className="py-0.5">{t}</div>
                                                ))}
                                            </div>
                                        </details>
                                    )}

                                    <details className="mt-2" open={msg.debug.thoughts.length === 0}>
                                        <summary className="cursor-pointer select-none text-[11px] text-gray-300 hover:text-white">
                                            Logs
                                        </summary>
                                        <div className="mt-2 max-h-40 overflow-y-auto rounded border border-gray-700 bg-black/20 p-2 font-mono text-[10px] text-gray-300 whitespace-pre-wrap break-words">
                                            {msg.debug.logs.length > 0
                                                ? msg.debug.logs.map((l, i) => (
                                                    <div key={i} className="py-0.5">{l}</div>
                                                ))
                                                : <div className="opacity-60 italic">No logs captured.</div>
                                            }
                                        </div>
                                    </details>
                                </details>
                            )}
                        </div>
                        {msg.role === 'assistant' && (
                            <span className="text-[10px] text-gray-600 mt-1 ml-1">AI Assistant</span>
                        )}
                    </div>
                ))}

                {generationPhase !== 'idle' && (
                    <div className="flex flex-col items-start animate-pulse">
                        <div className="bg-[#2a2a2a] text-gray-200 border border-gray-700 rounded-xl rounded-bl-none p-3 text-xs w-[90%]">
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                                <span>{phaseLabel}</span>
                            </div>

                            <details className="mt-2 border-t border-gray-700 pt-2">
                                <summary className="cursor-pointer select-none text-[11px] text-indigo-300 hover:text-indigo-200">
                                    Live Debug
                                </summary>

                                {logs.filter(l => String(l).startsWith('THOUGHT:')).length > 0 && (
                                    <details className="mt-2">
                                        <summary className="cursor-pointer select-none text-[11px] text-gray-300 hover:text-white">
                                            Thoughts
                                        </summary>
                                        <div className="mt-2 max-h-32 overflow-y-auto rounded border border-gray-700 bg-black/20 p-2 font-mono text-[10px] text-gray-200 whitespace-pre-wrap break-words">
                                            {logs.filter(l => String(l).startsWith('THOUGHT:')).map((t, i) => (
                                                <div key={i} className="py-0.5">{t}</div>
                                            ))}
                                        </div>
                                    </details>
                                )}

                                <details className="mt-2" open>
                                    <summary className="cursor-pointer select-none text-[11px] text-gray-300 hover:text-white">
                                        Logs
                                    </summary>
                                    <div className="mt-2 max-h-32 overflow-y-auto rounded border border-gray-700 bg-black/20 p-2 font-mono text-[10px] text-gray-300 whitespace-pre-wrap break-words">
                                        {logs.length > 0
                                            ? logs.map((log, i) => <div key={i} className="py-0.5">{log}</div>)
                                            : <div className="opacity-60 italic">Initializing pipeline...</div>
                                        }
                                    </div>
                                </details>
                            </details>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-gray-700 bg-[#181818]">
                <div
                    className={`relative rounded-lg border ${isDragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 bg-black/20'}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {attachment && (
                        <div className="p-2 border-b border-gray-700 flex items-center gap-2">
                            {attachment.startsWith('data:image/') ? (
                                <ImageIcon className="w-4 h-4 text-indigo-300" />
                            ) : attachment.startsWith('data:video/') ? (
                                <Play className="w-4 h-4 text-pink-400" />
                            ) : attachment.startsWith('data:audio/') ? (
                                <Mic className="w-4 h-4 text-emerald-400" />
                            ) : attachment.startsWith('http') ? (
                                <Play className="w-4 h-4 text-red-500" />
                            ) : (
                                <Paperclip className="w-4 h-4 text-blue-300" />
                            )}
                            <span className="text-xs text-gray-200 truncate flex-1">
                                {attachment.startsWith('data:audio/') ? 'Voice recording attached' :
                                    attachment.startsWith('http') ? 'YouTube Link detected' : 'File attached'}
                            </span>
                            <button
                                onClick={() => { setAttachment(null); setSelectedAssetId(null); }}
                                className="p-1 rounded hover:bg-white/10"
                                title="Remove attachment"
                                disabled={generationPhase !== 'idle'}
                            >
                                <X className="w-4 h-4 text-gray-300" />
                            </button>
                        </div>
                    )}

                    <textarea
                        ref={promptInputRef}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Describe the shader you want…"
                        rows={3}
                        className="w-full resize-none bg-transparent text-gray-200 text-sm p-2 pr-32 outline-none"
                    />

                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept="image/*,video/*,audio/*"
                    />

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={generationPhase !== 'idle'}
                        className="absolute bottom-2 right-20 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors disabled:opacity-50"
                        title="Attach file"
                    >
                        <Paperclip className="w-4 h-4" />
                    </button>

                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={generationPhase !== 'idle'}
                        className={`absolute bottom-2 right-11 p-2 rounded-lg transition-all ${isRecording
                            ? 'bg-red-600 text-white animate-pulse'
                            : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                            } disabled:opacity-50`}
                        title={isRecording ? "Stop recording" : "Record voice"}
                    >
                        <Mic className="w-4 h-4" />
                    </button>

                    <button
                        onClick={handleSend}
                        disabled={(!prompt.trim() && !attachment) || generationPhase !== 'idle'}
                        className={`absolute bottom-2 right-2 p-2 rounded-lg transition-all ${((prompt.trim() || attachment) && generationPhase === 'idle')
                            ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg'
                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            }`}
                        title="Send"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
                </>
            )}
        </div>
    );
};
