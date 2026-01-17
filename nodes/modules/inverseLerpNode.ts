import type { NodeModule } from '../types';

export const inverseLerpNode: NodeModule = {
  type: 'inverseLerp',
  definition: {
    type: 'inverseLerp',
    label: 'Inverse Lerp',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 't', label: 'T', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 't', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const a = ctx.getInput(ctx.id, 'a', '0.0', 'float');
      const b = ctx.getInput(ctx.id, 'b', '1.0', 'float');
      const t = ctx.getInput(ctx.id, 't', '0.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = vec3(clamp((${t} - ${a}) / (${b} - ${a} + 0.00001), 0.0, 1.0));`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
