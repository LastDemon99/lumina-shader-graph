import type { NodeModule, SocketType } from '../types';

export const saturateNode: NodeModule = {
  type: 'saturate',
  definition: {
    type: 'saturate',
    label: 'Saturate',
    inputs: [{ id: 'in', label: 'In', type: 'float' }],
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
      const type: SocketType = ctx.getDynamicType?.(['in']) ?? 'float';
      const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
      const one = type === 'float' ? '1.0' : `${type}(1.0)`;
      const i = ctx.getInput(ctx.id, 'in', zero, type);
      const v = ctx.varName(ctx.id);
      ctx.body.push(`${type} ${v} = clamp(${i}, ${zero}, ${one});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type };
      return true;
    },
  },
};
