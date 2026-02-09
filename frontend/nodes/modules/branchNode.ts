import type { NodeModule } from '../types';

export const branchNode: NodeModule = {
    type: 'branch',
    definition: {
        type: 'branch',
        label: 'Branch',
        inputs: [
            { id: 'predicate', label: 'Predicate', type: 'float' },
            { id: 'true', label: 'True', type: 'float' },
            { id: 'false', label: 'False', type: 'float' },
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
            const type = ctx.getDynamicType?.(['true', 'false']) ?? 'float';
            const zero = type === 'float' ? '0.0' : `${type}(0.0)`;

            const predicate = ctx.getInput(ctx.id, 'predicate', '0.0', 'float');
            const t = ctx.getInput(ctx.id, 'true', zero, type);
            const f = ctx.getInput(ctx.id, 'false', zero, type);
            const v = ctx.varName(ctx.id);

            // Uses ternary for efficiency in GLSL
            ctx.body.push(`${type} ${v} = (${predicate} > 0.5) ? ${t} : ${f};`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
