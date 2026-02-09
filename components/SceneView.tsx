
import React, { useEffect, useRef, useState } from 'react';
import { Box, Circle, Square, MousePointer2, Upload, Layers } from 'lucide-react';
import { mat4, createCube, createSphere, createPlane } from '../services/render/renderUtils';
import { createWebGLContext, createProgram, createPlaceholderTexture, loadTexture, applyTextureParams } from '../services/render/webglUtils';
import { parseOBJ, type GeometryData } from '../services/render/objLoader';

interface TextureConfig {
    url: string;
    wrap: string;
    filter: string;
}

interface SceneViewProps {
    fragShader: string;
    vertShader: string;
    active: boolean;
    textures?: Record<string, TextureConfig>;
    showControls?: boolean;
    forcedMesh?: 'cube' | 'sphere' | 'plane' | 'obj';
    autoRotate?: boolean;
    cameraDistance?: number;
    mode?: '2d' | '3d';
    rotation?: { x: number; y: number };
    onRotationChange?: (rotation: { x: number; y: number }) => void;

    // Shared imported model (single slot; overwritten on each import)
    objModel?: GeometryData | null;
    objBounds?: { min: [number, number, number]; max: [number, number, number] } | null;
    allowObjImport?: boolean;
    onObjModelChange?: (payload: { geo: GeometryData; bounds: { min: [number, number, number]; max: [number, number, number] } }) => void;

    // Optional external control for mode/mesh when forcedMesh is used
    onModeChange?: (mode: '2d' | '3d') => void;
    onMeshChange?: (mesh: 'cube' | 'sphere' | 'plane' | 'obj') => void;

    // Optional fixed render size override (useful for export)
    renderSizeOverride?: { width: number; height: number } | null;

    // Optional hook for capture/export
    onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
}

