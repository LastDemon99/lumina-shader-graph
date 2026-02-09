import type { NodeModule } from '../types';

export const fadeTransitionNode: NodeModule = {
  type: 'fadeTransition',
  definition: {
    type: 'fadeTransition',
    label: 'Fade Transition',
    inputs: [
      { id: 'noise', label: 'NoiseValue(1)', type: 'float' },
      { id: 'fade', label: 'FadeValue(1)', type: 'float' },
      { id: 'contrast', label: 'FadeContrast(1)', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Fade(1)', type: 'float' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 'fade', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const noise = ctx.getInput(ctx.id, 'noise', '0.0', 'float');
      const fade = ctx.getInput(ctx.id, 'fade', '0.0', 'float');
      const contrast = ctx.getInput(ctx.id, 'contrast', '1.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`float ${v} = clamp((${noise} - ${fade}) * ${contrast} + 0.5, 0.0, 1.0);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
