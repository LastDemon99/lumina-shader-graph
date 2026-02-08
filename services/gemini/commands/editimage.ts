import type { CommandContext, CommandInvocation } from './types';

export const matchEditImage = (prompt: string) => String(prompt || '').trim().match(/^\/editimage\b/i);

export async function runEditImage(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
  const m = String(inv.prompt || '').trim().match(/^\/editimage\s+([\s\S]+)$/i);
  if (!m) return false;

  const rest = String(m[1] || '').trim();
  if (!rest) return true;

  const focusPrefix = inv.focusText ? `${inv.focusText}\n\n` : '';

  // Delegates to backend: represent edits via shader graph ops (no pixel-level mutation).
  // If the user selected an asset, runGeminiPipeline will include it in context.
  await ctx.runGeminiPipeline(`/editimage ${focusPrefix}${rest}`.trim(), inv.attachment, inv.selectedAssetId);
  return true;
}
