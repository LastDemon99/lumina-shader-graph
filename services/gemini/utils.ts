export const inferMimeTypeFromDataUrl = (dataUrl: string) => {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,/i);
  return m?.[1] || 'image/png';
};

export const slugify = (s: string) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);

export const findAssetByKey = <T extends { id: string; name: string }>(assets: T[], key: string | undefined) => {
  const k = String(key || '').trim();
  if (!k) return null;
  return assets.find(a => a.id === k) || assets.find(a => a.name === k) || null;
};
