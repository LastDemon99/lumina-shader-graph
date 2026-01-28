import type { CommandContext, CommandInvocation } from './types';
import { runUseAsset } from './useasset';
import { runEditAsset } from './editasset';
import { runAddAsset } from './addasset';
import { runTexture } from './texture';

export async function dispatchCommand(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
  // Keep ordering intentional (most specific first).
  if (await runUseAsset(inv, ctx)) return true;
  if (await runEditAsset(inv, ctx)) return true;
  if (await runAddAsset(inv, ctx)) return true;
  if (await runTexture(inv, ctx)) return true;
  return false;
}
