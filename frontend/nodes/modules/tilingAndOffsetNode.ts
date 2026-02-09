import type { NodeModule } from '../types';

export const tilingAndOffsetNode: NodeModule = {
    type: 'tilingAndOffset',
    definition: {
        type: 'tilingAndOffset',
        label: 'Tiling And Offset',
        inputs: [
            { id: 'uv', label: 'UV', type: 'vec2' },
            { id: 'tiling', label: 'Tiling', type: 'vec2' },
            { id: 'offset', label: 'Offset', type: 'vec2' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'vec2' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [],
    },
    glsl: {
        emit: ctx => {
            const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
            const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
            const tiling = ctx.getInput(ctx.id, 'tiling', 'vec2(1.0, 1.0)', 'vec2');
            const offset = ctx.getInput(ctx.id, 'offset', 'vec2(0.0, 0.0)', 'vec2');

            const v = ctx.varName(ctx.id);

            // "The Tiling And Offset node multiplies the UVs by the Tiling value and then adds the Offset value."
            // Formula: Out = UV * Tiling + Offset

            ctx.body.push(`vec2 ${v} = ${uv} * ${tiling} + ${offset};`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec2' };
            return true;
        },
    },
};
