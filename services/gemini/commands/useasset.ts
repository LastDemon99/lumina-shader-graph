import type { CommandContext, CommandInvocation } from './types';
import { findAssetByKey } from '../utils';

export const matchUseAsset = (prompt: string) => String(prompt || '').trim().match(/^\/(useasset|use)\b/i);

export async function runUseAsset(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
  const m = String(inv.prompt || '').trim().match(/^\/(useasset|use)\s+([\s\S]+)$/i);
  if (!m) return false;

  const rest = String(m[2] || '').trim();
  if (!rest) return true;

  if (!ctx.sessionAssets.length) {
    ctx.setLinterLogs(prev => [...prev, 'UseAsset: no assets found. Add one first (Upload Image or /addasset).']);
    return true;
  }

  const parts = rest.split(/\s+/);
  const maybeKey = parts[0];
  const maybeInstructions = rest.slice(maybeKey.length).trim();

  let selected = (inv.selectedAssetId
    ? (ctx.sessionAssets.find(a => a.id === inv.selectedAssetId) || null)
    : null) || findAssetByKey(ctx.sessionAssets, maybeKey);

  const instructions = (inv.selectedAssetId ? rest : (selected ? maybeInstructions : rest)).trim();
  if (!instructions) {
    ctx.setLinterLogs(prev => [...prev, 'UseAsset: provide instructions. Example: /useasset para el base color']);
    return true;
  }

  ctx.setGenerationPhase('drafting');
  ctx.setLinterLogs(['Selecting asset + inferring apply target...']);
  const handleLog = (msg: string) => ctx.setLinterLogs(prev => [...prev, msg]);

  try {
    if (!selected) {
      const inferred = await ctx.geminiService.inferEditAssetTarget(
        rest,
        ctx.sessionAssets.map(a => ({ id: a.id, name: a.name })),
        inv.chatContext,
        handleLog
      );
      selected = inferred?.assetId
        ? (ctx.sessionAssets.find(a => a.id === inferred.assetId) || null)
        : null;
    }

    if (!selected) {
      selected = ctx.sessionAssets[ctx.sessionAssets.length - 1];
      handleLog(`Asset not specified; using latest: ${selected.name}`);
    } else {
      handleLog(`Using asset: ${selected.name}`);
    }

    const inferredPlan = await ctx.geminiService.inferAssetRequest(instructions, handleLog);
    const plan = inferredPlan?.applyPlan;

    ctx.applyTextureDataUrlToTarget({
      dataUrl: selected.dataUrl,
      mimeType: selected.mimeType,
      targetNodeId: plan?.target?.nodeId || 'output',
      targetSocketId: plan?.target?.socketId || 'color',
      operation: plan?.operation || 'multiply',
      channel: plan?.channel || 'rgba',
      log: handleLog,
    });
  } catch (e: any) {
    console.error(e);
    ctx.setLinterLogs(prev => [...prev, `UseAsset error: ${e?.message || String(e)}`]);
  } finally {
    ctx.setGenerationPhase('idle');
  }

  return true;
}
