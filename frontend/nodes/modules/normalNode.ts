import type { NodeModule } from '../types';

export const normalNode: NodeModule = {
  type: 'normal',
  definition: {
    type: 'normal',
    label: 'Normal Vector',
    inputs: [],
    outputs: [{ id: 'out', label: 'XYZ', type: 'vec3' }],
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
      const space = (ctx.node.data.space || 'World') as string;
      const v = ctx.varName(ctx.id);
      if (ctx.mode === 'vertex') {
        if (space === 'Object') {
          ctx.body.push(`vec3 ${v} = normal;`);
        } else {
          ctx.body.push(`vec3 ${v} = normalize(mat3(u_model) * normal);`);
        }
      } else {
        if (space === 'Object') {
          ctx.body.push(`vec3 ${v} = normalize(vObjectNormal);`);
        } else if (space === 'View') {
          ctx.body.push(`vec3 ${v} = normalize(mat3(u_view) * vNormal);`);
        } else {
          ctx.body.push(`vec3 ${v} = normalize(vNormal);`);
        }
      }
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
