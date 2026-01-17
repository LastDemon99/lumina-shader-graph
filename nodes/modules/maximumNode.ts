import type { NodeModule } from '../types';

export const maximumNode: NodeModule = {
  type: 'maximum',
  definition: {
    type: 'maximum',
    label: 'Maximum',
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
      ctx.body.push(`vec3 ${v} = vec3(max(${a}, ${b}));`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
