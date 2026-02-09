import type { NodeModule } from '../types';

export const previewNode: NodeModule = {
  type: 'preview',
  definition: {
    type: 'preview',
    label: 'Preview',
    // The Preview node is most commonly used to inspect color flow in the graph.
    // Typing this as `color` prevents the node preview from treating it as a data vector
    // and remapping it (which turns saturated colors like red into pink).
    inputs: [{ id: 'in', label: 'In', type: 'color' }],
    outputs: [{ id: 'out', label: 'Out', type: 'color' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const i = ctx.getInput(ctx.id, 'in', 'vec3(0.0)', 'color');
      const v = ctx.varName(ctx.id, 'rgb');
      ctx.body.push(`vec3 ${v} = ${i};`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'color' };
      ctx.variables[`${ctx.id}_rgb`] = { name: v, type: 'color' };
      return true;
    },
  },
};
