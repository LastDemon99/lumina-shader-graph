import type { NodeModule } from '../types';

export const parallaxOcclusionMappingNode: NodeModule = {
    type: 'parallaxOcclusionMapping',
    definition: {
        type: 'parallaxOcclusionMapping',
        label: 'Parallax Occlusion Mapping',
        inputs: [
            { id: 'texture', label: 'Heightmap(T2)', type: 'texture' },
            { id: 'amplitude', label: 'Amplitude(1)', type: 'float', default: '1.0' },
            { id: 'steps', label: 'Steps(1)', type: 'float', default: '5.0' },
            { id: 'uv', label: 'UVs(2)', type: 'vec2' },
            { id: 'tiling', label: 'Tiling(2)', type: 'vec2', default: 'vec2(1.0, 1.0)' },
            { id: 'offset', label: 'Offset(2)', type: 'vec2', default: 'vec2(0.0, 0.0)' },
            { id: 'primitiveSize', label: 'PrimitiveSize(2)', type: 'vec2', default: 'vec2(1.0, 1.0)' },
            { id: 'lod', label: 'LOD(1)', type: 'float', default: '0.0' },
            { id: 'lodThreshold', label: 'LODThreshold(1)', type: 'float', default: '0.0' },
        ],
        outputs: [
            { id: 'pixelDepthOffset', label: 'PixelDepthOffset(1)', type: 'float' },
            { id: 'parallaxUVs', label: 'ParallaxUVs(2)', type: 'vec2' },
        ],
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
                                { label: 'Red', value: 'r' },
                                { label: 'Green', value: 'g' },
                                { label: 'Blue', value: 'b' },
                                { label: 'Alpha', value: 'a' },
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
        inputValues: {
            tiling: { x: 1, y: 1 },
            primitiveSize: { x: 1, y: 1 },
        },
    }),
    metadata: {
        isTextureSampler: true,
        requiresLod: true,
    },
    glsl: {
        emit: ctx => {
            const uv = ctx.getInput(ctx.id, 'uv', ctx.mode === 'vertex' ? 'uv' : 'vUv', 'vec2');
            const amplitude = ctx.getInput(ctx.id, 'amplitude', '1.0', 'float');
            const steps = ctx.getInput(ctx.id, 'steps', '5.0', 'float');
            const tiling = ctx.getInput(ctx.id, 'tiling', 'vec2(1.0, 1.0)', 'vec2');
            const offset = ctx.getInput(ctx.id, 'offset', 'vec2(0.0, 0.0)', 'vec2');
            const _lod = ctx.getInput(ctx.id, 'lod', '0.0', 'float');
            const _lodThreshold = ctx.getInput(ctx.id, 'lodThreshold', '0.0', 'float');
            const _primSize = ctx.getInput(ctx.id, 'primitiveSize', 'vec2(1.0, 1.0)', 'vec2');

            const texUniform = ctx.getTextureUniformName?.(ctx.id);
            const channel = (ctx.node.data.parallaxChannel || 'g') as string;
            const v = ctx.varName(ctx.id);

            if (!texUniform) {
                ctx.body.push(`vec2 ${v}_uv = ${uv};`);
                ctx.body.push(`float ${v}_pdo = 0.0;`);
                ctx.variables[`${ctx.id}_parallaxUVs`] = { name: `${v}_uv`, type: 'vec2' };
                ctx.variables[`${ctx.id}_pixelDepthOffset`] = { name: `${v}_pdo`, type: 'float' };
                ctx.variables[`${ctx.id}_out`] = ctx.variables[`${ctx.id}_parallaxUVs`];
                return true;
            }

            ctx.uniforms.add(`uniform sampler2D ${texUniform};`);

            if (ctx.mode === 'vertex') {
                ctx.body.push(`vec2 ${v}_uv = ${uv};`);
                ctx.body.push(`float ${v}_pdo = 0.0;`);
            } else {
                ctx.body.push(`vec3 ${v}_N = normalize(vNormal);`);
                ctx.body.push(`vec3 ${v}_T = normalize(vTangent);`);
                ctx.body.push(`vec3 ${v}_B = normalize(vBitangent);`);
                ctx.body.push(`mat3 ${v}_TBN = mat3(${v}_T, ${v}_B, ${v}_N);`);
                ctx.body.push(`vec3 ${v}_viewDirWS = normalize(u_cameraPosition - vPosition);`);
                ctx.body.push(`vec3 ${v}_viewDirTS = ${v}_viewDirWS * ${v}_TBN;`);

                ctx.body.push(`float ${v}_numSteps = clamp(${steps}, 1.0, 100.0);`);

                // Calculate parallax vector matching Parallax Mapping scale
                ctx.body.push(`float ${v}_viewDirZ = max(abs(${v}_viewDirTS.z), 0.001);`);
                ctx.body.push(`vec2 ${v}_P = ${v}_viewDirTS.xy * (${amplitude} * 0.1) / ${v}_viewDirZ;`);

                ctx.body.push(`float ${v}_layerHeight = 1.0 / ${v}_numSteps;`);
                ctx.body.push(`vec2 ${v}_dtex = ${v}_P / ${v}_numSteps;`);

                // Apply tiling and offset to base UV
                ctx.body.push(`vec2 ${v}_baseUV = ${uv} * ${tiling} + ${offset};`);

                // KEY FIX: Use same formula as Parallax Mapping (h - 0.5) * amplitude
                // This ensures high areas offset in one direction, low areas in the opposite
                // Instead of raymarching, we use the heightmap to directly compute offset
                // matching the simple parallax behavior but with iterative refinement

                ctx.body.push(`float ${v}_currentLayerHeight = 0.0;`);
                ctx.body.push(`vec2 ${v}_currentTexCoords = ${v}_baseUV;`);

                // Sample height and compute offset like simple parallax
                ctx.body.push(`float ${v}_h = texture2D_LOD(${texUniform}, ${v}_currentTexCoords, 0.0).${channel};`);

                // Iterative parallax - refine the UV based on the height at each step
                // This matches simple parallax direction: (h - 0.5) means high pushes positive, low pushes negative
                ctx.body.push(`for(int i = 0; i < 100; i++) {`);
                ctx.body.push(`    if (float(i) >= ${v}_numSteps) break;`);
                ctx.body.push(`    float ${v}_h_centered = ${v}_h - 0.5;`);
                ctx.body.push(`    vec2 ${v}_stepOffset = ${v}_viewDirTS.xy * (${v}_h_centered * (${amplitude} * 0.1) / ${v}_numSteps);`);
                ctx.body.push(`    ${v}_currentTexCoords = ${v}_currentTexCoords + ${v}_stepOffset;`);
                ctx.body.push(`    ${v}_h = texture2D_LOD(${texUniform}, ${v}_currentTexCoords, 0.0).${channel};`);
                ctx.body.push(`}`);

                ctx.body.push(`vec2 ${v}_uv = ${v}_currentTexCoords;`);
                ctx.body.push(`float ${v}_pdo = ${v}_h;`);
            }

            ctx.variables[`${ctx.id}_parallaxUVs`] = { name: `${v}_uv`, type: 'vec2' };
            ctx.variables[`${ctx.id}_pixelDepthOffset`] = { name: `${v}_pdo`, type: 'float' };
            ctx.variables[`${ctx.id}_out`] = ctx.variables[`${ctx.id}_parallaxUVs`];
            return true;
        },
    },
};
