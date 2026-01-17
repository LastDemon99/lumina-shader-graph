import type { NodeModule } from '../types';

export const posterizeNode: NodeModule = {
  type: 'posterize',
  definition: {
    type: 'posterize',
    label: 'Posterize',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' },
      { id: 'steps', label: 'Steps', type: 'float' },
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
      const steps = ctx.getInput(ctx.id, 'steps', '4.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = floor(${i} * ${steps}) / (${steps});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
