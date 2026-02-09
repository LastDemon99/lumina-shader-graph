import type { NodeModule } from '../types';

export const squareWaveNode: NodeModule = {
    type: 'squareWave',
    definition: {
        type: 'squareWave',
        label: 'Square Wave',
        inputs: [
            { id: 'in', label: 'In', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [],
    },
    glsl: {
        emit: ctx => {
            const type = ctx.getDynamicType(['in']);
            const val = ctx.getInput(ctx.id, 'in', '0.0', type);
            const v = ctx.varName(ctx.id);

            // 1. fract(t) -> range [0, 1]
            // 2. round(f) -> 0 if f < 0.5, 1 if f >= 0.5 (using floor(x+0.5) for GLSL 1.0)
            // 3. 1.0 - 2.0 * r -> oscillates between 1 (first half) and -1 (second half)

            const half = type === 'float' ? '0.5' : `${type}(0.5)`;
            const two = type === 'float' ? '2.0' : `${type}(2.0)`;
            const one = type === 'float' ? '1.0' : `${type}(1.0)`;

            ctx.body.push(`${type} ${v} = ${one} - ${two} * floor(fract(${val}) + ${half});`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
