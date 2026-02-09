import type { NodeModule } from '../types';

export const mixNode: NodeModule = {
  type: 'mix',
  definition: {
    type: 'mix',
    label: 'Mix',
    inputs: [
      { id: 'a', label: 'A', type: 'vec3' },
      { id: 'b', label: 'B', type: 'vec3' },
      { id: 't', label: 'T', type: 'vec3' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const a = ctx.getInput(ctx.id, 'a', 'vec3(0.0)', 'vec3');
      const b = ctx.getInput(ctx.id, 'b', 'vec3(1.0)', 'vec3');
      const t = ctx.getInput(ctx.id, 't', 'vec3(0.5)', 'vec3');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = mix(${a}, ${b}, ${t});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
