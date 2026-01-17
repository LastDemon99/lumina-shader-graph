import type { NodeModule } from './types';


type GlobModule = Record<string, unknown>;

const isNodeModule = (value: unknown): value is NodeModule => {
  if (!value || typeof value !== 'object') return false;
  const v = value as any;
  return typeof v.type === 'string' && v.definition && typeof v.definition.label === 'string';
};

const discovered = (): NodeModule[] => {
  const files = import.meta.glob('./modules/*.ts', { eager: true }) as Record<string, GlobModule>;
  const result: NodeModule[] = [];

  for (const mod of Object.values(files)) {
    for (const exp of Object.values(mod)) {
      if (isNodeModule(exp)) result.push(exp);
    }
  }

  return result;
};

export const NODE_REGISTRY: Record<string, NodeModule> = Object.fromEntries(
  discovered().map((m) => [m.type, m]),
);

export const getNodeModule = (type: string): NodeModule | undefined => {
  return NODE_REGISTRY[type];
};

export type NodeListCategory = {
  id: string;
  label: string;
  types: string[];
};

const getNodeLabel = (type: string): string => {
  return getNodeModule(type)?.definition.label ?? type;
};

export const ALL_NODE_TYPES: string[] = Array.from(new Set(Object.keys(NODE_REGISTRY)))
  .filter((t) => t !== 'output')
  .sort((a, b) => getNodeLabel(a).localeCompare(getNodeLabel(b)));

export const NODE_LIST: NodeListCategory[] = [
  {
    id: 'all',
    label: 'All',
    types: ALL_NODE_TYPES,
  },
];
