import type { NodeModule } from '../types';

export const clampNode: NodeModule = {
  type: 'clamp',
  definition: {
    type: 'clamp',
    label: 'Clamp',
    inputs: [
      { id: 'in', label: 'In', type: 'float' },
      { id: 'min', label: 'Min', type: 'float' },
      { id: 'max', label: 'Max', type: 'float' },
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
      const i = ctx.getInput(ctx.id, 'in', '0.0', 'float');
      const minVal = ctx.getInput(ctx.id, 'min', '0.0', 'float');
      const maxVal = ctx.getInput(ctx.id, 'max', '1.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = vec3(clamp(${i}, ${minVal}, ${maxVal}));`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
