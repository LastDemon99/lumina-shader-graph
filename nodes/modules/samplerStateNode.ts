import type { NodeModule } from '../types';

export const samplerStateNode: NodeModule = {
  type: 'samplerState',
  definition: {
    type: 'samplerState',
    label: 'Sampler State',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'samplerState' }],
  },
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'samplerFilter',
            label: 'Filter',
            controlType: 'select',
            bind: { scope: 'data', key: 'samplerFilter' },
            select: {
              options: [
                { label: 'Linear', value: 'Linear' },
                { label: 'Point', value: 'Point' },
                { label: 'Trilinear', value: 'Trilinear' },
              ],
            },
          },
          {
            id: 'samplerWrap',
            label: 'Wrap',
            controlType: 'select',
            bind: { scope: 'data', key: 'samplerWrap' },
            select: {
              options: [
                { label: 'Repeat', value: 'Repeat' },
                { label: 'Clamp', value: 'Clamp' },
                { label: 'Mirror', value: 'Mirror' },
                { label: 'Mirror Once', value: 'MirrorOnce' },
              ],
            },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    samplerFilter: 'Linear',
    samplerWrap: 'Repeat',
  }),
  glsl: {
    emit: ctx => {
      // Sampler state is currently not modeled in GLSL; downstream texture nodes ignore it.
      ctx.variables[`${ctx.id}_out`] = { name: '0', type: 'samplerState' };
      return true;
    },
  },
};
