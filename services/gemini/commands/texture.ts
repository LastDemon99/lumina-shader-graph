import type { CommandContext, CommandInvocation } from './types';

export const matchTexture = (prompt: string) => String(prompt || '').trim().match(/^\/(texture|tex)\b/i);

export async function runTexture(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
  const m = String(inv.prompt || '').trim().match(/^\/(texture|tex)\s+([\s\S]+)$/i);
  if (!m) return false;

  const rest = String(m[2] || '').trim();
  if (!rest) return true;

  await ctx.runGeminiTexturePipeline(rest, inv.attachment);
  return true;
}
