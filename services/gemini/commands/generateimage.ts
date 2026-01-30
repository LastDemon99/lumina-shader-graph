import type { CommandContext, CommandInvocation } from './types';

export const matchGenerateImage = (prompt: string) => String(prompt || '').trim().match(/^\/generateimage\b/i);

export async function runGenerateImage(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
  const m = String(inv.prompt || '').trim().match(/^\/generateimage\s+([\s\S]+)$/i);
  if (!m) return false;

  const rest = String(m[1] || '').trim();
  if (!rest) return true;

  const focusPrefix = inv.focusText ? `${inv.focusText}\n\n` : '';
  await ctx.runGeminiTexturePipeline(`${focusPrefix}${rest}`, inv.attachment);
  return true;
}
