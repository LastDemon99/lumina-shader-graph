import type { NodeModule } from '../types';

export const arctangent2Node: NodeModule = {
  type: 'arctangent2',
  definition: {
    type: 'arctangent2',
    label: 'Arctangent2',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
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
    fallbackSocket: { input: 'a', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const a = ctx.getInput(ctx.id, 'a', '0.0', 'float');
      const b = ctx.getInput(ctx.id, 'b', '0.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = vec3(atan(${a}, ${b}));`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
