import type { NodeModule, SocketType } from '../types';

export const negateNode: NodeModule = {
  type: 'negate',
  definition: {
    type: 'negate',
    label: 'Negate',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }],
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
      const type: SocketType = ctx.getDynamicType?.(['in']) ?? 'vec3';
      const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
      const i = ctx.getInput(ctx.id, 'in', zero, type);
      const v = ctx.varName(ctx.id);
      ctx.body.push(`${type} ${v} = -${i};`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type };
      return true;
    },
  },
};
