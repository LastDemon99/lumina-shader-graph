import type { CommandContext, CommandInvocation } from './types';
import { findAssetByKey } from '../utils';

export const matchEditAsset = (prompt: string) => String(prompt || '').trim().match(/^\/(editasset|edit)\b/i);

export async function runEditAsset(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
  const m = String(inv.prompt || '').trim().match(/^\/(editasset|edit)\s+([\s\S]+)$/i);
  if (!m) return false;

  const rest = String(m[2] || '').trim();
  if (!rest) return true;

  const parts = rest.split(/\s+/);
  const maybeKey = parts[0];
  const maybeInstructions = rest.slice(maybeKey.length).trim();

  const explicit = findAssetByKey(ctx.sessionAssets, maybeKey);
  const instructions = (explicit ? (maybeInstructions || '') : rest).trim();

  let selected = (inv.selectedAssetId
    ? (ctx.sessionAssets.find(a => a.id === inv.selectedAssetId) || null)
    : null) || explicit;

  // If no explicit asset id/name was provided, infer which asset to edit.
  if (!selected) {
    if (!ctx.sessionAssets.length) {
      ctx.setLinterLogs(prev => [...prev, 'EditAsset: no assets found. Add one first (Upload Image or /addasset).']);
      return true;
    }

    ctx.setGenerationPhase('drafting');
    ctx.setLinterLogs(['Choosing which asset to edit...']);
    const handleLog = (msg: string) => ctx.setLinterLogs(prev => [...prev, msg]);

    try {
      const inferred = await ctx.geminiService.inferEditAssetTarget(
        rest,
        ctx.sessionAssets.map(a => ({ id: a.id, name: a.name })),
        inv.chatContext,
        handleLog
      );
      selected = inferred?.assetId
        ? (ctx.sessionAssets.find(a => a.id === inferred.assetId) || null)
        : null;
    } catch (e: any) {
      console.error(e);
    } finally {
      ctx.setGenerationPhase('idle');
    }

    if (!selected) selected = ctx.sessionAssets[ctx.sessionAssets.length - 1];
  }

  if (!selected) {
    ctx.setLinterLogs(prev => [...prev, 'EditAsset: no assets found. Add one first (Upload Image or /addasset).']);
    return true;
  }
  if (!instructions) {
    ctx.setLinterLogs(prev => [...prev, 'EditAsset: provide edit instructions. Example: /editasset make it more scratched']);
    return true;
  }

  ctx.setGenerationPhase('drafting');
  ctx.setLinterLogs([`Editing asset: ${selected.name}...`]);
  const handleLog = (msg: string) => ctx.setLinterLogs(prev => [...prev, msg]);

  try {
    const edited = await ctx.geminiService.editTextureDataUrl(instructions, selected.dataUrl, handleLog);
    if (!edited?.dataUrl) {
      handleLog('EditAsset: edit failed.');
      return true;
    }

    const oldUrl = selected.dataUrl;

    ctx.setSessionAssets(prev => prev.map(a => a.id === selected!.id
      ? { ...a, dataUrl: edited.dataUrl, mimeType: edited.mimeType, createdAt: Date.now() }
      : a
    ));

    // Update any nodes that referenced the old asset dataUrl
    ctx.setNodes(prev => prev.map(n => {
      if (n.type !== 'texture2DAsset') return n;
      if (!n.data || (n.data as any).textureAsset !== oldUrl) return n;
      return { ...n, data: { ...(n.data as any), textureAsset: edited.dataUrl } };
    }));

    handleLog(`Asset updated: ${selected.name} (graph nodes updated).`);
  } catch (e: any) {
    console.error(e);
    ctx.setLinterLogs(prev => [...prev, `EditAsset error: ${e?.message || String(e)}`]);
  } finally {
    ctx.setGenerationPhase('idle');
  }

  return true;
}
