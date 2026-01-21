import type { NodeModule } from '../types';

export const isFrontFaceNode: NodeModule = {
    type: 'isFrontFace',
    definition: {
        type: 'isFrontFace',
        label: 'Is Front Face',
        inputs: [],
        outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: false }, // Doesn't make sense in preview
        sections: [],
    },
    metadata: {
        isSourceNode: true,
    },
    glsl: {
        emit: ctx => {
            const v = ctx.varName(ctx.id);

            // In WebGL 1.0 Fragment Shader, gl_FrontFacing is available if the extension is supported or natively.
            // Note: gl_FrontFacing is a bool.
            if (ctx.mode === 'fragment') {
                ctx.body.push(`float ${v} = gl_FrontFacing ? 1.0 : 0.0;`);
            } else {
                ctx.body.push(`float ${v} = 1.0;`); // Always front in vertex shader
            }

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        },
    },
};
