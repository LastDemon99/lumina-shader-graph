

// WebGL Boilerplate Utilities

export const createWebGLContext = (canvas: HTMLCanvasElement): WebGLRenderingContext | null => {
    // Try to get context, handle failure
    const gl = canvas.getContext('webgl', { 
        preserveDrawingBuffer: false, 
        antialias: true,
        alpha: true
    });
    
    if (!gl) return null;

    // CRITICAL EXTENSIONS
    // If these fail, the context might still work but shaders relying on them will fail
    // In strict mode we could check for null return here
    gl.getExtension('OES_standard_derivatives');
    gl.getExtension('EXT_shader_texture_lod');

    // GLOBAL CONFIGURATION
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return gl;
};

export const createShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        // Fallback message if log is null (e.g. context lost)
        const log = gl.getShaderInfoLog(shader) || 'Unknown Compile Error (Context might be lost)';
        console.error((type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment') + ' Shader Error:', log);
        
        // Cleanup failed shader
        gl.deleteShader(shader);
        
        throw new Error((type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment') + ' Compile Error: ' + log);
    }

    return shader;
};

export const createProgram = (gl: WebGLRenderingContext, vertSource: string, fragSource: string): WebGLProgram | null => {
    const vShader = createShader(gl, gl.VERTEX_SHADER, vertSource);
    const fShader = createShader(gl, gl.FRAGMENT_SHADER, fragSource);

    if (!vShader || !fShader) {
        if(vShader) gl.deleteShader(vShader);
        if(fShader) gl.deleteShader(fShader);
        return null;
    }

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) || 'Unknown Link Error';
        gl.deleteProgram(program);
        gl.deleteShader(vShader);
        gl.deleteShader(fShader);
        throw new Error('Program Link Error: ' + log);
    }

    return program;
};

// Helper to resize image to Power of Two
const resizeToPOT = (image: HTMLImageElement): HTMLImageElement | HTMLCanvasElement => {
    const w = image.width;
    const h = image.height;
    const isPowerOfTwo = (value: number) => (value & (value - 1)) === 0 && value > 0;
    
    if (isPowerOfTwo(w) && isPowerOfTwo(h)) return image;

    const canvas = document.createElement('canvas');
    canvas.width = Math.pow(2, Math.round(Math.log(w) / Math.LN2));
    canvas.height = Math.pow(2, Math.round(Math.log(h) / Math.LN2));
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas;
    }
    return image;
};

export const createPlaceholderTexture = (gl: WebGLRenderingContext): WebGLTexture | null => {
    const tex = gl.createTexture();
    if (tex) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // 1x1 Black Pixel Opaque
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        
        // Attach default size
        (tex as any)._size = [1, 1];
    }
    return tex;
};

export const applyTextureParams = (gl: WebGLRenderingContext, tex: WebGLTexture, wrapStr: string = 'Repeat', filterStr: string = 'Linear') => {
    gl.bindTexture(gl.TEXTURE_2D, tex);

    // Wrap
    let wrap: number = gl.REPEAT;
    if (wrapStr === 'Clamp') wrap = gl.CLAMP_TO_EDGE;
    else if (wrapStr === 'Mirror') wrap = gl.MIRRORED_REPEAT;
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);

    // Filter
    // We use Mipmaps for Linear/Trilinear usually
    if (filterStr === 'Point') {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    } else {
        // Linear or Trilinear
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
};

export const loadTexture = (gl: WebGLRenderingContext, src: string, wrap?: string, filter?: string, existingTex?: WebGLTexture): WebGLTexture | null => {
    const tex = existingTex || gl.createTexture();
    if (!tex) return null;

    gl.bindTexture(gl.TEXTURE_2D, tex);

    // Initial placeholder (Magenta to indicate loading) if strictly new
    if (!existingTex) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 255, 255]));
        (tex as any)._size = [1, 1];
    }

    const img = new Image();
    img.onload = () => {
        // Ensure context is not lost before binding
        if (gl.isContextLost()) return;
        
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        
        // Store original dimensions for textureSize node BEFORE resizing to POT
        (tex as any)._size = [img.width, img.height];

        const texSource = resizeToPOT(img);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texSource);
        
        gl.generateMipmap(gl.TEXTURE_2D);
        
        // Apply params after generation
        applyTextureParams(gl, tex, wrap, filter);
    };
    
    // Handle Data URLs and regular URLs
    img.src = src;

    return tex;
};
