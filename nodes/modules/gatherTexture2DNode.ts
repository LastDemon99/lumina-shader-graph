import type { NodeModule } from '../types';

export const gatherTexture2DNode: NodeModule = {
  type: 'gatherTexture2D',
  definition: {
    type: 'gatherTexture2D',
    label: 'Gather Texture 2D',
    inputs: [
      { id: 'texture', label: 'Texture', type: 'texture' },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'offset', label: 'Offset', type: 'vec2' },
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
      const dimUniform = ctx.getTextureDimUniformName?.(ctx.id);
      const v = ctx.varName(ctx.id);
      if (!texUniform || !dimUniform) {
        ctx.body.push(`vec4 ${v} = vec4(0.0);`);
        ctx.variables[`${ctx.id}_rgba`] = { name: v, type: 'vec4' };
        ctx.variables[`${ctx.id}_r`] = { name: `${v}.x`, type: 'float' };
        ctx.variables[`${ctx.id}_g`] = { name: `${v}.y`, type: 'float' };
        ctx.variables[`${ctx.id}_b`] = { name: `${v}.z`, type: 'float' };
        ctx.variables[`${ctx.id}_a`] = { name: `${v}.w`, type: 'float' };
        return true;
      }

      ctx.uniforms.add(`uniform sampler2D ${texUniform};`);
      ctx.uniforms.add(`uniform vec2 ${dimUniform};`);

      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const offset = ctx.getInput(ctx.id, 'offset', 'vec2(0.0)', 'vec2');

      ctx.body.push(`vec2 ${v}_ts = 1.0 / max(${dimUniform}, vec2(1.0));`);
      ctx.body.push(`vec2 ${v}_base = ${uv} + ${offset} * ${v}_ts;`);

      if (ctx.mode === 'vertex') {
        ctx.body.push(`#ifdef GL_EXT_shader_texture_lod`);
        ctx.body.push(
          `  float ${v}_r = texture2DLodEXT(${texUniform}, ${v}_base + vec2(-0.5, 0.5) * ${v}_ts, 0.0).r;`
        );
        ctx.body.push(
          `  float ${v}_g = texture2DLodEXT(${texUniform}, ${v}_base + vec2(0.5, 0.5) * ${v}_ts, 0.0).r;`
        );
        ctx.body.push(
          `  float ${v}_b = texture2DLodEXT(${texUniform}, ${v}_base + vec2(0.5, -0.5) * ${v}_ts, 0.0).r;`
        );
        ctx.body.push(
          `  float ${v}_a = texture2DLodEXT(${texUniform}, ${v}_base + vec2(-0.5, -0.5) * ${v}_ts, 0.0).r;`
        );
        ctx.body.push(`  vec4 ${v} = vec4(${v}_r, ${v}_g, ${v}_b, ${v}_a);`);
        ctx.body.push(`#else`);
        ctx.body.push(`  vec4 ${v} = vec4(0.0);`);
        ctx.body.push(`#endif`);
      } else {
        ctx.body.push(
          `float ${v}_r = texture2D(${texUniform}, ${v}_base + vec2(-0.5, 0.5) * ${v}_ts).r;`
        );
        ctx.body.push(
          `float ${v}_g = texture2D(${texUniform}, ${v}_base + vec2(0.5, 0.5) * ${v}_ts).r;`
        );
        ctx.body.push(
          `float ${v}_b = texture2D(${texUniform}, ${v}_base + vec2(0.5, -0.5) * ${v}_ts).r;`
        );
        ctx.body.push(
          `float ${v}_a = texture2D(${texUniform}, ${v}_base + vec2(-0.5, -0.5) * ${v}_ts).r;`
        );
        ctx.body.push(`vec4 ${v} = vec4(${v}_r, ${v}_g, ${v}_b, ${v}_a);`);
      }

      ctx.variables[`${ctx.id}_rgba`] = { name: v, type: 'vec4' };
      ctx.variables[`${ctx.id}_r`] = { name: `${v}.x`, type: 'float' };
      ctx.variables[`${ctx.id}_g`] = { name: `${v}.y`, type: 'float' };
      ctx.variables[`${ctx.id}_b`] = { name: `${v}.z`, type: 'float' };
      ctx.variables[`${ctx.id}_a`] = { name: `${v}.w`, type: 'float' };
      return true;
    },
  },
};
