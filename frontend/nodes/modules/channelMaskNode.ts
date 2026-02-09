import type { NodeModule } from '../types';

export const channelMaskNode: NodeModule = {
  type: 'channelMask',
  definition: {
    type: 'channelMask',
    label: 'Channel Mask',
    inputs: [{ id: 'in', label: 'In(1)', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }],
  },
  initialData: () => ({
    maskRed: true,
    maskGreen: true,
    maskBlue: true,
    maskAlpha: true,
  }),
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [
      {
        id: 'channels',
        title: 'Channels',
        controls: [
          {
            id: 'maskRed',
            label: 'Red',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'maskRed' },
          },
          {
            id: 'maskGreen',
            label: 'Green',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'maskGreen' },
          },
          {
            id: 'maskBlue',
            label: 'Blue',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'maskBlue' },
          },
          {
            id: 'maskAlpha',
            label: 'Alpha',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'maskAlpha' },
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
      const type = ctx.getDynamicType(['in']);
      const i = ctx.getInput(ctx.id, 'in', type === 'float' ? '0.0' : `${type}(0.0)`, type);
      const v = ctx.varName(ctx.id);

      const r = ctx.node.data.maskRed ? '1.0' : '0.0';
      const g = ctx.node.data.maskGreen ? '1.0' : '0.0';
      const b = ctx.node.data.maskBlue ? '1.0' : '0.0';
      const a = ctx.node.data.maskAlpha ? '1.0' : '0.0';

      if (type === 'float') {
        ctx.body.push(`float ${v} = ${i} * ${r};`);
      } else if (type === 'vec2') {
        ctx.body.push(`vec2 ${v} = ${i} * vec2(${r}, ${g});`);
      } else if (type === 'vec3') {
        ctx.body.push(`vec3 ${v} = ${i} * vec3(${r}, ${g}, ${b});`);
      } else if (type === 'vec4') {
        ctx.body.push(`vec4 ${v} = ${i} * vec4(${r}, ${g}, ${b}, ${a});`);
      }

      ctx.variables[`${ctx.id}_out`] = { name: v, type };
      return true;
    },
  },
};
