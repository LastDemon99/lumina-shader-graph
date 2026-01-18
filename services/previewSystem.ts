
import { createWebGLContext, createProgram, loadTexture, createPlaceholderTexture, applyTextureParams } from './webglUtils';
import { createQuad, createSphere, createCube, createPlane, mat4 } from './renderUtils';

interface TextureConfig {
    url: string;
    wrap: string;
    filter: string;
}

interface RenderItem {
    id: string;
    element: HTMLDivElement;
    fragShader: string;
    vertShader: string;
    mode: '2d' | '3d';
    previewObject?: 'sphere' | 'box' | 'quad';
    rotation?: { x: number; y: number };
    textures: Record<string, TextureConfig>;
    timestamp: number; // For LRU caching of programs if needed
}

interface GLGeometry {
    position: WebGLBuffer;
    normal: WebGLBuffer;
    uv: WebGLBuffer;
    tangent: WebGLBuffer;
    color: WebGLBuffer;
    indices: WebGLBuffer;
    count: number;
}

class PreviewSystem {
    private canvas: HTMLCanvasElement | null = null;
    private gl: WebGLRenderingContext | null = null;
    private items: Map<string, RenderItem> = new Map();
    private programs: Map<string, WebGLProgram> = new Map(); // Cache programs by source hash
    private textures: Map<string, WebGLTexture> = new Map(); // Cache textures by URL
    private placeholderTex: WebGLTexture | null = null;

    // Shared Geometry Buffers
    private quadGeo: GLGeometry | null = null;
    private sphereGeo: GLGeometry | null = null;
    private boxGeo: GLGeometry | null = null;
    private planeGeo: GLGeometry | null = null;

    private animationFrameId: number | null = null;

    init(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.gl = createWebGLContext(canvas);

        if (!this.gl) {
            console.error("Failed to initialize Global Preview GL Context");
            return;
        }

        this.placeholderTex = createPlaceholderTexture(this.gl);

        // Upload geometry once
        this.quadGeo = this.uploadGeometry(this.gl, createQuad());
        this.sphereGeo = this.uploadGeometry(this.gl, createSphere(0.8, 32, 32));
        this.boxGeo = this.uploadGeometry(this.gl, createCube());
        this.planeGeo = this.uploadGeometry(this.gl, createPlane());

        this.startLoop();
    }

    private uploadGeometry(gl: WebGLRenderingContext, data: any): GLGeometry | null {
        const position = gl.createBuffer();
        if (!position) return null;
        gl.bindBuffer(gl.ARRAY_BUFFER, position);
        gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);

        const normal = gl.createBuffer();
        if (!normal) return null;
        gl.bindBuffer(gl.ARRAY_BUFFER, normal);
        gl.bufferData(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);

        const uv = gl.createBuffer();
        if (!uv) return null;
        gl.bindBuffer(gl.ARRAY_BUFFER, uv);
        gl.bufferData(gl.ARRAY_BUFFER, data.uvs, gl.STATIC_DRAW);

        const tangent = gl.createBuffer();
        if (!tangent) return null;
        gl.bindBuffer(gl.ARRAY_BUFFER, tangent);
        gl.bufferData(gl.ARRAY_BUFFER, data.tangents, gl.STATIC_DRAW);

        const color = gl.createBuffer();
        if (!color) return null;
        gl.bindBuffer(gl.ARRAY_BUFFER, color);
        gl.bufferData(gl.ARRAY_BUFFER, data.colors, gl.STATIC_DRAW);

        const indices = gl.createBuffer();
        if (!indices) return null;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

