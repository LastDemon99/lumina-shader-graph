import type { NodeModule } from '../types';

export const normalFromTextureNode: NodeModule = {
    type: 'normalFromTexture',
    definition: {
        type: 'normalFromTexture',
        label: 'Normal From Texture',
        inputs: [
            { id: 'texture', label: 'Texture(T2)', type: 'texture' },
            { id: 'uv', label: 'UV(2)', type: 'vec2' },
            { id: 'sampler', label: 'Sampler(SS)', type: 'samplerState' },
            { id: 'offset', label: 'Offset(1)', type: 'float' },
            { id: 'strength', label: 'Strength(1)', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out(4)', type: 'vec4' }],
    },
    initialData: () => ({
        textureAsset: undefined,
        textureType: 'Normal', // Becomes 'Normal' by default
        offset: 0.5,
        strength: 5.0,
    }),
    ui: {
        width: 'normal',
        preview: { enabled: true },
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
    metadata: {
        isTextureSampler: true,
    },
    glsl: {
        emit: ctx => {
            const conn = ctx.connections.find(c => c.targetNodeId === ctx.id && c.targetSocketId === 'texture');
            const sourceId = conn ? conn.sourceNodeId : ctx.id;
            const texUniform = ctx.getTextureUniformName?.(sourceId);

            const v = ctx.varName(ctx.id);

            if (!texUniform) {
                ctx.body.push(`vec4 ${v} = vec4(0.0, 0.0, 1.0, 1.0);`);
                ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
                return true;
            }

            ctx.uniforms.add(`uniform sampler2D ${texUniform};`);

            const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
            const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
            const offset = ctx.getInput(ctx.id, 'offset', '0.5', 'float');
            const strength = ctx.getInput(ctx.id, 'strength', '5.0', 'float');

            const d = `${v}_d`;
            ctx.body.push(`float ${d} = pow(${offset}, 3.0) * 0.1;`);

            const h_c = `${v}_hc`;
            const h_x = `${v}_hx`;
            const h_y = `${v}_hy`;

            if (ctx.mode === 'vertex') {
                ctx.body.push(`vec4 ${v} = vec4(0.0, 0.0, 1.0, 1.0);`);
            } else {
                ctx.body.push(`float ${h_c} = texture2D(${texUniform}, ${uv}).r;`);
                ctx.body.push(`float ${h_x} = texture2D(${texUniform}, ${uv} + vec2(${d}, 0.0)).r;`);
                ctx.body.push(`float ${h_y} = texture2D(${texUniform}, ${uv} + vec2(0.0, ${d})).r;`);

                const dx = `(${h_x} - ${h_c}) * ${strength}`;
                const dy = `(${h_y} - ${h_c}) * ${strength}`;
                const tanNormal = `normalize(vec3(-(${dx}), -(${dy}), 1.0))`;

                // Produced as vec4 with alpha 1.0, internally handled as 'Normal' ([-1, 1] range)
                ctx.body.push(`vec4 ${v} = vec4(${tanNormal}, 1.0);`);
            }

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
            return true;
        },
    },
};
