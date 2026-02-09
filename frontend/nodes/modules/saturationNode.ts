import type { NodeModule } from '../types';

export const saturationNode: NodeModule = {
    type: 'saturation',
    definition: {
        type: 'saturation',
        label: 'Saturation',
        inputs: [
            { id: 'in', label: 'In(3)', type: 'vec3' },
            { id: 'saturation', label: 'Saturation(1)', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }],
    },
    initialData: () => ({
        inputValues: {
            saturation: 1.0,
        }
    }),
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [
            {
                id: 'properties',
                controls: [
                    {
                        id: 'saturation',
                        label: 'Saturation',
                        controlType: 'float',
                        bind: { scope: 'inputValues', key: 'saturation' },
                        when: { kind: 'not', cond: { kind: 'connected', socketId: 'saturation', direction: 'input' } }
                    },
                ],
            },
        ],
    },
    glsl: {
        emit: ctx => {
            const i = ctx.getInput(ctx.id, 'in', 'vec3(1.0)', 'vec3');
            const sat = ctx.getInput(ctx.id, 'saturation', '1.0', 'float');
            const v = ctx.varName(ctx.id);

            // 1. Perceptual weights for REC709: (0.21, 0.71, 0.07)
            // 2. Grayscale via Dot Product
            // 3. Lerp original color with grayscale using Saturation as T

            ctx.body.push(`vec3 ${v}_weights = vec3(0.21, 0.71, 0.07);`);
            ctx.body.push(`float ${v}_gray = dot(${i}, ${v}_weights);`);
            ctx.body.push(`vec3 ${v} = mix(vec3(${v}_gray), ${i}, ${sat});`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
            return true;
        },
    },
};
