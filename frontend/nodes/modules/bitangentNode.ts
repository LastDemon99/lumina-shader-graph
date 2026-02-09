import type { NodeModule } from '../types';

export const bitangentNode: NodeModule = {
  type: 'bitangent',
  definition: {
    type: 'bitangent',
    label: 'Bitangent Vector',
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
        ctx.body.push(`vec3 ${v}_n = normalize(mat3(u_model) * normal);`);
        ctx.body.push(`vec3 ${v}_t = normalize(mat3(u_model) * tangent.xyz);`);
        ctx.body.push(`vec3 ${v} = normalize(cross(${v}_n, ${v}_t) * tangent.w);`);
      } else {
        ctx.body.push(`vec3 ${v} = normalize(vBitangent);`);
      }
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
