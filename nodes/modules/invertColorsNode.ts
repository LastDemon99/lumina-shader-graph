import type { NodeModule } from '../types';

export const invertColorsNode: NodeModule = {
  type: 'invertColors',
  definition: {
    type: 'invertColors',
    label: 'Invert Colors',
    inputs: [{ id: 'in', label: 'In(1)', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }],
  },
  initialData: () => ({
    invertRed: true,
    invertGreen: true,
    invertBlue: true,
    invertAlpha: false,
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
            id: 'invertRed',
            label: 'Red',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'invertRed' },
          },
          {
            id: 'invertGreen',
            label: 'Green',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'invertGreen' },
          },
          {
            id: 'invertBlue',
            label: 'Blue',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'invertBlue' },
          },
          {
            id: 'invertAlpha',
            label: 'Alpha',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'invertAlpha' },
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

      const r = ctx.node.data.invertRed ? '1.0' : '0.0';
      const g = ctx.node.data.invertGreen ? '1.0' : '0.0';
      const b = ctx.node.data.invertBlue ? '1.0' : '0.0';
      const a = ctx.node.data.invertAlpha ? '1.0' : '0.0';

      if (type === 'float') {
        ctx.body.push(`float ${v} = mix(${i}, 1.0 - ${i}, ${r});`);
      } else if (type === 'vec2') {
        ctx.body.push(`vec2 ${v} = mix(${i}, vec2(1.0) - ${i}, vec2(${r}, ${g}));`);
      } else if (type === 'vec3') {
        ctx.body.push(`vec3 ${v} = mix(${i}, vec3(1.0) - ${i}, vec3(${r}, ${g}, ${b}));`);
      } else if (type === 'vec4') {
        ctx.body.push(`vec4 ${v} = mix(${i}, vec4(1.0) - ${i}, vec4(${r}, ${g}, ${b}, ${a}));`);
      }

      ctx.variables[`${ctx.id}_out`] = { name: v, type };
      return true;
    },
  },
};
