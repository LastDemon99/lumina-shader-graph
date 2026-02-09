import type { NodeModule } from '../types';

export const comparisonNode: NodeModule = {
    type: 'comparison',
    definition: {
        type: 'comparison',
        label: 'Comparison',
        inputs: [
            { id: 'a', label: 'A', type: 'float' },
            { id: 'b', label: 'B', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    },
    initialData: () => ({
        comparisonType: 'Equal',
    }),
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [
            {
                id: 'settings',
                controls: [
                    {
                        id: 'comparisonType',
                        label: 'Type',
                        controlType: 'select',
                        bind: { scope: 'data', key: 'comparisonType' },
                        select: {
                            options: [
                                { label: 'Equal', value: 'Equal' },
                                { label: 'Not Equal', value: 'NotEqual' },
                                { label: 'Greater Than', value: 'GreaterThan' },
                                { label: 'Greater Or Equal', value: 'GreaterOrEqual' },
                                { label: 'Less Than', value: 'LessThan' },
                                { label: 'Less Or Equal', value: 'LessOrEqual' },
                            ]
                        }
                    }
                ]
            }
        ]
    },
    glsl: {
        emit: ctx => {
            const type = ctx.getDynamicType?.(['a', 'b']) ?? 'float';
            const a = ctx.getInput(ctx.id, 'a', '0.0', type);
            const b = ctx.getInput(ctx.id, 'b', '0.0', type);
            const comparisonType = ctx.node.data.comparisonType || 'Equal';
            const v = ctx.varName(ctx.id);

            let op = '==';
            switch (comparisonType) {
                case 'Equal': op = '=='; break;
                case 'NotEqual': op = '!='; break;
                case 'GreaterThan': op = '>'; break;
                case 'GreaterOrEqual': op = '>='; break;
                case 'LessThan': op = '<'; break;
                case 'LessOrEqual': op = '<='; break;
            }

            // Comparison results in boolean-like float (1.0 or 0.0)
            // WebGL 1.0 doesn't support vector comparisons directly with operators in all cases,
            // and we want a float result for visibility.
            if (type === 'float') {
                ctx.body.push(`float ${v} = (${a} ${op} ${b}) ? 1.0 : 0.0;`);
            } else {
                ctx.body.push(`float ${v} = (all(${type === 'vec2' ? 'equal' : type === 'vec3' ? 'equal' : 'equal'}(${a}, ${b}))) ? 1.0 : 0.0;`);
            }

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        },
    },
};
