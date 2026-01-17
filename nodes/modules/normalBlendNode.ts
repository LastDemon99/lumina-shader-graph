import type { NodeModule } from '../types';

export const normalBlendNode: NodeModule = {
  type: 'normalBlend',
  definition: {
    type: 'normalBlend',
    label: 'Normal Blend',
    inputs: [
      { id: 'a', label: 'A', type: 'vec3' },
      { id: 'b', label: 'B', type: 'vec3' },
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
      const a = ctx.getInput(ctx.id, 'a', 'vec3(0.0, 0.0, 1.0)', 'vec3');
      const b = ctx.getInput(ctx.id, 'b', 'vec3(0.0, 0.0, 1.0)', 'vec3');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = normalize(vec3(${a}.xy + ${b}.xy, ${a}.z * ${b}.z));`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
