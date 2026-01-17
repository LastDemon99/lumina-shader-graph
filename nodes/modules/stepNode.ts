import type { NodeModule, SocketType } from '../types';

export const stepNode: NodeModule = {
  type: 'step',
  definition: {
    type: 'step',
    label: 'Step',
    inputs: [
      { id: 'edge', label: 'Edge', type: 'float' },
      { id: 'in', label: 'In', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 'in', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const type: SocketType = ctx.getDynamicType?.(['edge', 'in']) ?? 'float';
      const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
      const edge = ctx.getInput(ctx.id, 'edge', zero, type);
      const i = ctx.getInput(ctx.id, 'in', zero, type);
      const v = ctx.varName(ctx.id);
      ctx.body.push(`${type} ${v} = step(${edge}, ${i});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type };
      return true;
    },
  },
};
