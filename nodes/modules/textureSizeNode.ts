import type { NodeModule } from '../types';

export const textureSizeNode: NodeModule = {
  type: 'textureSize',
  definition: {
    type: 'textureSize',
    label: 'Texture Size',
    inputs: [{ id: 'texture', label: 'Texture', type: 'texture' }],
    outputs: [
      { id: 'width', label: 'Width', type: 'float' },
      { id: 'height', label: 'Height', type: 'float' },
      { id: 'texelWidth', label: 'Texel Width', type: 'float' },
      { id: 'texelHeight', label: 'Texel Height', type: 'float' },
    ],
  },
  ui: {
    sections: [
      {
        id: 'source',
        controls: [
          {
            id: 'textureAsset',
            label: 'Source',
            controlType: 'texture',
            bind: { scope: 'data', key: 'textureAsset' },
            texture: { variant: 'asset' },
            when: { kind: 'not', cond: { kind: 'connected', socketId: 'texture', direction: 'input' } },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    textureAsset: undefined,
  }),
  glsl: {
    emit: ctx => {
      const dimUniform = ctx.getTextureDimUniformName?.(ctx.id);
      const v = ctx.varName(ctx.id);
      if (!dimUniform) {
        ctx.body.push(`float ${v}_w = 1.0;`);
        ctx.body.push(`float ${v}_h = 1.0;`);
        ctx.body.push(`float ${v}_tw = 1.0;`);
        ctx.body.push(`float ${v}_th = 1.0;`);
        ctx.variables[`${ctx.id}_width`] = { name: `${v}_w`, type: 'float' };
        ctx.variables[`${ctx.id}_height`] = { name: `${v}_h`, type: 'float' };
        ctx.variables[`${ctx.id}_texelWidth`] = { name: `${v}_tw`, type: 'float' };
        ctx.variables[`${ctx.id}_texelHeight`] = { name: `${v}_th`, type: 'float' };
        return true;
      }

      ctx.uniforms.add(`uniform vec2 ${dimUniform};`);
      ctx.body.push(`float ${v}_w = ${dimUniform}.x;`);
      ctx.body.push(`float ${v}_h = ${dimUniform}.y;`);
      ctx.body.push(`float ${v}_tw = 1.0 / (${dimUniform}.x + 0.0001);`);
      ctx.body.push(`float ${v}_th = 1.0 / (${dimUniform}.y + 0.0001);`);

      ctx.variables[`${ctx.id}_width`] = { name: `${v}_w`, type: 'float' };
      ctx.variables[`${ctx.id}_height`] = { name: `${v}_h`, type: 'float' };
      ctx.variables[`${ctx.id}_texelWidth`] = { name: `${v}_tw`, type: 'float' };
      ctx.variables[`${ctx.id}_texelHeight`] = { name: `${v}_th`, type: 'float' };
      return true;
    },
  },
};
