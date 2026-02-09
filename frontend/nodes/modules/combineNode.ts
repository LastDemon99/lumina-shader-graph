import type { NodeModule } from '../types';

export const combineNode: NodeModule = {
  type: 'combine',
  definition: {
    type: 'combine',
    label: 'Combine',
    inputs: [
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 'r', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const r = ctx.getInput(ctx.id, 'r', '0.0', 'float');
      const g = ctx.getInput(ctx.id, 'g', '0.0', 'float');
      const b = ctx.getInput(ctx.id, 'b', '0.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = vec3(${r}, ${g}, ${b});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
