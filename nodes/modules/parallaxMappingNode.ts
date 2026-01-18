import type { NodeModule } from '../types';

export const parallaxMappingNode: NodeModule = {
  type: 'parallaxMapping',
  definition: {
    type: 'parallaxMapping',
    label: 'Parallax Mapping',
    inputs: [
      { id: 'texture', label: 'Heightmap', type: 'texture' },
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'amplitude', label: 'Amplitude', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec2' }],
  },
  ui: {
    preview: { enabled: true },
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'textureAsset',
            label: 'Heightmap',
            controlType: 'texture',
            bind: { scope: 'data', key: 'textureAsset' },
            texture: { variant: 'asset' },
            when: { kind: 'not', cond: { kind: 'connected', socketId: 'texture', direction: 'input' } },
          },
          {
            id: 'parallaxChannel',
            label: 'Sample Channel',
            controlType: 'select',
            bind: { scope: 'data', key: 'parallaxChannel' },
            select: {
              options: [
                { label: 'R', value: 'r' },
                { label: 'G', value: 'g' },
                { label: 'B', value: 'b' },
                { label: 'A', value: 'a' },
              ],
            },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    parallaxChannel: 'g',
    textureAsset: undefined,
  }),
  metadata: {
    isTextureSampler: true,
    requiresLod: true,
  },
  glsl: {
    emit: ctx => {
      const uv = ctx.getInput(ctx.id, 'uv', ctx.mode === 'vertex' ? 'uv' : 'vUv', 'vec2');
      const amplitude = ctx.getInput(ctx.id, 'amplitude', '1.0', 'float');
      const texUniform = ctx.getTextureUniformName?.(ctx.id);

      const channel = (ctx.node.data.parallaxChannel || 'g') as string;
      const v = ctx.varName(ctx.id);

      if (!texUniform) {
        ctx.body.push(`vec2 ${v} = ${uv};`);
        ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec2' };
        return true;
      }

      ctx.uniforms.add(`uniform sampler2D ${texUniform};`);

      if (ctx.mode === 'vertex') {
        ctx.body.push(`vec2 ${v} = ${uv}; // Parallax only in Fragment`);
      } else {
        ctx.body.push(`vec3 ${v}_N = normalize(vNormal);`);
        ctx.body.push(`vec3 ${v}_T = normalize(vTangent);`);
        ctx.body.push(`vec3 ${v}_B = normalize(vBitangent);`);
        ctx.body.push(`mat3 ${v}_TBN = mat3(${v}_T, ${v}_B, ${v}_N);`);
        ctx.body.push(`vec3 ${v}_viewDirWS = normalize(u_cameraPosition - vPosition);`);
        ctx.body.push(`vec3 ${v}_viewDirTS = ${v}_viewDirWS * ${v}_TBN;`);
        ctx.body.push(`float ${v}_h = texture2D(${texUniform}, ${uv}).${channel};`);
        ctx.body.push(`float ${v}_h_centered = ${v}_h - 0.5;`);
        ctx.body.push(
          `vec2 ${v}_offset = ${v}_viewDirTS.xy * (${v}_h_centered * (${amplitude} * 0.1));`
        );
        ctx.body.push(`vec2 ${v} = ${uv} + ${v}_offset;`);
      }

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec2' };
      return true;
    },
  },
};
