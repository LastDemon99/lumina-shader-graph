export interface GeometryData {
  vertices: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  tangents: Float32Array;
  indices: Uint16Array | Uint32Array;
}

const parseIndex = (raw: string, length: number): number => {
  const idx = Number.parseInt(raw, 10);
  if (!Number.isFinite(idx) || idx === 0) return -1;
  // OBJ indices are 1-based, negatives are relative to the end.
  return idx > 0 ? idx - 1 : length + idx;
};

const normalize3 = (x: number, y: number, z: number): [number, number, number] => {
  const len = Math.hypot(x, y, z);
  if (len <= 1e-8) return [0, 0, 1];
  return [x / len, y / len, z / len];
};

export const parseOBJ = (text: string): GeometryData => {
  const positions: Array<[number, number, number]> = [];
  const texcoords: Array<[number, number]> = [];
  const normals: Array<[number, number, number]> = [];

  // Output buffers (de-duped by v/vt/vn combination).
  const outPos: number[] = [];
  const outUv: number[] = [];
  const outNorm: number[] = [];
  const outTan: number[] = [];
  const outIndices: number[] = [];

  const hasProvidedNormal: boolean[] = [];
  const normalSums: Array<[number, number, number]> = [];

  const keyToIndex = new Map<string, number>();

  const addVertex = (vIdx: number, vtIdx: number, vnIdx: number): number => {
    const key = `${vIdx}/${vtIdx}/${vnIdx}`;
    const cached = keyToIndex.get(key);
    if (cached !== undefined) return cached;

    const p = positions[vIdx] ?? [0, 0, 0];
    outPos.push(p[0], p[1], p[2]);

    const uv = vtIdx >= 0 ? (texcoords[vtIdx] ?? [0, 0]) : [0, 0];
    outUv.push(uv[0], uv[1]);

    const nProvided = vnIdx >= 0 && Boolean(normals[vnIdx]);
    const n = nProvided ? (normals[vnIdx] as [number, number, number]) : ([0, 0, 0] as [number, number, number]);
    outNorm.push(n[0], n[1], n[2]);

    // Tangent is optional in shaders; provide a stable default (xyz + handedness).
    outTan.push(1, 0, 0, 1);

    const newIndex = (outPos.length / 3) - 1;
    keyToIndex.set(key, newIndex);
    hasProvidedNormal[newIndex] = nProvided;
    normalSums[newIndex] = [0, 0, 0];
    return newIndex;
  };

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/\s+/);
    const head = parts[0];

    if (head === 'v') {
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);
      positions.push([x || 0, y || 0, z || 0]);
      continue;
    }

    if (head === 'vt') {
      const u = Number(parts[1]);
      const v = Number(parts[2]);
      texcoords.push([u || 0, v || 0]);
      continue;
    }

    if (head === 'vn') {
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      const z = Number(parts[3]);
      normals.push(normalize3(x || 0, y || 0, z || 0));
      continue;
    }

    if (head === 'f') {
      const faceVerts = parts.slice(1);
      if (faceVerts.length < 3) continue;

      const faceIndices: number[] = [];
      for (const v of faceVerts) {
        const [vRaw, vtRaw, vnRaw] = v.split('/');
        const vIdx = parseIndex(vRaw, positions.length);
        const vtIdx = vtRaw ? parseIndex(vtRaw, texcoords.length) : -1;
        const vnIdx = vnRaw ? parseIndex(vnRaw, normals.length) : -1;
        if (vIdx < 0) continue;
        faceIndices.push(addVertex(vIdx, vtIdx, vnIdx));
      }

      // Triangulate n-gons via fan.
      for (let i = 1; i + 1 < faceIndices.length; i++) {
        outIndices.push(faceIndices[0], faceIndices[i], faceIndices[i + 1]);
      }

      continue;
    }
  }

  // If any vertex is missing normals, compute smooth normals by accumulating face normals.
  const needsNormals = hasProvidedNormal.some(v => !v);
  if (needsNormals) {
    for (let i = 0; i < outIndices.length; i += 3) {
      const i0 = outIndices[i];
      const i1 = outIndices[i + 1];
      const i2 = outIndices[i + 2];

      const ax = outPos[i0 * 3 + 0];
      const ay = outPos[i0 * 3 + 1];
      const az = outPos[i0 * 3 + 2];
      const bx = outPos[i1 * 3 + 0];
      const by = outPos[i1 * 3 + 1];
      const bz = outPos[i1 * 3 + 2];
      const cx = outPos[i2 * 3 + 0];
      const cy = outPos[i2 * 3 + 1];
      const cz = outPos[i2 * 3 + 2];

      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;

      // face normal = cross(ab, ac)
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;

      if (!hasProvidedNormal[i0]) {
        const s0 = normalSums[i0];
        s0[0] += nx; s0[1] += ny; s0[2] += nz;
      }
      if (!hasProvidedNormal[i1]) {
        const s1 = normalSums[i1];
        s1[0] += nx; s1[1] += ny; s1[2] += nz;
      }
      if (!hasProvidedNormal[i2]) {
        const s2 = normalSums[i2];
        s2[0] += nx; s2[1] += ny; s2[2] += nz;
      }
    }

    for (let vi = 0; vi < outPos.length / 3; vi++) {
      if (hasProvidedNormal[vi]) continue;
      const [nx, ny, nz] = normalize3(normalSums[vi][0], normalSums[vi][1], normalSums[vi][2]);
      outNorm[vi * 3 + 0] = nx;
      outNorm[vi * 3 + 1] = ny;
      outNorm[vi * 3 + 2] = nz;
    }
  }

  const vertexCount = outPos.length / 3;
  const indexCount = outIndices.length;

  const indexArray = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  for (let i = 0; i < indexCount; i++) (indexArray as any)[i] = outIndices[i];

  return {
    vertices: new Float32Array(outPos),
    normals: new Float32Array(outNorm),
    uvs: new Float32Array(outUv),
    tangents: new Float32Array(outTan),
    indices: indexArray
  };
};
