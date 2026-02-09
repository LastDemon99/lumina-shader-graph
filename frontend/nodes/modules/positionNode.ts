import type { NodeModule } from '../types';

export const positionNode: NodeModule = {
  type: 'position',
  definition: {
    type: 'position',
    label: 'Position',
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
                { label: 'Absolute World', value: 'Absolute World' },
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
      if (space === 'Object') {
        if (ctx.mode === 'vertex') {
          ctx.body.push(`vec3 ${v} = position;`);
        } else {
          ctx.body.push(`vec3 ${v} = vObjectPosition;`);
        }
      } else {
        if (ctx.mode === 'vertex') {
          ctx.body.push(`vec3 ${v} = (u_model * vec4(position, 1.0)).xyz;`);
        } else {
          ctx.body.push(`vec3 ${v} = vPosition;`);
        }
      }
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
