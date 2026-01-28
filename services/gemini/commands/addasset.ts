import type { CommandContext, CommandInvocation } from './types';
import { inferMimeTypeFromDataUrl, slugify } from '../utils';

export const matchAddAsset = (prompt: string) => String(prompt || '').trim().match(/^\/(addasset|asset)\b/i);

export async function runAddAsset(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
  const m = String(inv.prompt || '').trim().match(/^\/(addasset|asset)\s*([\s\S]*)$/i);
  if (!m) return false;

  if (!inv.attachment) {
    ctx.setLinterLogs(prev => [...prev, 'AddAsset: attach an image to save it as an asset.']);
    return true;
  }

  const userIntent = String(m[2] || '').trim();
  if (!userIntent) {
    ctx.addSessionAsset(inv.attachment, undefined);
    return true;
  }

  ctx.setGenerationPhase('drafting');
  ctx.setLinterLogs(['Inferring asset request...']);
  const handleLog = (msg: string) => ctx.setLinterLogs(prev => [...prev, msg]);

  try {
    const inferred = await ctx.geminiService.inferAssetRequest(userIntent, handleLog);

    // If asset-intent inference fails, fall back to texture-target inference so we can
    // still auto-apply prompts like "para el base color".
    if (!inferred) {
      const fallbackName = slugify(userIntent) || undefined;
      ctx.addSessionAsset(inv.attachment, fallbackName);

      const inferredTarget = await ctx.geminiService.inferTextureRequest(userIntent, handleLog);
      if (inferredTarget?.target) {
        ctx.applyTextureDataUrlToTarget({
          dataUrl: inv.attachment,
          mimeType: inferMimeTypeFromDataUrl(inv.attachment),
          targetNodeId: inferredTarget.target.nodeId || 'output',
          targetSocketId: inferredTarget.target.socketId || 'color',
          operation: inferredTarget.operation || 'multiply',
          channel: inferredTarget.channel || 'rgba',
          log: handleLog,
        });
      } else {
        const lower = userIntent.toLowerCase();
        const targetSocketId = (lower.includes('alpha') || lower.includes('opaci') || lower.includes('mask'))
          ? 'alpha'
          : (lower.includes('normal') || lower.includes('bump'))
            ? 'normal'
            : 'color';

        ctx.applyTextureDataUrlToTarget({
          dataUrl: inv.attachment,
          mimeType: inferMimeTypeFromDataUrl(inv.attachment),
          targetNodeId: 'output',
          targetSocketId,
          operation: targetSocketId === 'alpha' || targetSocketId === 'normal' ? 'replace' : 'multiply',
          channel: targetSocketId === 'alpha' ? 'a' : 'rgba',
          log: handleLog,
        });
      }

      return true;
    }

    const assetName = String(inferred?.assetName || '').trim() || undefined;
    ctx.addSessionAsset(inv.attachment, assetName);

    if (inferred?.apply) {
      const plan = inferred?.applyPlan;
      ctx.applyTextureDataUrlToTarget({
        dataUrl: inv.attachment,
        mimeType: inferMimeTypeFromDataUrl(inv.attachment),
        targetNodeId: plan?.target?.nodeId || 'output',
        targetSocketId: plan?.target?.socketId || 'color',
        operation: plan?.operation || 'multiply',
        channel: plan?.channel || 'rgba',
        log: handleLog,
      });
    } else {
      handleLog('Saved asset (not applied).');
    }
  } catch (e: any) {
    console.error(e);
    ctx.addSessionAsset(inv.attachment, undefined);
    ctx.setLinterLogs(prev => [...prev, `AddAsset inference error: ${e?.message || String(e)}`]);
  } finally {
    ctx.setGenerationPhase('idle');
  }

  return true;
}
