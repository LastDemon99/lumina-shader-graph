import type { NodeModule } from '../types';

export const texture2DArrayAssetNode: NodeModule = {
  type: 'texture2DArrayAsset',
  definition: {
    type: 'texture2DArrayAsset',
    label: 'Texture 2D Array Asset',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'textureArray' }],
  },
  ui: {
    width: 'wide',
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'layers',
            label: 'Texture Layers',
            controlType: 'textureArray',
            bind: { scope: 'data', key: 'layers' },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    layers: [],
    layerCount: 0,
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
      const layerCount = Math.max(1, ctx.node.data.layerCount || 1);

      if (!texUniform) {
        ctx.body.push(`vec4 ${v} = vec4(0.0);`);
        ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
        return true;
      }

      ctx.uniforms.add(`uniform sampler2D ${texUniform};`);
      // Sample first layer for preview
      ctx.body.push(
        `vec2 ${v}_uv = vec2(vUv.x, (fract(vUv.y) + ${layerCount.toFixed(1)} - 1.0) / ${layerCount.toFixed(1)});`,
      );
      ctx.body.push(`vec4 ${v} = texture2D(${texUniform}, ${v}_uv);`);

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
      return true;
    },
  },
};
