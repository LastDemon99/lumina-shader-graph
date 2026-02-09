import type { NodeModule } from '../types';

export const matrixSplitNode: NodeModule = {
    type: 'matrixSplit',
    definition: {
        type: 'matrixSplit',
        label: 'Matrix Split',
        inputs: [
            { id: 'in', label: 'In', type: 'mat4' },
        ],
        outputs: [
            { id: 'm0', label: 'M0', type: 'vec4' },
            { id: 'm1', label: 'M1', type: 'vec4' },
            { id: 'm2', label: 'M2', type: 'vec4' },
            { id: 'm3', label: 'M3', type: 'vec4' },
        ],
    },
    ui: {
        width: 'normal',
        preview: { enabled: false },
        sections: [
            {
                id: 'settings',
                controls: [
                    {
                        id: 'mode',
                        label: 'Mode',
                        controlType: 'select',
                        bind: { scope: 'data', key: 'mode' },
                        select: {
                            options: [
                                { label: 'Row', value: 'Row' },
                                { label: 'Column', value: 'Column' },
                            ],
                        },
                    },
                ],
            },
        ],
    },
    initialData: () => ({
        mode: 'Row',
    }),
    glsl: {
        emit: ctx => {
            const mode = (ctx.node.data.mode || 'Row') as string;

            // Determine actual input type by looking at the connection
            const inputConn = ctx.connections.find(c => c.targetNodeId === ctx.id && c.targetSocketId === 'in');
            let inType: 'mat2' | 'mat3' | 'mat4' = 'mat4';
            let inVarName = '';

            if (inputConn) {
                const sourceVar = ctx.variables[`${inputConn.sourceNodeId}_${inputConn.sourceSocketId}`];
                if (sourceVar) {
                    inType = (sourceVar.type as any) || 'mat4';
                    inVarName = sourceVar.name;
                }
            }

            // If not connected or type unknown, fallback to identity mat4
            if (!inVarName) {
                inVarName = 'mat4(1.0)';
                inType = 'mat4';
            }

            const size = inType === 'mat2' ? 2 : inType === 'mat3' ? 3 : 4;
            const outType = inType === 'mat2' ? 'vec2' : inType === 'mat3' ? 'vec3' : 'vec4';

            const outputIds = ['m0', 'm1', 'm2', 'm3'];

            for (let i = 0; i < 4; i++) {
                const socketId = outputIds[i];
                const v = ctx.varName(ctx.id, socketId);

                if (i < size) {
                    if (mode === 'Column') {
                        // Easy: just access the column
                        ctx.body.push(`${outType} ${v} = ${inVarName}[${i}];`);
                    } else {
                        // Row access: construct vector from components of each column
                        const components = [];
                        for (let j = 0; j < size; j++) {
                            components.push(`${inVarName}[${j}][${i}]`);
                        }
                        ctx.body.push(`${outType} ${v} = ${outType}(${components.join(', ')});`);
                    }
                } else {
                    // Fill unused outputs with zero
                    ctx.body.push(`${outType} ${v} = ${outType}(0.0);`);
                }

                ctx.variables[`${ctx.id}_${socketId}`] = { name: v, type: outType };
            }

            return true;
        },
    },
};
