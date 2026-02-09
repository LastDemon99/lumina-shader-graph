import type { NodeModule } from '../types';

export const tangentNode: NodeModule = {
  type: 'tangent',
  definition: {
    type: 'tangent',
    label: 'Tangent Vector',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'space',
            label: 'Space',
            controlType: 'select',
            bind: { scope: 'data', key: 'space' },
            select: {
              options: [
                { label: 'World', value: 'World' },
                { label: 'Object', value: 'Object' },
                { label: 'View', value: 'View' },
                { label: 'Tangent', value: 'Tangent' },
              ],
            },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    space: 'World',
  }),
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);
      if (ctx.mode === 'vertex') {
        ctx.body.push(`vec3 ${v} = normalize(mat3(u_model) * tangent.xyz);`);
      } else {
        ctx.body.push(`vec3 ${v} = normalize(vTangent);`);
      }
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
