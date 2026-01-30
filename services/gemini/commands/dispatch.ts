import type { CommandContext, CommandInvocation } from './types';
import { runLoadImage } from './loadimage';
import { runEditImage } from './editimage';
import { runGenerateImage } from './generateimage';
import { runGenerateGraph } from './generategraph';
import { runEditGraph } from './editgraph';
import { runClear } from './clear';
import { runAsk } from './ask';

export async function dispatchCommand(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
  // If the router inferred an intent but the user didn't type a command, 
  // we synthesize an internal invocation so we can reuse the existing command runners.
  const isInternalRouting = inv.intentCommand && !inv.prompt.trim().startsWith('/');
  const effectiveInv = isInternalRouting
    ? { ...inv, prompt: `${inv.intentCommand} ${inv.prompt}` }
    : inv;

  // Keep ordering intentional (most specific first).
  // 1. Image related
  if (await runLoadImage(effectiveInv, ctx)) return true;
  if (await runEditImage(effectiveInv, ctx)) return true;
  if (await runGenerateImage(effectiveInv, ctx)) return true;

  // 2. Graph related
  if (await runGenerateGraph(effectiveInv, ctx)) return true;
  if (await runEditGraph(effectiveInv, ctx)) return true;

  // 3. System related
  if (await runClear(effectiveInv, ctx)) return true;
  if (await runAsk(effectiveInv, ctx)) return true;

  return false;
}
