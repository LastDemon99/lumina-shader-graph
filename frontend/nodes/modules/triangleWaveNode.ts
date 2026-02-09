import type { NodeModule } from '../types';

export const triangleWaveNode: NodeModule = {
    type: 'triangleWave',
    definition: {
        type: 'triangleWave',
        label: 'Triangle Wave',
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

            // Out = 2.0 * abs(2.0 * (In - floor(In + 0.5))) - 1.0
            // This creates a triangle wave oscillating between -1 and 1.

            const half = type === 'float' ? '0.5' : `${type}(0.5)`;
            const two = type === 'float' ? '2.0' : `${type}(2.0)`;
            const one = type === 'float' ? '1.0' : `${type}(1.0)`;

            ctx.body.push(`${type} ${v} = ${two} * abs(${two} * (${val} - floor(${val} + ${half}))) - ${one};`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
