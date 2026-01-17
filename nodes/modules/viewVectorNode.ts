import type { NodeModule } from '../types';

export const viewVectorNode: NodeModule = {
  type: 'viewVector',
  definition: {
    type: 'viewVector',
    label: 'View Vector',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }],
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
      ctx.body.push(`vec3 ${v} = u_cameraPosition - vPosition;`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
