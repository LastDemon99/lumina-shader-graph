import type { NodeModule } from '../types';

export const ddyNode: NodeModule = {
    type: 'ddy',
    definition: {
        type: 'ddy',
        label: 'DDY',
        inputs: [
            { id: 'in', label: 'In', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: false },
        sections: [],
    },
    metadata: {
        requiresDerivatives: true,
    },
    glsl: {
        emit: ctx => {
            // Derivatives node only work in Fragment shader in WebGL 1.0
            if (ctx.mode === 'vertex') {
                const type = ctx.getDynamicType(['in']);
                const v = ctx.varName(ctx.id);
                const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
                ctx.body.push(`${type} ${v} = ${zero};`);
                ctx.variables[`${ctx.id}_out`] = { name: v, type };
                return true;
            }

            const type = ctx.getDynamicType(['in']);
            const val = ctx.getInput(ctx.id, 'in', '0.0', type);
            const v = ctx.varName(ctx.id);

            // dFdy is the GLSL equivalent for DDY
            ctx.body.push(`${type} ${v} = dFdy(${val});`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
