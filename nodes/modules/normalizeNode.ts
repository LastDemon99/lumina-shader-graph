import type { NodeModule } from '../types';

export const normalizeNode: NodeModule = {
  type: 'normalize',
  definition: {
    type: 'normalize',
    label: 'Normalize',
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
      const i = ctx.getInput(ctx.id, 'in', 'vec3(0.0)', 'vec3');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = normalize(${i});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
