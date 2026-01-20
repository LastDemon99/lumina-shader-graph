import type { NodeModule } from '../types';

export const sawtoothWaveNode: NodeModule = {
    type: 'sawtoothWave',
    definition: {
        type: 'sawtoothWave',
        label: 'Sawtooth Wave',
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

            // Out = 2.0 * (In - floor(In + 0.5))
            // This produces a ramp that goes from -1 to 1 with a period of 1.0.

            const half = type === 'float' ? '0.5' : `${type}(0.5)`;
            const two = type === 'float' ? '2.0' : `${type}(2.0)`;

            ctx.body.push(`${type} ${v} = ${two} * (${val} - floor(${val} + ${half}));`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
