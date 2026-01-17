import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const dielectricSpecularNode: NodeModule = {
  type: 'dielectricSpecular',
  definition: NODE_DEFINITIONS.dielectricSpecular,
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'dielectricMaterial',
            label: 'Material',
            controlType: 'select',
            bind: { scope: 'data', key: 'dielectricMaterial' },
            select: {
              options: [
                { label: 'Common', value: 'Common' },
                { label: 'Rusted Metal', value: 'RustedMetal' },
                { label: 'Water', value: 'Water' },
                { label: 'Ice', value: 'Ice' },
                { label: 'Glass', value: 'Glass' },
                { label: 'Custom', value: 'Custom' },
              ],
            },
          },
        ],
      },
    ],
  },
  socketRules: {
    inputs: {
      range: {
        visibleWhen: { kind: 'dataEquals', key: 'dielectricMaterial', value: 'Common' },
      },
      ior: {
        visibleWhen: { kind: 'dataEquals', key: 'dielectricMaterial', value: 'Custom' },
      },
    },
  },
  initialData: () => ({
    dielectricMaterial: 'Common',
  }),
};
