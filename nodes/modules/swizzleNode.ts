import type { NodeModule } from '../types';

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
    width: 'wide',
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
};
