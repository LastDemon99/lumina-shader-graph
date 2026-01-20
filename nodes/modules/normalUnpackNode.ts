import type { NodeModule } from '../types';

export const normalUnpackNode: NodeModule = {
    type: 'normalUnpack',
    definition: {
        type: 'normalUnpack',
        label: 'Normal Unpack',
        inputs: [{ id: 'in', label: 'In(4)', type: 'vec4' }],
        outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [
            {
                id: 'properties',
                controls: [
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
                    },
                ],
            },
        ],
    },
    initialData: () => ({
        space: 'Tangent',
    }),
    metadata: {
        isDataVector: true,
    },
    glsl: {
        emit: ctx => {
            const i = ctx.getInput(ctx.id, 'in', 'vec4(0.0, 0.0, 0.0, 1.0)', 'vec4');
            const v = ctx.varName(ctx.id);
            const space = ctx.node.data.space || 'Tangent';

            if (space === 'Tangent') {
                // Tangent Space: Ag -> Reconstruct Z
                // 1. Extract X from Alpha and Y from Green
                // 2. Remap from [0, 1] to [-1, 1]
                // 3. Reconstruct Z component
                ctx.body.push(`vec2 ${v}_xy = vec2(${i}.a, ${i}.g) * 2.0 - 1.0;`);
                ctx.body.push(`float ${v}_d2 = clamp(dot(${v}_xy, ${v}_xy), 0.0, 1.0);`);
                ctx.body.push(`float ${v}_z = sqrt(1.0 - ${v}_d2);`);
                ctx.body.push(`vec3 ${v} = normalize(vec3(${v}_xy, ${v}_z));`);
            } else {
                // Object Space: Standard RGB Unpack
                // Expands the range from [0, 1] to [-1, 1]
                ctx.body.push(`vec3 ${v} = normalize(${i}.rgb * 2.0 - 1.0);`);
            }

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
            return true;
        },
    },
};
