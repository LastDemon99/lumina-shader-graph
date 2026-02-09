import type { NodeModule } from '../types';

export const calculateLevelOfDetailTextureNode: NodeModule = {
  type: 'calculateLevelOfDetailTexture',
  definition: {
    type: 'calculateLevelOfDetailTexture',
    label: 'Calculate LOD Texture 2D',
    inputs: [
      { id: 'texture', label: 'Texture', type: 'texture' },
      { id: 'uv', label: 'UV', type: 'vec2' },
    ],
    outputs: [{ id: 'lod', label: 'LOD', type: 'float' }],
  },
  ui: {
    preview: { enabled: false },
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'textureAsset',
            label: 'Source',
            controlType: 'texture',
            bind: { scope: 'data', key: 'textureAsset' },
            texture: { variant: 'asset' },
            when: { kind: 'not', cond: { kind: 'connected', socketId: 'texture', direction: 'input' } },
          },
          {
            id: 'clamp',
            label: 'Clamp',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'clamp' },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    clamp: false,
    textureAsset: undefined,
  }),
  metadata: {
    isTextureSampler: true,
    requiresLod: true,
    requiresDerivatives: true,
  },
  glsl: {
    emit: ctx => {
      const dimUniform = ctx.getTextureDimUniformName?.(ctx.id);
      const v = ctx.varName(ctx.id);
      if (!dimUniform) {
        ctx.body.push(`float ${v} = 0.0;`);
        ctx.variables[`${ctx.id}_lod`] = { name: v, type: 'float' };
        return true;
      }

      ctx.uniforms.add(`uniform vec2 ${dimUniform};`);
      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');

      if (ctx.mode === 'vertex') {
        ctx.body.push(`float ${v} = 0.0;`);
      } else {
        ctx.body.push(`#ifdef GL_OES_standard_derivatives`);
        ctx.body.push(`  vec2 ${v}_dx = dFdx(${uv} * ${dimUniform});`);
        ctx.body.push(`  vec2 ${v}_dy = dFdy(${uv} * ${dimUniform});`);
        ctx.body.push(`  float ${v} = log2(max(max(length(${v}_dx), length(${v}_dy)), 0.00001));`);
        ctx.body.push(`#else`);
        ctx.body.push(`  float ${v} = 0.0;`);
        ctx.body.push(`#endif`);
      }

      ctx.variables[`${ctx.id}_lod`] = { name: v, type: 'float' };
      return true;
    },
  },
};

export default calculateLevelOfDetailTextureNode;
