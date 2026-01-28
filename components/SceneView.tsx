
import React, { useEffect, useRef, useState } from 'react';
import { Box, Circle, Square, MousePointer2 } from 'lucide-react';
import { mat4, createCube, createSphere, createPlane } from '../services/render/renderUtils';
import { createWebGLContext, createProgram, createPlaceholderTexture, loadTexture, applyTextureParams } from '../services/render/webglUtils';

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
    forcedMesh?: 'cube' | 'sphere' | 'plane';
    autoRotate?: boolean;
    cameraDistance?: number;
    mode?: '2d' | '3d';
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
    mode = '3d'
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const warnedMissingPositionRef = useRef(false);
    const reqIdRef = useRef<number>(0);
    const loadedTexturesRef = useRef<Record<string, WebGLTexture>>({});
    const loadedSourcesRef = useRef<Record<string, string>>({}); // Track sources to detect URL changes
    const missingTextureRef = useRef<WebGLTexture | null>(null);

    const [localMesh, setLocalMesh] = useState<'cube' | 'sphere' | 'plane'>('cube');
    const activeMesh = forcedMesh || localMesh;

    const [rotation, setRotation] = useState({ x: 0.5, y: 0.5 });
    const isDragging = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });

    // Use utils for consistent geometry
    const cubeData = useRef(createCube());
    const sphereData = useRef(createSphere(1, 32, 32)); // High res for main view
    const planeData = useRef(createPlane());

    // Texture Management
    useEffect(() => {
        const gl = glRef.current;
        if (!gl) return;

        // Check for stale textures
        Object.keys(loadedTexturesRef.current).forEach(key => {
            const texConfig = textures[key];
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
        Object.entries(textures).forEach(([uniformName, config]) => {
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

            const displayWidth = canvas.clientWidth;
            const displayHeight = canvas.clientHeight;
            if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
                canvas.width = displayWidth;
                canvas.height = displayHeight;
                gl.viewport(0, 0, displayWidth, displayHeight);
            }
            gl.useProgram(programRef.current);

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
            const geo = activeMesh === 'cube' ? cubeData.current :
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
                    mat4.rotateX(model, model, rotation.y);
                    mat4.rotateY(model, model, rotation.x);
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

            let localMin = [-1, -1, -1];
            let localMax = [1, 1, 1];

            if (activeMesh === 'plane') {
                localMin = [-1, -1, 0];
                localMax = [1, 1, 0];
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

            // Transparency: to see back faces through front faces on the same mesh,
            // draw back faces first and front faces second while disabling depth writes.
            // This matches the node Preview behavior (PreviewSystem) and avoids the
            // classic "transparent object looks opaque" self-occlusion problem.
            gl.depthMask(false);
            gl.enable(gl.CULL_FACE);

            // Pass 1: draw back-facing triangles (the far panels)
            gl.cullFace(gl.FRONT);
            gl.drawElements(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_SHORT, 0);

            // Pass 2: draw front-facing triangles on top
            gl.cullFace(gl.BACK);
            gl.drawElements(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_SHORT, 0);

            // Restore default depth write for any future draws
            gl.depthMask(true);

            gl.deleteBuffer(posBuff);
            gl.deleteBuffer(normBuff);
            gl.deleteBuffer(uvBuff);
            gl.deleteBuffer(tanBuff);
            gl.deleteBuffer(idxBuff);

            reqIdRef.current = requestAnimationFrame(render);
        };

        reqIdRef.current = requestAnimationFrame(render);
        return () => cancelAnimationFrame(reqIdRef.current);
    }, [active, activeMesh, rotation, vertShader, fragShader, autoRotate, cameraDistance, textures]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (autoRotate) return;
        isDragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current) return;
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        lastMouse.current = { x: e.clientX, y: e.clientY };

        setRotation(prev => ({
            x: prev.x + dx * 0.01,
            y: prev.y + dy * 0.01
        }));
    };

    const handleMouseUp = () => {
        isDragging.current = false;
    };

    return (
        <div className="w-full h-full relative group">
            <canvas
                ref={canvasRef}
                className={`w-full h-full block ${autoRotate ? 'cursor-default' : 'cursor-move'}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />

            {showControls && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900/80 backdrop-blur-md border border-gray-700 rounded-full p-2 flex gap-2 shadow-2xl transition-opacity opacity-0 group-hover:opacity-100">
                    <button
                        onClick={() => setLocalMesh('cube')}
                        className={`p-2 rounded-full transition-colors ${activeMesh === 'cube' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                        title="Cube"
                    >
                        <Box className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setLocalMesh('sphere')}
                        className={`p-2 rounded-full transition-colors ${activeMesh === 'sphere' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                        title="Sphere"
                    >
                        <Circle className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setLocalMesh('plane')}
                        className={`p-2 rounded-full transition-colors ${activeMesh === 'plane' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                        title="Plane"
                    >
                        <Square className="w-5 h-5" />
                    </button>
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
