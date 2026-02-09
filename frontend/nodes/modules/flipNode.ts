import type { NodeModule } from '../types';

export const flipNode: NodeModule = {
    type: 'flip',
    definition: {
        type: 'flip',
        label: 'Flip',
        inputs: [
            { id: 'in', label: 'In', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [
            {
                id: 'channels',
                controls: [
                    {
                        id: 'flipRed',
                        label: 'Red',
                        controlType: 'toggle',
                        bind: { scope: 'data', key: 'flipRed' },
                    },
                    {
                        id: 'flipGreen',
                        label: 'Green',
                        controlType: 'toggle',
                        bind: { scope: 'data', key: 'flipGreen' },
                    },
                    {
                        id: 'flipBlue',
                        label: 'Blue',
                        controlType: 'toggle',
                        bind: { scope: 'data', key: 'flipBlue' },
                    },
                    {
                        id: 'flipAlpha',
                        label: 'Alpha',
                        controlType: 'toggle',
                        bind: { scope: 'data', key: 'flipAlpha' },
                    },
                ],
            },
        ],
    },
    initialData: () => ({
        flipRed: false,
        flipGreen: false,
        flipBlue: false,
        flipAlpha: false,
    }),
    glsl: {
        emit: ctx => {
            const type = ctx.getDynamicType(['in']);
            const val = ctx.getInput(ctx.id, 'in', '0.0', type);
            const v = ctx.varName(ctx.id);

            const r = ctx.node.data.flipRed ? '-1.0' : '1.0';
            const g = ctx.node.data.flipGreen ? '-1.0' : '1.0';
            const b = ctx.node.data.flipBlue ? '-1.0' : '1.0';
            const a = ctx.node.data.flipAlpha ? '-1.0' : '1.0';

            if (type === 'float') {
                ctx.body.push(`float ${v} = ${val} * (${r});`);
            } else if (type === 'vec2') {
                ctx.body.push(`vec2 ${v} = ${val} * vec2(${r}, ${g});`);
            } else if (type === 'vec3') {
                ctx.body.push(`vec3 ${v} = ${val} * vec3(${r}, ${g}, ${b});`);
            } else if (type === 'vec4') {
                ctx.body.push(`vec4 ${v} = ${val} * vec4(${r}, ${g}, ${b}, ${a});`);
            }

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