        return { position, normal, uv, tangent, color, indices, count: data.indices.length };
    }

    destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Cleanup Geometry
        if (this.gl) {
            const cleanupGeo = (geo: GLGeometry | null) => {
                if (!geo) return;
                this.gl!.deleteBuffer(geo.position);
                this.gl!.deleteBuffer(geo.normal);
                this.gl!.deleteBuffer(geo.uv);
                this.gl!.deleteBuffer(geo.tangent);
                this.gl!.deleteBuffer(geo.color);
                this.gl!.deleteBuffer(geo.indices);
            };
            cleanupGeo(this.quadGeo);
            cleanupGeo(this.sphereGeo);
            cleanupGeo(this.boxGeo);
            cleanupGeo(this.planeGeo);

            this.items.clear();
            this.programs.forEach(p => this.gl!.deleteProgram(p));
            this.programs.clear();
            this.textures.forEach(t => this.gl!.deleteTexture(t));
            this.textures.clear();
            if (this.placeholderTex) this.gl!.deleteTexture(this.placeholderTex);
        }

        this.gl = null;
        this.canvas = null;
    }

    register(id: string, data: Omit<RenderItem, 'timestamp'>) {
        this.items.set(id, { ...data, timestamp: Date.now() });
    }

    updateRotation(id: string, rotation: { x: number, y: number }) {
        const item = this.items.get(id);
        if (item) {
            item.rotation = rotation;
        }
    }

    unregister(id: string) {
        this.items.delete(id);
    }

    /**
     * Generates a 32-bit integer hash from a string using DJB2 algorithm.
     * This ensures that ANY change in the shader string (even in the middle body)
     * produces a different hash, solving caching issues with nodes like Swizzle.
     */
    private hashString(str: string): number {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }

    private getProgramKey(vert: string, frag: string): string {
        const vHash = this.hashString(vert);
        const fHash = this.hashString(frag);
        return `${vert.length}:${vHash}-${frag.length}:${fHash}`;
    }

    private startLoop() {
        const render = (time: number) => {
            if (!this.gl || !this.canvas) return;

            const dpr = window.devicePixelRatio || 1;
            const displayWidth = this.canvas.clientWidth * dpr;
            const displayHeight = this.canvas.clientHeight * dpr;

            if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
                this.canvas.width = displayWidth;
                this.canvas.height = displayHeight;
            }

            this.gl.disable(this.gl.SCISSOR_TEST);
            this.gl.clearColor(0, 0, 0, 0);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

            this.gl.enable(this.gl.SCISSOR_TEST);

            const canvasRect = this.canvas.getBoundingClientRect();

            this.items.forEach((item) => {
                this.renderItem(item, time, dpr, canvasRect);
            });

            this.animationFrameId = requestAnimationFrame(render);
        };
        this.animationFrameId = requestAnimationFrame(render);
    }

    private renderItem(item: RenderItem, time: number, dpr: number, canvasRect: DOMRect) {
        const gl = this.gl!;
        const canvasHeight = this.canvas!.height;

        // 1. Calculate Scissor Box relative to Canvas
        const rect = item.element.getBoundingClientRect();

        if (
            rect.bottom < 0 ||
            rect.top > window.innerHeight ||
            rect.right < 0 ||
            rect.left > window.innerWidth ||
            rect.width === 0 ||
            rect.height === 0
        ) {
            return;
        }

        const relativeTop = rect.top - canvasRect.top;
        const relativeLeft = rect.left - canvasRect.left;

        const width = rect.width * dpr;
        const height = rect.height * dpr;
        const x = relativeLeft * dpr;
        const y = canvasHeight - (relativeTop * dpr) - height;

        gl.viewport(x, y, width, height);
        gl.scissor(x, y, width, height);

        gl.clearColor(0.05, 0.05, 0.05, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // 2. Get/Compile Shader
        const progKey = this.getProgramKey(item.vertShader, item.fragShader);
        let program = this.programs.get(progKey);

        if (!program) {
            try {
                const p = createProgram(gl, item.vertShader, item.fragShader);
                if (p) {
                    this.programs.set(progKey, p);
                    program = p;
                } else {
                    return;
                }
            } catch (e) {
                return;
            }
        }

        gl.useProgram(program!);

        // 3. Geometry
        let geo = this.sphereGeo;
        if (item.mode === '3d') {
            if (item.previewObject === 'box') geo = this.boxGeo;
            else if (item.previewObject === 'quad') geo = this.planeGeo;
            else geo = this.sphereGeo;
        } else {
            geo = this.quadGeo;
        }

        if (!geo) return;

        this.bindAttribute(program!, 'position', geo.position, 3);
        this.bindAttribute(program!, 'normal', geo.normal, 3);
        this.bindAttribute(program!, 'uv', geo.uv, 2);
        this.bindAttribute(program!, 'tangent', geo.tangent, 4);
        this.bindAttribute(program!, 'color', geo.color, 4);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.indices);

        // 4. Uniforms & Matrices
        const aspect = width / height;
        const projection = new Float32Array(16);
        const view = new Float32Array(16);
        const model = new Float32Array(16);

        if (item.mode === '3d') {
            mat4.perspective(projection, Math.PI / 4, aspect, 0.1, 100.0);

            // Adjust camera distance based on shape
            let dist = 2.5;
            if (item.previewObject === 'box') dist = 4.5;
            else if (item.previewObject === 'quad') dist = 3.2;

            mat4.lookAt(view, [0, 0, dist], [0, 0, 0], [0, 1, 0]);

            mat4.identity(model);
            const rotX = item.rotation?.x ?? 0.5;
            const rotY = item.rotation?.y ?? 0.5;
            mat4.rotateX(model, model, rotX);
            mat4.rotateY(model, model, rotY);
        } else {
            mat4.identity(projection);
            mat4.identity(view);
            mat4.identity(model);
        }

        const modelInv = new Float32Array(16);
        const viewInv = new Float32Array(16);
        mat4.invert(modelInv, model);
        mat4.invert(viewInv, view);

        this.setUniformMatrix(program!, 'u_projection', projection);
        this.setUniformMatrix(program!, 'u_view', view);
        this.setUniformMatrix(program!, 'u_model', model);
        this.setUniformMatrix(program!, 'u_model_inv', modelInv);
        this.setUniformMatrix(program!, 'u_view_inv', viewInv);

        // Bounds Uniforms
        const uBoundsMin = gl.getUniformLocation(program!, 'u_boundsMin');
        if (uBoundsMin) gl.uniform3f(uBoundsMin, -0.8, -0.8, -0.8);
        const uBoundsMax = gl.getUniformLocation(program!, 'u_boundsMax');
        if (uBoundsMax) gl.uniform3f(uBoundsMax, 0.8, 0.8, 0.8);

        // Preview Mode: 0 for 2D/Unlit, 1 for 3D/Lit
        const uPreviewMode = gl.getUniformLocation(program!, 'u_previewMode');
        if (uPreviewMode) gl.uniform1i(uPreviewMode, item.mode === '3d' ? 1 : 0);

        const uTime = gl.getUniformLocation(program!, 'u_time');
        if (uTime) gl.uniform1f(uTime, time * 0.001);

        // Camera Uniforms
        const camPos = item.mode === '3d' ? [0, 0, 2.5] : [0, 0, 1];
        const uCamPos = gl.getUniformLocation(program!, 'u_cameraPosition');
        if (uCamPos) gl.uniform3f(uCamPos, camPos[0], camPos[1], camPos[2]);

        // --- NEW: Camera Near/Far for Depth Calculations ---
        const uCamNear = gl.getUniformLocation(program!, 'u_cameraNear');
        const uCamFar = gl.getUniformLocation(program!, 'u_cameraFar');
        if (uCamNear) gl.uniform1f(uCamNear, 0.1);
        if (uCamFar) gl.uniform1f(uCamFar, 100.0);
        // ----------------------------------------------------

        // Viewport Uniform (Critical for Screen Position node logic)
        // Pass x, y, width, height (Scissor Box)
        const uViewPort = gl.getUniformLocation(program!, 'u_viewPort');
        if (uViewPort) gl.uniform4f(uViewPort, x, y, width, height);

        // 5. Textures
        if (this.placeholderTex) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.placeholderTex);
            const missingLoc = gl.getUniformLocation(program!, 'u_tex_missing');
            if (missingLoc) gl.uniform1i(missingLoc, 0);
        }

        let texUnit = 1;
        Object.entries(item.textures).forEach(([name, config]) => {
            if (typeof config !== 'object' || !config.url) return;
            const src = config.url;
            let tex = this.textures.get(src);
            if (!tex) {
                const t = loadTexture(gl, src, config.wrap, config.filter);
                if (t) {
                    this.textures.set(src, t);
                    tex = t;
                }
            }
            if (tex) {
                gl.activeTexture(gl.TEXTURE0 + texUnit);
                applyTextureParams(gl, tex, config.wrap, config.filter);

                // Bind the Texture Sampler
                const loc = gl.getUniformLocation(program!, name);
                if (loc) gl.uniform1i(loc, texUnit);

                // AUTOMATICALLY BIND TEXTURE SIZE UNIFORM (if shader asks for it)
                // The GLSL Generator creates uniforms named `u_texDim_{ID}`
                // The texture uniform is `u_tex_{ID}`. We replace to find the matching dimension uniform.
                const dimName = name.replace('u_tex_', 'u_texDim_');
                const dimLoc = gl.getUniformLocation(program!, dimName);
                if (dimLoc) {
                    const size = (tex as any)._size || [1024, 1024]; // Default safety
                    gl.uniform2f(dimLoc, size[0], size[1]);
                }

                texUnit++;
            }
        });

        gl.drawElements(gl.TRIANGLES, geo.count, gl.UNSIGNED_SHORT, 0);
    }

    private bindAttribute(program: WebGLProgram, name: string, buffer: WebGLBuffer, size: number) {
        const gl = this.gl!;
        const loc = gl.getAttribLocation(program, name);
        if (loc === -1) return;

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }

    private setUniformMatrix(program: WebGLProgram, name: string, data: Float32Array) {
        const loc = this.gl!.getUniformLocation(program, name);
        if (loc) this.gl!.uniformMatrix4fv(loc, false, data);
    }
}

export const previewSystem = new PreviewSystem();
