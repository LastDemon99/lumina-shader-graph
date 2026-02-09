import type { NodeModule } from '../types';

export const dotNode: NodeModule = {
  type: 'dot',
  definition: {
    type: 'dot',
    label: 'Dot Product',
    inputs: [
      { id: 'a', label: 'A', type: 'vec3' },
      { id: 'b', label: 'B', type: 'vec3' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 'a', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const a = ctx.getInput(ctx.id, 'a', 'vec3(0.0)', 'vec3');
      const b = ctx.getInput(ctx.id, 'b', 'vec3(0.0)', 'vec3');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`float ${v} = dot(${a}, ${b});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
