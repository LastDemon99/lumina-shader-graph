import type { NodeModule } from '../types';

const TRIPLANAR_FUNCTION = `
vec4 triplanar(sampler2D tex, vec3 pos, vec3 normal, float tile, float blend) {
    // Calculate blending weights based on normal
    vec3 w = pow(abs(normal), vec3(blend));
    w /= (w.x + w.y + w.z);

    // Triplanar mapping UVs
    vec2 uvX = pos.zy * tile;
    vec2 uvY = pos.xz * tile;
    vec2 uvZ = pos.xy * tile;

    // Sample texture
    vec4 colX = texture2D(tex, uvX);
    vec4 colY = texture2D(tex, uvY);
    vec4 colZ = texture2D(tex, uvZ);

    // Blend
    return colX * w.x + colY * w.y + colZ * w.z;
}

vec4 triplanarNormal(sampler2D tex, vec3 pos, vec3 normal, float tile, float blend) {
    // Calculate blending weights
    vec3 w = pow(abs(normal), vec3(blend));
    w /= (w.x + w.y + w.z);

    // UVs
    vec2 uvX = pos.zy * tile;
    vec2 uvY = pos.xz * tile;
    vec2 uvZ = pos.xy * tile;

    // Sample Normal Map and Unpack from [0, 1] to [-1, 1]
    vec3 tX = texture2D(tex, uvX).xyz * 2.0 - 1.0;
    vec3 tY = texture2D(tex, uvY).xyz * 2.0 - 1.0;
    vec3 tZ = texture2D(tex, uvZ).xyz * 2.0 - 1.0;

    // Reorient normals to match the projection axis
    // X projection: normal map (X, Y) -> World (Z, Y). Normal is X.
    vec3 nX = vec3(tX.z, tX.y, tX.x);
    if (normal.x < 0.0) nX.x *= -1.0;

    // Y projection: normal map (X, Y) -> World (X, Z). Normal is Y.
    vec3 nY = vec3(tY.x, tY.z, tY.y);
    if (normal.y < 0.0) nY.y *= -1.0;

    // Z projection: normal map (X, Y) -> World (X, Y). Normal is Z.
    vec3 nZ = vec3(tZ.x, tZ.y, tZ.z);
    if (normal.z < 0.0) nZ.z *= -1.0;

    // Blend the reconstructed world-space normals
    vec3 blendedNormal = normalize(nX * w.x + nY * w.y + nZ * w.z);

    // Return as vec4 (usually expected as [0, 1] for preview, but we want it to be a vector)
    return vec4(blendedNormal, 1.0);
}
`;

export const triplanarNode: NodeModule = {
    type: 'triplanar',
    definition: {
        type: 'triplanar',
        label: 'Triplanar',
        inputs: [
            { id: 'texture', label: 'Texture', type: 'texture' },
            { id: 'sampler', label: 'Sampler', type: 'samplerState' },
            { id: 'position', label: 'Position', type: 'vec3' },
            { id: 'normal', label: 'Normal', type: 'vec3' },
            { id: 'tile', label: 'Tile', type: 'float' },
            { id: 'blend', label: 'Blend', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'vec4' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [
            {
                id: 'settings',
                controls: [
                    {
                        id: 'type',
                        label: 'Type',
                        controlType: 'select',
                        bind: { scope: 'data', key: 'type' },
                        select: {
                            options: [
                                { label: 'Default', value: 'Default' },
                                { label: 'Normal', value: 'Normal' },
                            ]
                        }
                    },
                    {
                        id: 'textureAsset',
                        label: 'Texture',
                        controlType: 'texture',
                        bind: { scope: 'data', key: 'textureAsset' },
                    }
                ]
            }
        ],
    },
    socketRules: {
        // If a texture is connected to the input socket, hide the internal texture picker logic or handle precedence
        // For now, allow both but input takes precedence in GLSL.
    },
    initialData: () => ({
        type: 'Default',
        tile: 1.0,
        blend: 1.0,
    }),
    metadata: {
        isTextureSampler: true,
    },
    glsl: {
        emit: ctx => {
            ctx.functions.add(TRIPLANAR_FUNCTION);

            const type = (ctx.node.data.type || 'Default') as string;
            const texName = ctx.getTextureUniformName(ctx.id);

            // Defaults
            // Position default: vPosition (World Space)
            // Normal default: vNormal (World Space)

            let pos = 'vPosition';
            if (ctx.mode === 'vertex') pos = 'position'; // Fallback if used in vertex (though triplanar usually fragment)

            const inPos = ctx.getInput(ctx.id, 'position', pos, 'vec3');

            let norm = 'vNormal';
            if (ctx.mode === 'vertex') norm = 'normal';

            const inNorm = ctx.getInput(ctx.id, 'normal', norm, 'vec3');

            const tile = ctx.getInput(ctx.id, 'tile', '1.0', 'float');
            const blend = ctx.getInput(ctx.id, 'blend', '1.0', 'float');

            const v = ctx.varName(ctx.id);

            // Ensure texture uniform exists (handled by isTextureSampler metadata usually, but we need the variable name)
            ctx.uniforms.add(`uniform sampler2D ${texName};`);

            if (type === 'Normal') {
                ctx.body.push(`vec4 ${v} = triplanarNormal(${texName}, ${inPos}, ${inNorm}, ${tile}, ${blend});`);
            } else {
                ctx.body.push(`vec4 ${v} = triplanar(${texName}, ${inPos}, ${inNorm}, ${tile}, ${blend});`);
            }

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
            return true;
        },
    },
};
