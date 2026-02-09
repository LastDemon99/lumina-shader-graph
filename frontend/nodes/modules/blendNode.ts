import type { NodeModule } from '../types';

const BLEND_MODES = [
  'Burn',
  'Darken',
  'Difference',
  'Dodge',
  'Divide',
  'Exclusion',
  'Hard Light',
  'Hard Mix',
  'Lighten',
  'Linear Burn',
  'Linear Dodge',
  'Linear Light',
  'Linear Light Add Sub',
  'Multiply',
  'Negation',
  'Overlay',
  'Pin Light',
  'Screen',
  'Soft Light',
  'Subtract',
  'Vivid Light',
  'Overwrite',
] as const;

type BlendMode = (typeof BLEND_MODES)[number];

export const blendNode: NodeModule = {
  type: 'blend',
  definition: {
    type: 'blend',
    label: 'Blend',
    inputs: [
      { id: 'base', label: 'Base(1)', type: 'vec3' },
      { id: 'blend', label: 'Blend(1)', type: 'vec3' },
      { id: 'opacity', label: 'Opacity(1)', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out(1)', type: 'vec3' }],
  },
  initialData: () => ({
    mode: 'Overlay',
  }),
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [
      {
        id: 'settings',
        title: 'Settings',
        controls: [
          {
            id: 'mode',
            label: 'Mode',
            controlType: 'select',
            bind: { scope: 'data', key: 'mode' },
            select: {
              options: BLEND_MODES.map(m => ({ label: m, value: m })),
            },
          },
        ],
      },
    ],
  },
  glsl: {
    emit: ctx => {
      const mode = (ctx.node.data.mode as BlendMode) || 'Overlay';
      const base = ctx.getInput(ctx.id, 'base', 'vec3(0.0)', 'vec3');
      const blend = ctx.getInput(ctx.id, 'blend', 'vec3(1.0)', 'vec3');
      const opacity = ctx.getInput(ctx.id, 'opacity', '1.0', 'float');

      const v = ctx.varName(ctx.id);
      const res = `${v}_res`;

      let blendLogic = '';

      switch (mode) {
        case 'Burn':
          blendLogic = `1.0 - (1.0 - ${base}) / (${blend} + 0.000001)`;
          break;
        case 'Darken':
          blendLogic = `min(${base}, ${blend})`;
          break;
        case 'Difference':
          blendLogic = `abs(${base} - ${blend})`;
          break;
        case 'Dodge':
          blendLogic = `${base} / (1.0 - ${blend} + 0.000001)`;
          break;
        case 'Divide':
          blendLogic = `${base} / (${blend} + 0.000001)`;
          break;
        case 'Exclusion':
          blendLogic = `${base} + ${blend} - 2.0 * ${base} * ${blend}`;
          break;
        case 'Hard Light':
          blendLogic = `mix(2.0 * ${base} * ${blend}, 1.0 - 2.0 * (1.0 - ${base}) * (1.0 - ${blend}), step(0.5, ${blend}))`;
          break;
        case 'Hard Mix':
          blendLogic = `step(1.0, ${base} + ${blend})`;
          break;
        case 'Lighten':
          blendLogic = `max(${base}, ${blend})`;
          break;
        case 'Linear Burn':
          blendLogic = `${base} + ${blend} - 1.0`;
          break;
        case 'Linear Dodge':
          blendLogic = `${base} + ${blend}`;
          break;
        case 'Linear Light':
        case 'Linear Light Add Sub':
          blendLogic = `${base} + 2.0 * ${blend} - 1.0`;
          break;
        case 'Multiply':
          blendLogic = `${base} * ${blend}`;
          break;
        case 'Negation':
          blendLogic = `1.0 - abs(1.0 - ${base} - ${blend})`;
          break;
        case 'Overlay':
          blendLogic = `mix(2.0 * ${base} * ${blend}, 1.0 - 2.0 * (1.0 - ${base}) * (1.0 - ${blend}), step(0.5, ${base}))`;
          break;
        case 'Pin Light':
          blendLogic = `mix(min(${base}, 2.0 * ${blend}), max(${base}, 2.0 * (${blend} - 0.5)), step(0.5, ${blend}))`;
          break;
        case 'Screen':
          blendLogic = `1.0 - (1.0 - ${base}) * (1.0 - ${blend})`;
          break;
        case 'Soft Light':
          blendLogic = `mix(${base} + (2.0 * ${blend} - 1.0) * (${base} - ${base} * ${base}), ${base} + (2.0 * ${blend} - 1.0) * (sqrt(${base}) - ${base}), step(0.5, ${blend}))`;
          break;
        case 'Subtract':
          blendLogic = `${base} - ${blend}`;
          break;
        case 'Vivid Light':
          blendLogic = `mix(1.0 - (1.0 - ${base}) / (2.0 * ${blend} + 0.000001), ${base} / (2.0 * (1.0 - ${blend}) + 0.000001), step(0.5, ${blend}))`;
          break;
        case 'Overwrite':
          blendLogic = `${blend}`;
          break;
        default:
          blendLogic = `mix(${base}, ${blend}, 0.5)`;
      }

      ctx.body.push(`vec3 ${res} = ${blendLogic};`);
      ctx.body.push(`vec3 ${v} = mix(${base}, ${res}, clamp(${opacity}, 0.0, 1.0));`);

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
