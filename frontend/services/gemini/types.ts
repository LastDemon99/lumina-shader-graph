import type { Dispatch, SetStateAction } from 'react';

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatContextItem = { role: ChatRole; content: string };

import type { SessionAsset, GenerationPhase } from '../../types';
export type { SessionAsset, GenerationPhase };

export type ApplyTextureChannel = 'rgba' | 'rgb' | 'r' | 'g' | 'b' | 'a';
export type ApplyTextureOperation = 'multiply' | 'replace';

export type ApplyTextureTarget = {
  targetNodeId: string;
  targetSocketId: string;
  operation: ApplyTextureOperation;
  channel: ApplyTextureChannel;
};

export type ReactDispatch<T> = Dispatch<SetStateAction<T>>;
