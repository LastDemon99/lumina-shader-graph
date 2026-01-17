import type { NodeModule } from '../types';

export const contrastNode: NodeModule = {
  type: 'contrast',
  definition: {
    type: 'contrast',
    label: 'Contrast',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' },
      { id: 'contrast', label: 'Contrast', type: 'float' },
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
      const i = ctx.getInput(ctx.id, 'in', 'vec3(0.0)', 'vec3');
      const c = ctx.getInput(ctx.id, 'contrast', '1.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = (${i} - 0.5) * ${c} + 0.5;`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
