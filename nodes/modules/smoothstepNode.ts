import type { NodeModule, SocketType } from '../types';

export const smoothstepNode: NodeModule = {
  type: 'smoothstep',
  definition: {
    type: 'smoothstep',
    label: 'Smoothstep',
    inputs: [
      { id: 'e1', label: 'Edge1', type: 'float' },
      { id: 'e2', label: 'Edge2', type: 'float' },
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
      const type: SocketType = ctx.getDynamicType?.(['e1', 'e2', 'in']) ?? 'float';
      const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
      const one = type === 'float' ? '1.0' : `${type}(1.0)`;
      const e1 = ctx.getInput(ctx.id, 'e1', zero, type);
      const e2 = ctx.getInput(ctx.id, 'e2', one, type);
      const i = ctx.getInput(ctx.id, 'in', zero, type);
      const v = ctx.varName(ctx.id);
      ctx.body.push(`${type} ${v} = smoothstep(${e1}, ${e2}, ${i});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type };
      return true;
    },
  },
};
