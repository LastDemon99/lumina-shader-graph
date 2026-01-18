import type { NodeModule } from '../types';

export const textureNode: NodeModule = {
  type: 'texture',
  definition: {
    type: 'texture',
    label: 'Texture',
    inputs: [
      { id: 'texture', label: 'Texture', type: 'texture' },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'sampler', label: 'Sampler (SS)', type: 'samplerState' },
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
    width: 'normal',
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
          {
            id: 'textureType',
            label: 'Type',
            controlType: 'select',
            bind: { scope: 'data', key: 'textureType' },
            select: {
              options: [
                { label: 'Default', value: 'Default' },
                { label: 'Normal', value: 'Normal' },
              ],
            },
            when: { kind: 'not', cond: { kind: 'connected', socketId: 'texture', direction: 'input' } },
          },
          {
            id: 'space',
            label: 'Space',
            controlType: 'select',
            bind: { scope: 'data', key: 'space' },
            select: {
              options: [
                { label: 'Tangent', value: 'Tangent' },
                { label: 'Object', value: 'Object' },
              ],
            },
            when: { kind: 'not', cond: { kind: 'connected', socketId: 'texture', direction: 'input' } },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    textureAsset: undefined,
    textureType: 'Default',
    space: 'Tangent',
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

      if (ctx.mode === 'vertex') {
        ctx.body.push(`#ifdef GL_EXT_shader_texture_lod`);
        ctx.body.push(`  vec4 ${v} = texture2DLodEXT(${texUniform}, vec2(${uv}), 0.0);`);
        ctx.body.push(`#else`);
        ctx.body.push(`  vec4 ${v} = vec4(0.0);`);
        ctx.body.push(`#endif`);
      } else {
        ctx.body.push(`vec4 ${v} = texture2D(${texUniform}, ${uv});`);
      }

      if (ctx.node.data.textureType === 'Normal') {
        ctx.body.push(`${v}.rgb = ${v}.rgb * 2.0 - 1.0;`);
      }

      ctx.variables[`${ctx.id}_rgba`] = { name: v, type: 'vec4' };
      ctx.variables[`${ctx.id}_r`] = { name: `${v}.r`, type: 'float' };
      ctx.variables[`${ctx.id}_g`] = { name: `${v}.g`, type: 'float' };
      ctx.variables[`${ctx.id}_b`] = { name: `${v}.b`, type: 'float' };
      ctx.variables[`${ctx.id}_a`] = { name: `${v}.a`, type: 'float' };
      return true;
    },
  },
};
