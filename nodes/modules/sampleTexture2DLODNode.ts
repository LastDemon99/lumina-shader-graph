import type { NodeModule } from '../types';

export const sampleTexture2DLODNode: NodeModule = {
  type: 'sampleTexture2DLOD',
  definition: {
    type: 'sampleTexture2DLOD',
    label: 'Sample Texture 2D LOD',
    inputs: [
      { id: 'texture', label: 'Texture', type: 'texture' },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'lod', label: 'LOD', type: 'float' },
    ],
    outputs: [
      { id: 'rgba', label: 'RGBA', type: 'vec4' },
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 'a', label: 'A', type: 'float' },
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
      const texUniform = ctx.getTextureUniformName?.(ctx.id);
      const v = ctx.varName(ctx.id);
      if (!texUniform) {
        ctx.body.push(`vec4 ${v} = vec4(0.0);`);
        ctx.variables[`${ctx.id}_rgba`] = { name: v, type: 'vec4' };
        ctx.variables[`${ctx.id}_r`] = { name: `${v}.r`, type: 'float' };
        ctx.variables[`${ctx.id}_g`] = { name: `${v}.g`, type: 'float' };
        ctx.variables[`${ctx.id}_b`] = { name: `${v}.b`, type: 'float' };
        ctx.variables[`${ctx.id}_a`] = { name: `${v}.a`, type: 'float' };
        return true;
      }

      ctx.uniforms.add(`uniform sampler2D ${texUniform};`);
      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const lod = ctx.getInput(ctx.id, 'lod', '0.0', 'float');

      ctx.body.push(`#ifdef GL_EXT_shader_texture_lod`);
      ctx.body.push(`  vec4 ${v} = texture2DLodEXT(${texUniform}, vec2(${uv}), ${lod});`);
      ctx.body.push(`#else`);
      ctx.body.push(`  vec4 ${v} = vec4(0.0);`);
      ctx.body.push(`#endif`);

      ctx.variables[`${ctx.id}_rgba`] = { name: v, type: 'vec4' };
      ctx.variables[`${ctx.id}_r`] = { name: `${v}.r`, type: 'float' };
      ctx.variables[`${ctx.id}_g`] = { name: `${v}.g`, type: 'float' };
      ctx.variables[`${ctx.id}_b`] = { name: `${v}.b`, type: 'float' };
      ctx.variables[`${ctx.id}_a`] = { name: `${v}.a`, type: 'float' };
      return true;
    },
  },
};
