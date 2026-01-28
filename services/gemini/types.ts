import type { Dispatch, SetStateAction } from 'react';

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatContextItem = { role: ChatRole; content: string };

export type SessionAsset = {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  createdAt: number;
};

export type GenerationPhase = 'idle' | 'drafting' | 'linting' | 'refining';

export type ApplyTextureChannel = 'rgba' | 'rgb' | 'r' | 'g' | 'b' | 'a';
export type ApplyTextureOperation = 'multiply' | 'replace';

export type ApplyTextureTarget = {
  targetNodeId: string;
  targetSocketId: string;
  operation: ApplyTextureOperation;
  channel: ApplyTextureChannel;
};

export type ReactDispatch<T> = Dispatch<SetStateAction<T>>;
