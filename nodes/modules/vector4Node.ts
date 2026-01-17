import type { NodeModule } from '../types';

export const vector4Node: NodeModule = {
  type: 'vector4',
  definition: {
    type: 'vector4',
    label: 'Vector 4',
    inputs: [
      { id: 'x', label: 'X', type: 'float' },
      { id: 'y', label: 'Y', type: 'float' },
      { id: 'z', label: 'Z', type: 'float' },
      { id: 'w', label: 'W', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec4' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);
      const x = ctx.getInput(ctx.id, 'x', '0.0', 'float');
      const y = ctx.getInput(ctx.id, 'y', '0.0', 'float');
      const z = ctx.getInput(ctx.id, 'z', '0.0', 'float');
      const w = ctx.getInput(ctx.id, 'w', '0.0', 'float');
      ctx.body.push(`vec4 ${v} = vec4(${x}, ${y}, ${z}, ${w});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
      return true;
    },
  },
};
