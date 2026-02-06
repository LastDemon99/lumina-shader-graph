import type { ShaderNode, Connection } from '../../../types';
import type { ReactDispatch, SessionAsset, GenerationPhase, ChatContextItem, ApplyTextureOperation, ApplyTextureChannel } from '../types';

export type CommandContext = {
  geminiService: {
    inferEditAssetTarget: (
      userPrompt: string,
      assets: Array<{ id: string; name: string }>,
      chatContext?: ChatContextItem[],
      onLog?: (msg: string) => void
    ) => Promise<{ assetId: string } | null>;
    inferLoadAssetIntent: (
      userPrompt: string,
      currentAssets?: SessionAsset[],
      attachment?: string,
      onLog?: (msg: string) => void
    ) => Promise<{
      action: 'save' | 'apply' | 'edit';
      method: 'graph' | 'ai';
      confidence: number;
      reasoning?: string;
    } | null>;
    inferTextureRequest: (userPrompt: string, onLog?: (msg: string) => void) => Promise<{
      imagePrompt: string;
      target: { nodeId: string; socketId: string };
      operation: ApplyTextureOperation;
      channel: ApplyTextureChannel;
    } | null>;
    editTextureDataUrl: (
      editPrompt: string,
      sourceImageDataUrl: string,
      onLog?: (msg: string) => void
    ) => Promise<{ dataUrl: string; mimeType: string; text?: string } | null>;
    askQuestion: (
      prompt: string,
      currentNodes?: ShaderNode[],
      currentConnections?: Connection[],
      attachedNodes?: Array<{ id: string; label: string; type: string }>,
      onLog?: (msg: string) => void
    ) => Promise<string | null>;
    inferGlobalIntent: (prompt: string, attachment?: string, onLog?: (msg: string) => void) => Promise<{ command: string; confidence: number } | null>;
  };

  nodes: ShaderNode[];
  connections: Connection[];
  sessionAssets: SessionAsset[];

  setNodes: ReactDispatch<ShaderNode[]>;
  setConnections: ReactDispatch<Connection[]>;
  setSessionAssets: ReactDispatch<SessionAsset[]>;
  setGenerationPhase: (phase: GenerationPhase) => void;
  setLinterLogs: ReactDispatch<string[]>;

  addSessionAsset: (dataUrl: string, suggestedName?: string) => void;

  applyTextureDataUrlToTarget: (opts: {
    dataUrl: string;
    mimeType: string;
    targetNodeId: string;
    targetSocketId: string;
    operation: ApplyTextureOperation;
    channel: ApplyTextureChannel;
    log?: (msg: string) => void;
  }) => void;

  runGeminiTexturePipeline: (texturePrompt: string, referenceAttachment?: string) => Promise<void>;
  runGeminiPipeline: (prompt: string, attachment?: string, selectedAssetId?: string) => Promise<void>;
  onAssistantResponse?: (text: string) => void;
};

export type CommandInvocation = {
  prompt: string;
  attachment?: string;
  chatContext?: ChatContextItem[];
  selectedAssetId?: string;
  focusText?: string;
  intentCommand?: string;
};
