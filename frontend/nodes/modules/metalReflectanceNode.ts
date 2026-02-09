import type { NodeModule } from '../types';

export const metalReflectanceNode: NodeModule = {
  type: 'metalReflectance',
  definition: {
    type: 'metalReflectance',
    label: 'Metal Reflectance',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'metalType',
            label: 'Metal',
            controlType: 'select',
            bind: { scope: 'data', key: 'metalType' },
            select: {
              options: [
                { label: 'Iron', value: 'Iron' },
                { label: 'Silver', value: 'Silver' },
                { label: 'Aluminium', value: 'Aluminium' },
                { label: 'Gold', value: 'Gold' },
                { label: 'Copper', value: 'Copper' },
                { label: 'Chromium', value: 'Chromium' },
                { label: 'Nickel', value: 'Nickel' },
                { label: 'Titanium', value: 'Titanium' },
                { label: 'Cobalt', value: 'Cobalt' },
                { label: 'Platinum', value: 'Platinum' },
              ],
            },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    metalType: 'Iron',
  }),
  glsl: {
    emit: ctx => {
      const metal = (ctx.node.data.metalType || 'Iron') as string;
      const v = ctx.varName(ctx.id);
      let val = 'vec3(0.56, 0.57, 0.58)';
      switch (metal) {
        case 'Iron':
          val = 'vec3(0.560, 0.570, 0.580)';
          break;
        case 'Silver':
          val = 'vec3(0.972, 0.960, 0.915)';
          break;
        case 'Aluminium':
          val = 'vec3(0.913, 0.922, 0.924)';
          break;
        case 'Gold':
          val = 'vec3(1.000, 0.766, 0.336)';
          break;
        case 'Copper':
          val = 'vec3(0.955, 0.638, 0.538)';
          break;
        case 'Chromium':
          val = 'vec3(0.549, 0.556, 0.554)';
          break;
        case 'Nickel':
          val = 'vec3(0.660, 0.609, 0.526)';
          break;
        case 'Titanium':
          val = 'vec3(0.542, 0.497, 0.449)';
          break;
        case 'Cobalt':
          val = 'vec3(0.662, 0.655, 0.634)';
          break;
        case 'Platinum':
          val = 'vec3(0.673, 0.637, 0.585)';
          break;
      }
      ctx.body.push(`vec3 ${v} = ${val};`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
