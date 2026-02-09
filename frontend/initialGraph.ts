import { Connection, ShaderNode } from './types';
import { getNodeModule } from './nodes';

const placeholderDefinition = (type: string) => ({
  type,
  label: type,
  inputs: [],
  outputs: [],
});

const makeNode = (
  id: string,
  type: string,
  x: number,
  y: number,
  data: Record<string, any> = {},
): ShaderNode => {
  const mod = getNodeModule(type);
  const def = mod?.definition ?? placeholderDefinition(type);

  const initialData = mod?.initialData ? (mod.initialData(id) as any) : {};

  return {
    id,
    ...def,
    x,
    y,
    data: {
      ...initialData,
      ...data,
    },
  };
};

export const INITIAL_NODES: ShaderNode[] = [
  makeNode('vertex-node', 'vertex', 800, 150, { previewMode: '3d' }),
  makeNode('master-node', 'output', 800, 450, { previewMode: '3d' }),
  makeNode('color-1', 'color', 400, 400, { value: '#ff0055', previewMode: '3d' }),
  makeNode('uv-1', 'uv', 100, 400, { previewMode: '3d' }),
];

export const INITIAL_CONNECTIONS: Connection[] = [];
