import type { NodeModule } from '../types';

export const arctangentNode: NodeModule = {
  type: 'arctangent',
  definition: {
    type: 'arctangent',
    label: 'Arctangent',
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
      const i = ctx.getInput(ctx.id, 'in', '0.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = vec3(atan(${i}));`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
