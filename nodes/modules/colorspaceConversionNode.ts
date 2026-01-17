import type { NodeModule } from '../types';

type ColorSpace = 'RGB' | 'HSV' | 'Linear';

export const colorspaceConversionNode: NodeModule = {
  type: 'colorspaceConversion',
  definition: {
    type: 'colorspaceConversion',
    label: 'Colorspace Conversion',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  initialData: () => ({
    conversionFrom: 'RGB',
    conversionTo: 'Linear',
  }),
  ui: {
    width: 'wide',
    preview: { enabled: true },
    sections: [
      {
        id: 'conversion',
        title: 'Conversion',
        controls: [
          {
            id: 'conversionFrom',
            label: 'From',
            controlType: 'select',
            bind: { scope: 'data', key: 'conversionFrom' },
            select: {
              options: [
                { label: 'RGB', value: 'RGB' },
                { label: 'HSV', value: 'HSV' },
                { label: 'Linear', value: 'Linear' },
              ],
            },
          },
          {
            id: 'conversionTo',
            label: 'To',
            controlType: 'select',
            bind: { scope: 'data', key: 'conversionTo' },
            select: {
              options: [
                { label: 'Linear', value: 'Linear' },
                { label: 'RGB', value: 'RGB' },
                { label: 'HSV', value: 'HSV' },
              ],
            },
          },
        ],
      },
    ],
  },
  socketRules: {
    fallbackSocket: { input: 'in', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const i = ctx.getInput(ctx.id, 'in', 'vec3(0.0)', 'vec3');
      const v = ctx.varName(ctx.id);

      const from = ((ctx.node.data.conversionFrom as ColorSpace | undefined) ?? 'RGB') as ColorSpace;
      const to = ((ctx.node.data.conversionTo as ColorSpace | undefined) ?? 'Linear') as ColorSpace;

      if (from === 'RGB' && to === 'HSV') {
        ctx.body.push(`vec3 ${v} = rgb2hsv(${i});`);
      } else if (from === 'HSV' && to === 'RGB') {
        ctx.body.push(`vec3 ${v} = hsv2rgb(${i});`);
      } else {
        ctx.body.push(`vec3 ${v} = ${i};`);
      }

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
