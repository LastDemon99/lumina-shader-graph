import type { NodeModule } from '../types';

export const normalFromHeightNode: NodeModule = {
    type: 'normalFromHeight',
    definition: {
        type: 'normalFromHeight',
        label: 'Normal From Height',
        inputs: [
            { id: 'in', label: 'In(1)', type: 'float' },
            { id: 'strength', label: 'Strength(1)', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }],
    },
    initialData: () => ({
        outputSpace: 'Tangent',
    }),
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [
            {
                id: 'settings',
                title: 'Settings',
                controls: [
                    {
                        id: 'outputSpace',
                        label: 'Output Space',
                        controlType: 'select',
                        bind: { scope: 'data', key: 'outputSpace' },
                        select: {
                            options: [
                                { label: 'Tangent', value: 'Tangent' },
                                { label: 'World', value: 'World' },
                            ],
                        },
                    },
                ],
            },
        ],
    },
    metadata: {
        requiresDerivatives: true,
        isDataVector: true,
    },
    glsl: {
        emit: ctx => {
            if (ctx.mode === 'vertex') {
                const v = ctx.varName(ctx.id);
                ctx.body.push(`vec3 ${v} = vec3(0.0, 0.0, 1.0);`);
                ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
                return true;
            }

            const space = (ctx.node.data.outputSpace as string) || 'Tangent';
            const h = ctx.getInput(ctx.id, 'in', '0.0', 'float');
            const strength = ctx.getInput(ctx.id, 'strength', '0.01', 'float');
            const v = ctx.varName(ctx.id);

            // Normal From Height using screen-space derivatives (dFdx, dFdy)
            // This calculates the gradient of height relative to screen pixels.
            ctx.body.push(`float ${v}_dx = dFdx(${h});`);
            ctx.body.push(`float ${v}_dy = dFdy(${h});`);

            // Standard reconstruction (Tangent Space):
            // We use a constant divisor (or multiplier for strength) to make the default 
            // strength feel natural relative to screen-space changes.
            const tanNormal = `vec3(-${v}_dx * ${strength} * 500.0, -${v}_dy * ${strength} * 500.0, 1.0)`;

            if (space === 'Tangent') {
                ctx.body.push(`vec3 ${v} = normalize(${tanNormal});`);
            } else {
                // World Space Transformation
                // worldNormal = tangentNormal.x * vTangent + tangentNormal.y * vBitangent + tangentNormal.z * vNormal
                const rawTan = `${v}_tan`;
                ctx.body.push(`vec3 ${rawTan} = ${tanNormal};`);
                ctx.body.push(`vec3 ${v} = normalize(${rawTan}.x * vTangent + ${rawTan}.y * vBitangent + ${rawTan}.z * vNormal);`);
            }

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
            return true;
        },
    },
};
