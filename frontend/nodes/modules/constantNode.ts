import type { NodeModule } from '../types';

export const constantNode: NodeModule = {
    type: 'constant',
    definition: {
        type: 'constant',
        label: 'Constant',
        inputs: [],
        outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: false },
        sections: [
            {
                id: 'main',
                controls: [
                    {
                        id: 'constant',
                        label: 'Constant',
                        controlType: 'select',
                        bind: { scope: 'data', key: 'constant' },
                        select: {
                            options: [
                                { label: 'PI', value: 'PI' },
                                { label: 'TAU', value: 'TAU' },
                                { label: 'PHI', value: 'PHI' },
                                { label: 'E', value: 'E' },
                                { label: 'SQRT2', value: 'SQRT2' },
                            ],
                        },
                    },
                ],
            },
        ],
    },
    initialData: () => ({
        constant: 'PI',
    }),
    glsl: {
        emit: ctx => {
            const constant = (ctx.node.data.constant || 'PI') as string;
            const v = ctx.varName(ctx.id);
            ctx.body.push(`float ${v} = ${constant};`);
            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        },
    },
};
