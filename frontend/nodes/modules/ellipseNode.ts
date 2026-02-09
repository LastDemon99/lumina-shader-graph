import type { NodeModule } from '../types';

export const ellipseNode: NodeModule = {
    type: 'ellipse',
    definition: {
        type: 'ellipse',
        label: 'Ellipse',
        inputs: [
            { id: 'uv', label: 'UV(2)', type: 'vec2' },
            { id: 'width', label: 'Width(1)', type: 'float' },
            { id: 'height', label: 'Height(1)', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }],
    },
    initialData: () => ({
        inputValues: {
            uv: 'UV0',
            width: 0.5,
            height: 0.5,
        }
    }),
    metadata: {
        requiresDerivatives: true,
    },
    glsl: {
        emit: ctx => {
            const uv = ctx.getInput(ctx.id, 'uv', 'vUv', 'vec2');
            const width = ctx.getInput(ctx.id, 'width', '0.5', 'float');
            const height = ctx.getInput(ctx.id, 'height', '0.5', 'float');
            const v = ctx.varName(ctx.id);

            // 1. Remap UV to [-1, 1] range centered at 0
            // 2. Scale by Width and Height
            // 3. Calculate length
            // 4. Apply antialiasing using fwidth (derivatives)

            ctx.body.push(`vec2 ${v}_pos = (${uv} - 0.5) * 2.0;`);
            ctx.body.push(`float ${v}_d = length(${v}_pos / vec2(max(${width}, 0.0001), max(${height}, 0.0001)));`);

            // Antialiasing: (1.0 - distance) / delta
            // fwidth provides the approximate screen-space change rate for smooth edges
            ctx.body.push(`float ${v} = clamp((1.0 - ${v}_d) / max(fwidth(${v}_d), 0.0001), 0.0, 1.0);`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        },
    },
};