export const SceneView: React.FC<SceneViewProps> = ({
    fragShader,
    vertShader,
    active,
    textures = {},
    showControls = true,
    forcedMesh,
    autoRotate = false,
    cameraDistance = 4.0,
    mode = '3d',
    rotation,
    onRotationChange,
    objModel = null,
    objBounds = null,
    allowObjImport = false,
    onObjModelChange,
    onModeChange,
    onMeshChange
    ,
    renderSizeOverride = null,
    onCanvasReady
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGL2RenderingContext | null>(null);
    const vaoRef = useRef<WebGLVertexArrayObject | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const warnedMissingPositionRef = useRef(false);
    const reqIdRef = useRef<number>(0);
    const loadedTexturesRef = useRef<Record<string, WebGLTexture>>({});
    const loadedSourcesRef = useRef<Record<string, string>>({}); // Track sources to detect URL changes
    const missingTextureRef = useRef<WebGLTexture | null>(null);

    const [localMesh, setLocalMesh] = useState<'cube' | 'sphere' | 'plane' | 'obj'>('cube');
    const activeMesh = forcedMesh || localMesh;

    const currentRotationRef = useRef<{ x: number; y: number }>(rotation || { x: 0.5, y: 0.5 });
    const isDragging = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });
    const pendingRotationRafRef = useRef<number | null>(null);

    const objFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!rotation) return;
        // Avoid fighting local pointer updates while dragging.
        if (isDragging.current) return;
        currentRotationRef.current = rotation;
    }, [rotation?.x, rotation?.y]);

    useEffect(() => {
        return () => {
            if (pendingRotationRafRef.current !== null) {
                cancelAnimationFrame(pendingRotationRafRef.current);
                pendingRotationRafRef.current = null;
            }
        };
    }, []);

    // Use utils for consistent geometry
    const cubeData = useRef(createCube());
    const sphereData = useRef(createSphere(1, 32, 32)); // High res for main view
    const planeData = useRef(createPlane());

    useEffect(() => {
        onCanvasReady?.(canvasRef.current);
        return () => onCanvasReady?.(null);
    }, [onCanvasReady]);

    // Texture Management
    useEffect(() => {
        const gl = glRef.current;
        if (!gl) return;

        // Check for stale textures
        Object.keys(loadedTexturesRef.current).forEach(key => {
            const texConfig = textures[key] as TextureConfig | undefined;
            const currentCacheKey = loadedSourcesRef.current[key];
            const isStale = !texConfig;
            const targetCacheKey = texConfig ? `${texConfig.url}|${texConfig.wrap}|${texConfig.filter}` : '';
            const isChanged = texConfig && currentCacheKey !== targetCacheKey;

            if (isStale || isChanged) {
                gl.deleteTexture(loadedTexturesRef.current[key]);
                delete loadedTexturesRef.current[key];
                delete loadedSourcesRef.current[key];
            }
        });

        // Load new or update
        (Object.entries(textures) as [string, TextureConfig][]).forEach(([uniformName, config]) => {
            const cacheKey = `${config.url}|${config.wrap}|${config.filter}`;
            if (!loadedTexturesRef.current[uniformName]) {
                const tex = loadTexture(gl, config.url, config.wrap, config.filter);
                if (tex) {
                    loadedTexturesRef.current[uniformName] = tex;
                    loadedSourcesRef.current[uniformName] = cacheKey;
                }
            }
        });
    }, [textures, active]);

    // Cleanup WebGL on Unmount
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const handleContextLost = (event: Event) => {
                event.preventDefault(); // allow restoration
                console.warn("SceneView WebGL Context Lost");
            };
            canvas.addEventListener('webglcontextlost', handleContextLost, false);
            return () => {
                canvas.removeEventListener('webglcontextlost', handleContextLost);
                if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
                // Do NOT manually lose context, let browser GC handle it to avoid dev-mode race conditions
                const gl = glRef.current;
                if (gl) {
                    // Minimal cleanup
                    Object.values(loadedTexturesRef.current).forEach(tex => gl.deleteTexture(tex));
                    if (programRef.current) gl.deleteProgram(programRef.current);
                    if (vaoRef.current) gl.deleteVertexArray(vaoRef.current);
                    glRef.current = null;
                }
            };
        }
        return () => {
            if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
        };
    }, []);

    // Shader Compilation & Context Init
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        if (!glRef.current) {
            const gl = createWebGLContext(canvas);
            if (!gl) return;
            glRef.current = gl;
            gl.clearColor(0.05, 0.05, 0.05, 1.0);
            missingTextureRef.current = createPlaceholderTexture(gl);
            vaoRef.current = gl.createVertexArray();
            if (vaoRef.current) gl.bindVertexArray(vaoRef.current);
        }

        const gl = glRef.current;
        if (!gl) return;

        try {
            const prev = programRef.current;
            const next = createProgram(gl, String(vertShader), String(fragShader));
            programRef.current = next;
            warnedMissingPositionRef.current = false;
            if (prev) gl.deleteProgram(prev);
        } catch (e: any) {
            const errorMessage = (e instanceof Error ? e.message : String(e)) || 'Unknown Shader Error';
            console.error("SceneView Shader Error:", errorMessage as string);
        }

    }, [vertShader, fragShader, active]);

    // Render Loop
    useEffect(() => {
        if (!active) return;

        const gl = glRef.current;
        const canvas = canvasRef.current;

        const render = (time: number) => {
            if (!gl || !canvas) return;

            if (gl.isContextLost()) return;

            if (!programRef.current) {
                reqIdRef.current = requestAnimationFrame(render);
                return;
            }

            const displayWidth = renderSizeOverride?.width ?? canvas.clientWidth;
            const displayHeight = renderSizeOverride?.height ?? canvas.clientHeight;
            if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
                canvas.width = displayWidth;
                canvas.height = displayHeight;
                gl.viewport(0, 0, displayWidth, displayHeight);
            }
            gl.useProgram(programRef.current);

            if (vaoRef.current) gl.bindVertexArray(vaoRef.current);

            const getAttribLocationAny = (names: string[]): number => {
                for (const n of names) {
                    const loc = gl.getAttribLocation(programRef.current!, n);
                    if (loc !== -1) return loc;
                }
                return -1;
            };

            // Enable Alpha Blending for Master Preview transparency
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            // --- BIND TEXTURES ---
            if (missingTextureRef.current) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, missingTextureRef.current);
                const missingLoc = gl.getUniformLocation(programRef.current, 'u_tex_missing');
                if (missingLoc) gl.uniform1i(missingLoc, 0);
            }

            let texUnit = 1;
            Object.entries(loadedTexturesRef.current).forEach(([name, tex]) => {
                const loc = gl.getUniformLocation(programRef.current!, name);
                if (loc) {
                    gl.activeTexture(gl.TEXTURE0 + texUnit);
                    const config = textures[name];
                    if (config) {
                        applyTextureParams(gl, tex, config.wrap, config.filter);
                    }
                    gl.uniform1i(loc, texUnit);

                    // AUTOMATICALLY BIND TEXTURE SIZE UNIFORM
                    // GLSL Generator produces u_texDim_{id} for Texture Size / LOD nodes.
                    // We assume uniform names are u_tex_{id}, so we replace to match.
                    const dimName = name.replace('u_tex_', 'u_texDim_');
                    const dimLoc = gl.getUniformLocation(programRef.current!, dimName);
                    if (dimLoc) {
                        const size = (tex as any)._size || [1024, 1024];
                        gl.uniform2f(dimLoc, size[0], size[1]);
                    }

                    texUnit++;
                }
            });

            // Geometry Selection
            const geo = activeMesh === 'obj' && objModel
                ? objModel
                : activeMesh === 'cube' ? cubeData.current :
                    activeMesh === 'sphere' ? sphereData.current : planeData.current;

            // If the shader doesn't expose a usable position attribute, don't clear the canvas.
            // This avoids the "scene reset" feeling when a temporary/invalid shader is produced during refine.
            const posLoc = getAttribLocationAny(['position', 'a_position', 'aPosition', 'inPosition']);
            if (posLoc === -1) {
                if (!warnedMissingPositionRef.current) {
                    warnedMissingPositionRef.current = true;
                    console.warn('SceneView: shader missing required position attribute; keeping previous frame.');
                }
                reqIdRef.current = requestAnimationFrame(render);
                return;
            }

            // Depth is required for correct occlusion when rotating meshes.
            // Without this, triangles draw in submission order and can look "broken" when the object turns.
            if (mode === '3d') {
                gl.enable(gl.DEPTH_TEST);
                gl.depthFunc(gl.LEQUAL);
                gl.clearDepth(1.0);
            } else {
                gl.disable(gl.DEPTH_TEST);
            }

            gl.clearColor(0.05, 0.05, 0.05, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            const posBuff = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuff);
            gl.bufferData(gl.ARRAY_BUFFER, geo.vertices, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

            const normBuff = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, normBuff);
            gl.bufferData(gl.ARRAY_BUFFER, geo.normals, gl.STATIC_DRAW);
            const normLoc = getAttribLocationAny(['normal', 'a_normal', 'aNormal', 'inNormal']);
            if (normLoc !== -1) {
                gl.enableVertexAttribArray(normLoc);
                gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);
            }

            const uvBuff = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, uvBuff);
            gl.bufferData(gl.ARRAY_BUFFER, geo.uvs, gl.STATIC_DRAW);
            const uvLoc = getAttribLocationAny(['uv', 'a_uv', 'aUV', 'texcoord', 'a_texcoord', 'aTexcoord', 'inUV']);
            if (uvLoc !== -1) {
                gl.enableVertexAttribArray(uvLoc);
                gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
            }

            const tanBuff = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, tanBuff);
            gl.bufferData(gl.ARRAY_BUFFER, geo.tangents, gl.STATIC_DRAW);
            const tanLoc = getAttribLocationAny(['tangent', 'a_tangent', 'aTangent', 'inTangent']);
            if (tanLoc !== -1) {
                gl.enableVertexAttribArray(tanLoc);
                gl.vertexAttribPointer(tanLoc, 4, gl.FLOAT, false, 0, 0);
            }

            const idxBuff = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuff);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);
            const indexType = geo.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

            const aspect = canvas.width / canvas.height;
            const projection = new Float32Array(16);
            const view = new Float32Array(16);
            const model = new Float32Array(16);
            const modelInv = new Float32Array(16);
            const viewInv = new Float32Array(16);

            if (mode === '2d') {
                mat4.identity(projection);
                mat4.identity(view);
                mat4.identity(model);
            } else {
                mat4.perspective(projection, Math.PI / 4, aspect, 0.1, 100.0);
                mat4.lookAt(view, [0, 0, cameraDistance], [0, 0, 0], [0, 1, 0]);
                mat4.identity(model);

                if (autoRotate) {
                    mat4.rotateY(model, model, time * 0.001);
                } else {
                    // Turntable rotation: Y (world) then X (local)
                    const rot = currentRotationRef.current;
                    mat4.rotateY(model, model, rot.x);
                    mat4.rotateX(model, model, rot.y);
                }
            }

            mat4.invert(modelInv, model);
            mat4.invert(viewInv, view);

            const uProj = gl.getUniformLocation(programRef.current, 'u_projection');
            const uView = gl.getUniformLocation(programRef.current, 'u_view');
            const uModel = gl.getUniformLocation(programRef.current, 'u_model');
            const uModelInv = gl.getUniformLocation(programRef.current, 'u_model_inv');
            const uViewInv = gl.getUniformLocation(programRef.current, 'u_view_inv');
            const uTime = gl.getUniformLocation(programRef.current, 'u_time');
            const uPreviewModeLoc = gl.getUniformLocation(programRef.current, 'u_previewMode');

            if (uProj) gl.uniformMatrix4fv(uProj, false, projection);
            if (uView) gl.uniformMatrix4fv(uView, false, view);
            if (uModel) gl.uniformMatrix4fv(uModel, false, model);

            if (uModelInv) gl.uniformMatrix4fv(uModelInv, false, modelInv);
            if (uViewInv) gl.uniformMatrix4fv(uViewInv, false, viewInv);

            if (uTime) gl.uniform1f(uTime, time / 1000);
            if (uPreviewModeLoc) gl.uniform1i(uPreviewModeLoc, mode === '3d' ? 1 : 0);

            // Viewport Uniform (Full screen for Scene View)
            const uViewPort = gl.getUniformLocation(programRef.current, 'u_viewPort');
            if (uViewPort) gl.uniform4f(uViewPort, 0, 0, canvas.width, canvas.height);

            const camPos = [0, 0, cameraDistance];
            const camDir = [0, 0, -1];
            const camNear = 0.1;
            const camFar = 100.0;
            const isOrtho = 0.0;

            const uCamPos = gl.getUniformLocation(programRef.current, 'u_cameraPosition');
            const uCamDir = gl.getUniformLocation(programRef.current, 'u_cameraDirection');
            const uCamNear = gl.getUniformLocation(programRef.current, 'u_cameraNear');
            const uCamFar = gl.getUniformLocation(programRef.current, 'u_cameraFar');
            const uCamOrtho = gl.getUniformLocation(programRef.current, 'u_cameraOrthographic');

            if (uCamPos) gl.uniform3f(uCamPos, camPos[0], camPos[1], camPos[2]);
            if (uCamDir) gl.uniform3f(uCamDir, camDir[0], camDir[1], camDir[2]);
            if (uCamNear) gl.uniform1f(uCamNear, camNear);
            if (uCamFar) gl.uniform1f(uCamFar, camFar);
            if (uCamOrtho) gl.uniform1f(uCamOrtho, isOrtho);

            let localMin: [number, number, number] = [-1, -1, -1];
            let localMax: [number, number, number] = [1, 1, 1];

            if (activeMesh === 'plane') {
                localMin = [-1, -1, 0];
                localMax = [1, 1, 0];
            } else if (activeMesh === 'obj' && objBounds) {
                localMin = objBounds.min;
                localMax = objBounds.max;
            }

            const corners = [
                [localMin[0], localMin[1], localMin[2]],
                [localMax[0], localMin[1], localMin[2]],
                [localMin[0], localMax[1], localMin[2]],
                [localMax[0], localMax[1], localMin[2]],
                [localMin[0], localMin[1], localMax[2]],
                [localMax[0], localMin[1], localMax[2]],
                [localMin[0], localMax[1], localMax[2]],
                [localMax[0], localMax[1], localMax[2]],
            ];

            let worldMin = [Infinity, Infinity, Infinity];
            let worldMax = [-Infinity, -Infinity, -Infinity];

            for (const p of corners) {
                const x = p[0], y = p[1], z = p[2];
                const wX = model[0] * x + model[4] * y + model[8] * z + model[12];
                const wY = model[1] * x + model[5] * y + model[9] * z + model[13];
                const wZ = model[2] * x + model[6] * y + model[10] * z + model[14];

                if (wX < worldMin[0]) worldMin[0] = wX;
                if (wY < worldMin[1]) worldMin[1] = wY;
                if (wZ < worldMin[2]) worldMin[2] = wZ;

                if (wX > worldMax[0]) worldMax[0] = wX;
                if (wY > worldMax[1]) worldMax[1] = wY;
                if (wZ > worldMax[2]) worldMax[2] = wZ;
            }

            const uBoundsMin = gl.getUniformLocation(programRef.current, 'u_boundsMin');
            if (uBoundsMin) gl.uniform3f(uBoundsMin, worldMin[0], worldMin[1], worldMin[2]);

            const uBoundsMax = gl.getUniformLocation(programRef.current, 'u_boundsMax');
            if (uBoundsMax) gl.uniform3f(uBoundsMax, worldMax[0], worldMax[1], worldMax[2]);

            // We render in 3 steps:
            // 1) Depth pre-pass (no color) to populate the depth buffer.
            // 2) Back faces
            // 3) Front faces
            // This keeps the "see both sides" behavior for transparent shaders,
            // while still having correct occlusion within the mesh.
            if (mode === '3d') {
                gl.enable(gl.CULL_FACE);

                // 1) Depth pre-pass
                gl.disable(gl.BLEND);
                gl.colorMask(false, false, false, false);
                gl.depthMask(true);
                gl.disable(gl.CULL_FACE); // write depth for both sides
                gl.drawElements(gl.TRIANGLES, geo.indices.length, indexType, 0);

                // 2-3) Color passes
                gl.enable(gl.BLEND);
                gl.colorMask(true, true, true, true);
                gl.depthMask(false);
                gl.enable(gl.CULL_FACE);

                // Pass 1: draw back-facing triangles (the far panels)
                gl.cullFace(gl.FRONT);
                gl.drawElements(gl.TRIANGLES, geo.indices.length, indexType, 0);

                // Pass 2: draw front-facing triangles on top
                gl.cullFace(gl.BACK);
                gl.drawElements(gl.TRIANGLES, geo.indices.length, indexType, 0);

                // Restore default
                gl.depthMask(true);
            } else {
                // 2D mode: simple draw
                gl.disable(gl.CULL_FACE);
                gl.depthMask(false);
                gl.drawElements(gl.TRIANGLES, geo.indices.length, indexType, 0);
                gl.depthMask(true);
            }

            if (vaoRef.current) gl.bindVertexArray(null);

            gl.deleteBuffer(posBuff);
            gl.deleteBuffer(normBuff);
            gl.deleteBuffer(uvBuff);
            gl.deleteBuffer(tanBuff);
            gl.deleteBuffer(idxBuff);

            reqIdRef.current = requestAnimationFrame(render);
        };

        reqIdRef.current = requestAnimationFrame(render);
        return () => cancelAnimationFrame(reqIdRef.current);
    }, [active, activeMesh, vertShader, fragShader, autoRotate, cameraDistance, textures, mode]);

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (autoRotate) return;
        if (mode !== '3d') return;
        if (e.button !== 0) return;
        e.preventDefault();

        isDragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // Safe to ignore if unsupported
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDragging.current) return;
        e.preventDefault();

        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        lastMouse.current = { x: e.clientX, y: e.clientY };

        const nextX = currentRotationRef.current.x + dx * 0.01;
        const nextY = clamp(currentRotationRef.current.y + dy * 0.01, -1.55, 1.55);

        // Keep yaw bounded to avoid precision drift.
        const wrappedX = ((nextX + Math.PI) % (Math.PI * 2)) - Math.PI;

        currentRotationRef.current = { x: wrappedX, y: nextY };

        if (onRotationChange) {
            if (pendingRotationRafRef.current === null) {
                pendingRotationRafRef.current = requestAnimationFrame(() => {
                    pendingRotationRafRef.current = null;
                    onRotationChange(currentRotationRef.current);
                });
            }
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        isDragging.current = false;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
            // ignore
        }

        // Flush final rotation immediately.
        if (pendingRotationRafRef.current !== null) {
            cancelAnimationFrame(pendingRotationRafRef.current);
            pendingRotationRafRef.current = null;
        }
        onRotationChange?.(currentRotationRef.current);
    };

    const computeBounds = (geo: GeometryData): { min: [number, number, number]; max: [number, number, number] } => {
        const v = geo.vertices;
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < v.length; i += 3) {
            const x = v[i + 0];
            const y = v[i + 1];
            const z = v[i + 2];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (z < minZ) minZ = z;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (z > maxZ) maxZ = z;
        }

        if (!Number.isFinite(minX)) return { min: [-1, -1, -1], max: [1, 1, 1] };
        return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
    };

    const handleObjFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            const geo = parseOBJ(text);
            const bounds = computeBounds(geo);
            onObjModelChange?.({ geo, bounds });
            onModeChange?.('3d');
            onMeshChange?.('obj');
            setLocalMesh('obj');
        } catch (err) {
            console.error('SceneView: failed to import OBJ', err);
        } finally {
            e.target.value = '';
        }
    };

    return (
        <div className="w-full h-full relative group">
            <canvas
                ref={canvasRef}
                className={`w-full h-full block touch-none ${autoRotate ? 'cursor-default' : 'cursor-move'}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            />

            <input
                ref={objFileInputRef}
                type="file"
                accept=".obj"
                className="hidden"
                onChange={handleObjFileSelected}
            />

            {showControls && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900/80 backdrop-blur-md border border-gray-700 rounded-full p-2 flex gap-2 shadow-2xl transition-opacity opacity-0 group-hover:opacity-100">
                    <button
                        onClick={() => onModeChange?.('2d')}
                        className={`px-2 py-1 rounded-full text-xs transition-colors ${mode === '2d' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                        title="2D Mode"
                    >
                        2D
                    </button>
                    <button
                        onClick={() => onModeChange?.('3d')}
                        className={`px-2 py-1 rounded-full text-xs transition-colors ${mode === '3d' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                        title="3D Mode"
                    >
                        3D
                    </button>

                    <div className="w-[1px] h-6 bg-gray-700 mx-1" />

                    <button
                        onClick={() => {
                            onMeshChange?.('cube');
                            if (!forcedMesh) setLocalMesh('cube');
                        }}
                        className={`p-2 rounded-full transition-colors ${activeMesh === 'cube' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                        title="Cube"
                    >
                        <Box className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => {
                            onMeshChange?.('sphere');
                            if (!forcedMesh) setLocalMesh('sphere');
                        }}
                        className={`p-2 rounded-full transition-colors ${activeMesh === 'sphere' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                        title="Sphere"
                    >
                        <Circle className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => {
                            onMeshChange?.('plane');
                            if (!forcedMesh) setLocalMesh('plane');
                        }}
                        className={`p-2 rounded-full transition-colors ${activeMesh === 'plane' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                        title="Plane"
                    >
                        <Square className="w-5 h-5" />
                    </button>

                    <div className="w-[1px] h-6 bg-gray-700 mx-1" />

                    <button
                        onClick={() => {
                            if (!objModel) return;
                            onMeshChange?.('obj');
                            if (!forcedMesh) setLocalMesh('obj');
                        }}
                        className={`p-2 rounded-full transition-colors ${activeMesh === 'obj' ? 'bg-blue-600 text-white' : objModel ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600'}`}
                        title={objModel ? 'View Imported Model' : 'No imported model'}
                    >
                        <Layers className="w-5 h-5" />
                    </button>

                    {allowObjImport && (
                        <button
                            onClick={() => objFileInputRef.current?.click()}
                            className="p-2 rounded-full transition-colors text-gray-400 hover:text-white hover:bg-gray-700"
                            title="Import .obj"
                        >
                            <Upload className="w-5 h-5" />
                        </button>
                    )}
                </div>
            )}

            {showControls && (
                <div className="absolute top-6 left-6 text-white/50 pointer-events-none flex items-center gap-2">
                    <MousePointer2 className="w-4 h-4" />
                    <span className="text-xs">Drag to Rotate Scene</span>
                </div>
            )}
        </div>
    );
};
