import type { NodeModule } from '../types';

export const sampleTexture2DArrayNode: NodeModule = {
  type: 'sampleTexture2DArray',
  definition: {
    type: 'sampleTexture2DArray',
    label: 'Sample Texture 2D Array',
    inputs: [
      { id: 'texture', label: 'Texture Array', type: 'textureArray' },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'index', label: 'Index', type: 'float' },
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
    sections: [],
  },
  initialData: () => ({}),
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
        ctx.variables[`${ctx.id}_r`] = { name: `${v}.r`, type: 'float' };
        ctx.variables[`${ctx.id}_g`] = { name: `${v}.g`, type: 'float' };
        ctx.variables[`${ctx.id}_b`] = { name: `${v}.b`, type: 'float' };
        ctx.variables[`${ctx.id}_a`] = { name: `${v}.a`, type: 'float' };
        return true;
      }

      ctx.uniforms.add(`uniform sampler2D ${texUniform};`);
      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const index = ctx.getInput(ctx.id, 'index', '0.0', 'float');

      // Match legacy behavior: derive layerCount from connected source node's data
      const texConn = ctx.connections.find(
        c => c.targetNodeId === ctx.id && c.targetSocketId === 'texture'
      );
      let layerCount = 1;
      if (texConn) {
        const sourceNode = ctx.nodes.find(n => n.id === texConn.sourceNodeId);
        if (sourceNode && sourceNode.data.layerCount) {
          layerCount = Math.max(1, sourceNode.data.layerCount);
        }
      }

      ctx.body.push(
        `float ${v}_idx = clamp(floor(${index}), 0.0, ${layerCount.toFixed(1)} - 1.0);`
      );
      ctx.body.push(
        `vec2 ${v}_uv = vec2(${uv}.x, (fract(${uv}.y) + ${layerCount.toFixed(1)} - 1.0 - ${v}_idx) / ${layerCount.toFixed(1)});`
      );

      if (ctx.mode === 'vertex') {
        ctx.body.push(`#ifdef GL_EXT_shader_texture_lod`);
        ctx.body.push(`  vec4 ${v} = texture2DLodEXT(${texUniform}, ${v}_uv, 0.0);`);
        ctx.body.push(`#else`);
        ctx.body.push(`  vec4 ${v} = vec4(0.0);`);
        ctx.body.push(`#endif`);
      } else {
        ctx.body.push(`vec4 ${v} = texture2D(${texUniform}, ${v}_uv);`);
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
