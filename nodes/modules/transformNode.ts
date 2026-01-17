import type { NodeModule } from '../types';

export const transformNode: NodeModule = {
  type: 'transform',
  definition: {
    type: 'transform',
    label: 'Transform',
    inputs: [{ id: 'in', label: 'In(3)', type: 'vec3' }],
    outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }],
  },
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
  glsl: {
    emit: ctx => {
      const input = ctx.getInput(ctx.id, 'in', 'vec3(0.0)', 'vec3');
      const from = ctx.node.data.transformSpaceFrom || 'Object';
      const to = ctx.node.data.transformSpaceTo || 'World';
      const type = ctx.node.data.transformType || 'Position';
      const v = ctx.varName(ctx.id);

      if (from === 'Tangent' || to === 'Tangent') {
        if (ctx.mode === 'vertex') {
          ctx.body.push(`vec3 ${v}_rawN = normalize(mat3(u_model) * normal);`);
          ctx.body.push(`vec3 ${v}_rawT = normalize(mat3(u_model) * tangent.xyz);`);
          ctx.body.push(`vec3 ${v}_rawB = normalize(cross(${v}_rawN, ${v}_rawT) * tangent.w);`);
          ctx.body.push(`mat3 ${v}_TBN = mat3(${v}_rawT, ${v}_rawB, ${v}_rawN);`);
        } else {
          ctx.body.push(`vec3 ${v}_N = normalize(vNormal);`);
          ctx.body.push(`vec3 ${v}_T = normalize(vTangent);`);
          ctx.body.push(`vec3 ${v}_B = normalize(vBitangent);`);
          ctx.body.push(`mat3 ${v}_TBN = mat3(${v}_T, ${v}_B, ${v}_N);`);
        }
      }

      let currentPos = input;

      if (from === 'Object') {
        if (type === 'Position') currentPos = `(u_model * vec4(${currentPos}, 1.0)).xyz`;
        else currentPos = `mat3(u_model) * ${currentPos}`;
      } else if (from === 'View') {
        if (type === 'Position') currentPos = `(u_view_inv * vec4(${currentPos}, 1.0)).xyz`;
        else currentPos = `mat3(u_view_inv) * ${currentPos}`;
      } else if (from === 'Tangent') {
        if (type !== 'Position') {
          currentPos = `${v}_TBN * ${currentPos}`;
        }
      }

      if (to === 'Object') {
        if (type === 'Position') currentPos = `(u_model_inv * vec4(${currentPos}, 1.0)).xyz`;
        else currentPos = `mat3(u_model_inv) * ${currentPos}`;
      } else if (to === 'View') {
        if (type === 'Position') currentPos = `(u_view * vec4(${currentPos}, 1.0)).xyz`;
        else currentPos = `mat3(u_view) * ${currentPos}`;
      } else if (to === 'Tangent') {
        if (type !== 'Position') {
          currentPos = `${currentPos} * ${v}_TBN`;
        }
      }

      ctx.body.push(`vec3 ${v} = ${currentPos};`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
