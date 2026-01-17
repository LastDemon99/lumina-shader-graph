import type { Connection, ShaderNode, SocketDef, SocketType } from '../types';

export type SocketDirection = 'input' | 'output';

export type Condition =
  | { kind: 'always' }
  | { kind: 'not'; cond: Condition }
  | { kind: 'and'; conds: Condition[] }
  | { kind: 'or'; conds: Condition[] }
  | { kind: 'dataEquals'; key: string; value: unknown }
  | { kind: 'dataIn'; key: string; values: unknown[] }
  | { kind: 'connected'; socketId: string; direction: SocketDirection };

export type TypeExpr =
  | { kind: 'static'; type: SocketType }
  | { kind: 'swizzleMaskLength'; maskKey: string; defaultMask?: string };

export interface SocketRule {
  visibleWhen?: Condition;
  enabledWhen?: Condition;
  maxConnections?: number; // inputs only
  type?: SocketType | TypeExpr;
  label?: string;
  fallbackSocket?: boolean; // marks this socket as preferred fallback
}

export interface SocketRules {
  inputs?: Record<string, SocketRule>;
  outputs?: Record<string, SocketRule>;
  collapse?: {
    hideUnconnectedSockets?: boolean;
  };
  fallbackSocket?: {
    input?: string;
    output?: string;
  };
}

export type ControlType =
  | 'number'
  | 'toggle'
  | 'select'
  | 'color'
  | 'multiSelectMask'
  | 'range'
  | 'gradient'
  | 'texture'
  | 'textureArray';

export interface ControlSpec {
  id: string;
  label: string;
  controlType: ControlType;
  bind: {
    scope: 'data' | 'inputValues';
    key: string;
  };
  when?: Condition;
  number?: {
    step?: number;
    min?: number;
    max?: number;
  };
  range?: {
    minKey: string;
    maxKey: string;
    step?: number;
  };
  select?: {
    options: Array<{ label: string; value: string }>;
  };
  multiSelectMask?: {
    // e.g. xyzw or rgba
    options: Array<{ label: string; value: string }>;
    allowDuplicates?: boolean;
    minLength?: number;
    maxLength?: number;
    defaultValue?: string;
  };
  texture?: {
    variant: 'asset' | 'inline';
  };
}

export interface UiSectionSpec {
  id: string;
  title?: string;
  controls: ControlSpec[];
}

export interface NodeUiSpec {
  width?: 'normal' | 'wide';
  preview?: {
    enabled: boolean;
  };
  sections: UiSectionSpec[];
}

export type NodeDefinition = Omit<ShaderNode, 'id' | 'x' | 'y' | 'data'>;

export interface GeneratorContext {
  node: ShaderNode;
  nodes: ShaderNode[];
  connections: Connection[];
  mode: 'fragment' | 'vertex';
  // for future: helpers from glslGenerator can be injected here
}

export interface NodeGlslEmitContext {
  id: string;
  node: ShaderNode;
  nodes: ShaderNode[];
  connections: Connection[];
  mode: 'fragment' | 'vertex';
  body: string[];
  uniforms: Set<string>;
  functions: Set<string>;
  variables: Record<string, { name: string; type: SocketType }>; 
  getInput: (nodeId: string, socketId: string, defaultVal: string, expectedType: SocketType) => string;
  getDynamicType?: (inputSocketIds: string[]) => SocketType;
  getTextureUniformName?: (nodeId: string) => string;
  getTextureDimUniformName?: (nodeId: string) => string;
  varName: (nodeId: string, suffix?: string) => string;
  castTo: (varName: string, from: string, to: string) => string;
  toGLSL: (val: any, type: SocketType, mode?: 'fragment' | 'vertex') => string;
}

export type NodeGlslEmitter = (ctx: NodeGlslEmitContext) => boolean;

export interface NodeModule {
  type: string;
  definition: NodeDefinition;
  ui?: NodeUiSpec;
  socketRules?: SocketRules;
  initialData?: (nodeId: string) => Record<string, unknown>;
  glsl?: {
    emit?: NodeGlslEmitter;
  };
}

export interface EffectiveSocketDef extends SocketDef {
  visible: boolean;
  enabled: boolean;
  maxConnections?: number;
}
