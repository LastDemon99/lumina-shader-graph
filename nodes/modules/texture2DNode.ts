import type { NodeModule } from '../types';

export const texture2DNode: NodeModule = {
  type: 'texture2D',
  definition: {
    type: 'texture2D',
    label: 'Texture 2D',
    inputs: [],
    outputs: [
      { id: 'tex', label: 'Texture(T2)', type: 'texture' },
      { id: 'rgba', label: 'RGBA', type: 'vec4' },
    ],
  },
  ui: {
    width: 'normal',
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
  glsl: {
    emit: (ctx) => {
      const texUniform = ctx.getTextureUniformName?.(ctx.id);
      const rgbaVar = ctx.varName(ctx.id, 'rgba');

      if (!texUniform) {
        ctx.body.push(`vec4 ${rgbaVar} = vec4(0.0);`);
        // No sampler available; still provide a valid color output.
        ctx.variables[`${ctx.id}_rgba`] = { name: rgbaVar, type: 'vec4' };
        return true;
      }

      // Expose sampler2D as the 'texture' output.
      ctx.uniforms.add(`uniform sampler2D ${texUniform};`);
      ctx.variables[`${ctx.id}_tex`] = { name: texUniform, type: 'texture' };

      // Also provide a convenient sampled preview output.
      ctx.body.push(`vec4 ${rgbaVar} = texture2D(${texUniform}, vUv);`);
      ctx.variables[`${ctx.id}_rgba`] = { name: rgbaVar, type: 'vec4' };

      return true;
    },
  },
  metadata: {
    headerColor: 'bg-sky-900',
    isTextureSampler: true,
    requiresLod: true,
    legacyAliases: ['textureAsset', 'texture2DAsset'],
  },
};
