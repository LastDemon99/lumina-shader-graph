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
    inferAssetRequest: (userPrompt: string, onLog?: (msg: string) => void) => Promise<{
      assetName: string;
      apply: boolean;
      applyPlan?: {
        target: { nodeId: string; socketId: string };
        operation: ApplyTextureOperation;
        channel: ApplyTextureChannel;
      };
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
  runGeminiPipeline: (prompt: string, attachment?: string) => Promise<void>;
};

export type CommandInvocation = {
  prompt: string;
  attachment?: string;
  chatContext?: ChatContextItem[];
  selectedAssetId?: string;
};
