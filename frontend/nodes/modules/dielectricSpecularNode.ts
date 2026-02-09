import type { NodeModule } from '../types';

export const dielectricSpecularNode: NodeModule = {
  type: 'dielectricSpecular',
  definition: {
    type: 'dielectricSpecular',
    label: 'Dielectric Specular',
    inputs: [
      { id: 'range', label: 'Range', type: 'float' },
      { id: 'ior', label: 'IOR', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
  },
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
  glsl: {
    emit: ctx => {
      const dielectricMode = ctx.node.data.dielectricMaterial || 'Common';
      const v = ctx.varName(ctx.id);

      if (dielectricMode === 'Common') {
        const range = ctx.getInput(ctx.id, 'range', '0.5', 'float');
        ctx.body.push(`float ${v} = ${range} * 0.08;`);
      } else if (dielectricMode === 'Custom') {
        const ior = ctx.getInput(ctx.id, 'ior', '1.5', 'float');
        ctx.body.push(`float ${v}_num = (${ior} - 1.0);`);
        ctx.body.push(`float ${v}_den = (${ior} + 1.0);`);
        ctx.body.push(`float ${v} = pow(${v}_num / (${v}_den + 0.0001), 2.0);`);
      } else {
        let f0 = 0.04;
        if (dielectricMode === 'Water') f0 = 0.02;
        if (dielectricMode === 'Ice') f0 = 0.018;
        if (dielectricMode === 'Glass') f0 = 0.04;
        if (dielectricMode === 'RustedMetal') f0 = 0.03;
        ctx.body.push(`float ${v} = ${f0.toFixed(4)};`);
      }

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
