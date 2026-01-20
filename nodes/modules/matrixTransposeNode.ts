import type { NodeModule } from '../types';

export const matrixTransposeNode: NodeModule = {
    type: 'matrixTranspose',
    definition: {
        type: 'matrixTranspose',
        label: 'Matrix Transpose',
        inputs: [
            { id: 'in', label: 'In', type: 'mat4' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'mat4' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: false },
        sections: [],
    },
    glsl: {
        emit: ctx => {
            // Determine actual input type by looking at the connection
            const inputConn = ctx.connections.find(c => c.targetNodeId === ctx.id && c.targetSocketId === 'in');
            let type: 'mat2' | 'mat3' | 'mat4' = 'mat4';
            let inVarName = '';

            if (inputConn) {
                const sourceVar = ctx.variables[`${inputConn.sourceNodeId}_${inputConn.sourceSocketId}`];
                if (sourceVar) {
                    type = (sourceVar.type as any) || 'mat4';
                    inVarName = sourceVar.name;
                }
            }

            // Fallback if not connected
            if (!inVarName) {
                inVarName = 'mat4(1.0)';
                type = 'mat4';
            }

            const v = ctx.varName(ctx.id);

            // Use the transpose polyfills added to the glslGenerator header
            ctx.body.push(`${type} ${v} = transpose(${inVarName});`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
