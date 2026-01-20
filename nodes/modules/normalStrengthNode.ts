import type { NodeModule } from '../types';

export const normalStrengthNode: NodeModule = {
    type: 'normalStrength',
    definition: {
        type: 'normalStrength',
        label: 'Normal Strength',
        inputs: [
            { id: 'in', label: 'In(3)', type: 'vec3' },
            { id: 'strength', label: 'Strength(1)', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }],
    },
    initialData: () => ({
        strength: 1.0,
    }),
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [
            {
                id: 'properties',
                controls: [
                    {
                        id: 'strength',
                        label: 'Strength',
                        controlType: 'float',
                        bind: { scope: 'data', key: 'strength' },
                        when: { kind: 'not', cond: { kind: 'connected', socketId: 'strength', direction: 'input' } }
                    }
                ]
            }
        ]
    },
    glsl: {
        emit: ctx => {
            const i = ctx.getInput(ctx.id, 'in', 'vec3(0.0, 0.0, 1.0)', 'vec3');
            const strength = ctx.getInput(ctx.id, 'strength', '1.0', 'float');
            const v = ctx.varName(ctx.id);

            // 1. Multiply XY by Strength
            // 2. Lerp Z between 1.0 and original Z using saturated Strength (clamp(0,1))
            // 3. Combine to vec3

            ctx.body.push(`vec2 ${v}_xy = ${i}.xy * ${strength};`);
            ctx.body.push(`float ${v}_z = mix(1.0, ${i}.z, clamp(${strength}, 0.0, 1.0));`);
            ctx.body.push(`vec3 ${v} = vec3(${v}_xy, ${v}_z);`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
            return true;
        },
    },
};
