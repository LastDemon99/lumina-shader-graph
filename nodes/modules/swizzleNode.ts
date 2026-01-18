import type { NodeModule } from '../types';
import type { SocketType } from '../../types';

const MASK_OPTIONS = [
  { label: 'X', value: 'x' },
  { label: 'Y', value: 'y' },
  { label: 'Z', value: 'z' },
  { label: 'W', value: 'w' },
];

export const swizzleNode: NodeModule = {
  type: 'swizzle',
  definition: {
    type: 'swizzle',
    label: 'Swizzle',
    inputs: [{ id: 'in', label: 'In(4)', type: 'vec4' }],
    outputs: [{ id: 'out', label: 'Out(4)', type: 'vec4' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [
      {
        id: 'mask',
        controls: [
          {
            id: 'mask',
            label: 'Mask',
            controlType: 'multiSelectMask',
            bind: { scope: 'data', key: 'mask' },
            multiSelectMask: {
              options: MASK_OPTIONS,
              allowDuplicates: true,
              minLength: 1,
              maxLength: 4,
              defaultValue: 'xyzw',
            },
          },
        ],
      },
    ],
  },
  socketRules: {
    outputs: {
      out: {
        type: { kind: 'swizzleMaskLength', maskKey: 'mask', defaultMask: 'xyzw' },
      },
    },
    fallbackSocket: {
      input: 'in',
      output: 'out',
    },
  },
  initialData: () => ({ mask: 'xyzw' }),
  glsl: {
    emit: ctx => {
      const i = ctx.getInput(ctx.id, 'in', 'vec4(0.0)', 'vec4');
      const mask = (ctx.node.data.mask || 'xyzw') as string;
      const v = ctx.varName(ctx.id);

      const outType: SocketType =
        mask.length === 1
          ? 'float'
          : mask.length === 2
            ? 'vec2'
            : mask.length === 3
              ? 'vec3'
              : 'vec4';

      ctx.body.push(`${outType} ${v} = ${i}.${mask};`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: outType };
      return true;
    },
  },
};
