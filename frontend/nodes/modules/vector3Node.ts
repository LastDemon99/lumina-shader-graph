import type { NodeModule } from '../types';

export const vector3Node: NodeModule = {
  type: 'vector3',
  definition: {
    type: 'vector3',
    label: 'Vector 3',
    inputs: [
      { id: 'x', label: 'X', type: 'float' },
      { id: 'y', label: 'Y', type: 'float' },
      { id: 'z', label: 'Z', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);
      const x = ctx.getInput(ctx.id, 'x', '0.0', 'float');
      const y = ctx.getInput(ctx.id, 'y', '0.0', 'float');
      const z = ctx.getInput(ctx.id, 'z', '0.0', 'float');
      ctx.body.push(`vec3 ${v} = vec3(${x}, ${y}, ${z});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
