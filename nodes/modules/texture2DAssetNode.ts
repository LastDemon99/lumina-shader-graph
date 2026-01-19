import type { NodeModule } from '../types';

export const texture2DAssetNode: NodeModule = {
  type: 'texture2DAsset',
  definition: {
    type: 'texture2DAsset',
    label: 'Texture 2D Asset',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'texture' }],
  },
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'textureAsset',
            label: 'Texture',
            controlType: 'texture',
            bind: { scope: 'data', key: 'textureAsset' },
            texture: { variant: 'asset' },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    textureAsset: undefined,
  }),
  metadata: {
    isTextureSampler: true,
    requiresLod: true,
  },
  glsl: {
    emit: ctx => {
      const texUniform = ctx.getTextureUniformName?.(ctx.id);
      const v = ctx.varName(ctx.id);

      if (!texUniform) {
        ctx.body.push(`vec4 ${v} = vec4(0.0);`);
        ctx.variables[`${ctx.id}_rgba`] = { name: v, type: 'vec4' };
        ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' }; // Fallback
        return true;
      }

      ctx.uniforms.add(`uniform sampler2D ${texUniform};`);
      ctx.body.push(`vec4 ${v} = texture2D(${texUniform}, vUv);`);

      ctx.variables[`${ctx.id}_rgba`] = { name: v, type: 'vec4' };
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
      return true;
    },
  },
};
