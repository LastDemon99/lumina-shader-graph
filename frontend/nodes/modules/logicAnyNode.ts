import type { NodeModule } from '../types';

export const logicAnyNode: NodeModule = {
    type: 'any',
    definition: {
        type: 'any',
        label: 'Any',
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
            const type = ctx.getDynamicType?.(['in']) ?? 'float';
            const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
            const i = ctx.getInput(ctx.id, 'in', zero, type);
            const v = ctx.varName(ctx.id);

            if (type === 'float') {
                ctx.body.push(`float ${v} = (${i} > 0.5) ? 1.0 : 0.0;`);
            } else {
                // any() for vectors checks if any component is true.
                // We use component > 0.5 to simulate boolean behavior.
                const comps = type === 'vec2' ? 'xy' : type === 'vec3' ? 'xyz' : 'xyzw';
                ctx.body.push(`float ${v} = (any(greaterThan(${i}, ${type}(0.5)))) ? 1.0 : 0.0;`);
            }

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        },
    },
};
