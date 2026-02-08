import type { ShaderNode, Connection } from '../../../types';
import type { ReactDispatch, SessionAsset, GenerationPhase, ChatContextItem, ApplyTextureOperation, ApplyTextureChannel } from '../types';

export type CommandContext = {
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
