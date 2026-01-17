import type { NodeModule } from '../types';

export const channelMaskNode: NodeModule = {
  type: 'channelMask',
  definition: {
    type: 'channelMask',
    label: 'Channel Mask',
    inputs: [{ id: 'in', label: 'In', type: 'vec4' }],
    outputs: [{ id: 'out', label: 'Out', type: 'vec4' }],
  },
  initialData: () => ({
    channelMask: 'RGBA',
  }),
  ui: {
    width: 'wide',
    preview: { enabled: true },
    sections: [
      {
        id: 'mask',
        title: 'Mask',
        controls: [
          {
            id: 'channelMask',
            label: 'Channels',
            controlType: 'multiSelectMask',
            bind: { scope: 'data', key: 'channelMask' },
            multiSelectMask: {
              options: [
                { label: 'R', value: 'R' },
                { label: 'G', value: 'G' },
                { label: 'B', value: 'B' },
                { label: 'A', value: 'A' },
              ],
              allowDuplicates: false,
              minLength: 0,
              maxLength: 4,
              defaultValue: 'RGBA',
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
      const i = ctx.getInput(ctx.id, 'in', 'vec4(0.0)', 'vec4');
      const mask = (ctx.node.data.channelMask as string | undefined) || 'RGBA';
      const v = ctx.varName(ctx.id);
      const r = mask.includes('R') ? '1.0' : '0.0';
      const g = mask.includes('G') ? '1.0' : '0.0';
      const b = mask.includes('B') ? '1.0' : '0.0';
      const a = mask.includes('A') ? '1.0' : '0.0';
      ctx.body.push(`vec4 ${v} = ${i} * vec4(${r}, ${g}, ${b}, ${a});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
      return true;
    },
  },
};
