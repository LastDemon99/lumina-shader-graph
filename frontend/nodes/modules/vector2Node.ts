import type { NodeModule } from '../types';

export const vector2Node: NodeModule = {
  type: 'vector2',
  definition: {
    type: 'vector2',
    label: 'Vector 2',
    inputs: [
      { id: 'x', label: 'X', type: 'float' },
      { id: 'y', label: 'Y', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec2' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);
      const x = ctx.getInput(ctx.id, 'x', '0.0', 'float');
      const y = ctx.getInput(ctx.id, 'y', '0.0', 'float');
      ctx.body.push(`vec2 ${v} = vec2(${x}, ${y});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec2' };
      return true;
    },
  },
};
