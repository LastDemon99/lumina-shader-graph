import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const transformNode: NodeModule = {
  type: 'transform',
  definition: NODE_DEFINITIONS.transform,
  ui: {
    width: 'wide',
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'transformSpaceFrom',
            label: 'From',
            controlType: 'select',
            bind: { scope: 'data', key: 'transformSpaceFrom' },
            select: {
              options: [
                { label: 'Object', value: 'Object' },
                { label: 'World', value: 'World' },
                { label: 'View', value: 'View' },
                { label: 'Tangent', value: 'Tangent' },
                { label: 'Absolute World', value: 'Absolute World' },
                { label: 'Screen', value: 'Screen' },
              ],
            },
          },
          {
            id: 'transformSpaceTo',
            label: 'To',
            controlType: 'select',
            bind: { scope: 'data', key: 'transformSpaceTo' },
            select: {
              options: [
                { label: 'Object', value: 'Object' },
                { label: 'World', value: 'World' },
                { label: 'View', value: 'View' },
                { label: 'Tangent', value: 'Tangent' },
                { label: 'Absolute World', value: 'Absolute World' },
                { label: 'Screen', value: 'Screen' },
              ],
            },
          },
          {
            id: 'transformType',
            label: 'Type',
            controlType: 'select',
            bind: { scope: 'data', key: 'transformType' },
            select: {
              options: [
                { label: 'Position', value: 'Position' },
                { label: 'Direction', value: 'Direction' },
                { label: 'Normal', value: 'Normal' },
              ],
            },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    transformSpaceFrom: 'Object',
    transformSpaceTo: 'World',
    transformType: 'Position',
  }),
};
