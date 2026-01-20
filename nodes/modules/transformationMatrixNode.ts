import type { NodeModule } from '../types';

export const transformationMatrixNode: NodeModule = {
    type: 'transformationMatrix',
    definition: {
        type: 'transformationMatrix',
        label: 'Transformation Matrix',
        inputs: [],
        outputs: [{ id: 'out', label: '4x4', type: 'mat4' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: false },
        sections: [
            {
                id: 'settings',
                controls: [
                    {
                        id: 'type',
                        label: 'Type',
                        controlType: 'select',
                        bind: { scope: 'data', key: 'type' },
                        select: {
                            options: [
                                { label: 'Model', value: 'Model' },
                                { label: 'Inverse Model', value: 'Inverse Model' },
                                { label: 'View', value: 'View' },
                                { label: 'Inverse View', value: 'Inverse View' },
                                { label: 'Projection', value: 'Projection' },
                                { label: 'Inverse Projection', value: 'Inverse Projection' },
                                { label: 'View Projection', value: 'View Projection' },
                                { label: 'Inverse View Projection', value: 'Inverse View Projection' },
                            ],
                        },
                    },
                ],
            },
        ],
    },
    initialData: () => ({
        type: 'Model',
    }),
    glsl: {
        emit: ctx => {
            const type = (ctx.node.data.type || 'Model') as string;
            const v = ctx.varName(ctx.id);

            let uniformMap: Record<string, string> = {
                'Model': 'u_model',
                'Inverse Model': 'u_model_inv',
                'View': 'u_view',
                'Inverse View': 'u_view_inv',
                'Projection': 'u_projection',
                'Inverse Projection': 'u_projection_inv',
                'View Projection': 'u_viewProjection',
                'Inverse View Projection': 'u_viewProjection_inv',
            };

            const uniformName = uniformMap[type] || 'u_model';
            ctx.body.push(`mat4 ${v} = ${uniformName};`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'mat4' };
            return true;
        },
    },
};
