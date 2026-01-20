import type { NodeModule } from '../types';

export const noiseSineWaveNode: NodeModule = {
    type: 'noiseSineWave',
    definition: {
        type: 'noiseSineWave',
        label: 'Noise Sine Wave',
        inputs: [
            { id: 'in', label: 'In', type: 'float' },
            { id: 'minMax', label: 'Min Max', type: 'vec2' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [],
    },
    initialData: () => ({
        minMax: { x: -0.1, y: 0.1 },
    }),
    glsl: {
        emit: ctx => {
            const type = ctx.getDynamicType(['in']);
            const val = ctx.getInput(ctx.id, 'in', '0.0', type);
            const mm = ctx.getInput(ctx.id, 'minMax', 'vec2(-0.1, 0.1)', 'vec2');
            const v = ctx.varName(ctx.id);

            // 1. Calculate base sine wave
            ctx.body.push(`${type} ${v}_sin1 = sin(${val});`);

            // 2. Calculate secondary sine wave for noise seed variance
            const one = type === 'float' ? '1.0' : `${type}(1.0)`;
            ctx.body.push(`${type} ${v}_sin2 = sin(${val} + ${one});`);

            // 3. Derive pseudo-random noise from the difference
            // The diagram shows (sin1 - sin2) * 91.1 (from 12.9+78.2) * 43758.5453
            ctx.body.push(`${type} ${v}_rnd = fract((${v}_sin1 - ${v}_sin2) * 91.1 * 43758.5453);`);

            // 4. Lerp noise by Min Max range and add to base wave
            const mmX = type === 'float' ? `${mm}.x` : `${type}(${mm}.x)`;
            const mmY = type === 'float' ? `${mm}.y` : `${type}(${mm}.y)`;
            ctx.body.push(`${type} ${v} = ${v}_sin1 + mix(${mmX}, ${mmY}, ${v}_rnd);`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
