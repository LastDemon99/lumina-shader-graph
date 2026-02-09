
/**
 * Utility to process texture files, specifically to handle formats
 * not natively supported by the browser (like TGA).
 */

// TGA Constants
const TGA_TYPE_NO_DATA = 0;
const TGA_TYPE_INDEXED = 1;
const TGA_TYPE_RGB = 2;
const TGA_TYPE_GREY = 3;
const TGA_TYPE_RLE_INDEXED = 9;
const TGA_TYPE_RLE_RGB = 10;
const TGA_TYPE_RLE_GREY = 11;

function tgaGetImageData(buffer: ArrayBuffer): ImageData | null {
    const data = new Uint8Array(buffer);
    if (data.length < 18) {
        console.error("TGA header too short");
        return null;
    }

    let offset = 0;
    const idLength = data[offset++];
    const colorMapType = data[offset++];
    const imageType = data[offset++];
    
    // Color Map Spec
    const colorMapFirstEntry = data[offset] | (data[offset + 1] << 8); offset += 2;
    const colorMapLength = data[offset] | (data[offset + 1] << 8); offset += 2;
    const colorMapEntrySize = data[offset++];

    // Image Spec
    const xOrigin = data[offset] | (data[offset + 1] << 8); offset += 2;
    const yOrigin = data[offset] | (data[offset + 1] << 8); offset += 2;
    const width = data[offset] | (data[offset + 1] << 8); offset += 2;
    const height = data[offset] | (data[offset + 1] << 8); offset += 2;
    const pixelDepth = data[offset++];
    const imageDescriptor = data[offset++];

    // Validate simple types
    const isIndexed = imageType === TGA_TYPE_INDEXED || imageType === TGA_TYPE_RLE_INDEXED;
    const isRGB = imageType === TGA_TYPE_RGB || imageType === TGA_TYPE_RLE_RGB;
    const isGrey = imageType === TGA_TYPE_GREY || imageType === TGA_TYPE_RLE_GREY;

    if (!isIndexed && !isRGB && !isGrey) {
        console.error("Unsupported TGA Image Type:", imageType);
        return null;
    }

    // Skip Image ID
    offset += idLength;

    // Read Color Map
    let colorMap: Uint8Array | null = null;
    let bytesPerPaletteEntry = 0;
    if (colorMapType === 1) {
        bytesPerPaletteEntry = colorMapEntrySize / 8;
        const colorMapSizeBytes = colorMapLength * bytesPerPaletteEntry;
        if (offset + colorMapSizeBytes > data.length) {
             console.error("TGA file truncated (Color Map)");
             return null;
        }
        colorMap = data.subarray(offset, offset + colorMapSizeBytes);
        offset += colorMapSizeBytes;
    }

    const pixelCount = width * height;
    const imageData = new Uint8ClampedArray(pixelCount * 4);
    const bytesPerPixel = pixelDepth / 8;

    let currentPixel = 0;

    // Helper: Read a single color from data stream or palette
    // returns [r, g, b, a]
    const getColor = (srcOffset: number): [number, number, number, number] => {
        let r = 0, g = 0, b = 0, a = 255;

        // Indexed Color (Type 1 or 9)
        if (isIndexed) {
             if (!colorMap) return [255, 0, 255, 255]; // Error: Missing palette

             // Read Index (supports 8-bit or 16-bit indices, though 8 is standard)
             let index = data[srcOffset];
             if (bytesPerPixel === 2) {
                 index = data[srcOffset] | (data[srcOffset+1] << 8);
             }
             
             index -= colorMapFirstEntry;

             if (index < 0 || index >= colorMapLength) {
                 return [0, 0, 0, 255]; // Out of bounds
             }

             const pOff = index * bytesPerPaletteEntry;
             
             if (colorMapEntrySize === 24) {
                 b = colorMap[pOff];
                 g = colorMap[pOff+1];
                 r = colorMap[pOff+2];
                 a = 255;
             } else if (colorMapEntrySize === 32) {
                 b = colorMap[pOff];
                 g = colorMap[pOff+1];
                 r = colorMap[pOff+2];
                 a = colorMap[pOff+3];
             } else if (colorMapEntrySize === 16) { // 15/16 bit palette
                 const val = colorMap[pOff] | (colorMap[pOff+1] << 8);
                 r = ((val >> 10) & 0x1F) * 8;
                 g = ((val >> 5) & 0x1F) * 8;
                 b = (val & 0x1F) * 8;
                 a = (val & 0x8000) ? 255 : 0;
             }
        } 
        // Greyscale (Type 3 or 11)
        else if (isGrey) {
            const val = data[srcOffset];
            r = g = b = val;
            if (bytesPerPixel === 2) {
                a = data[srcOffset+1];
            }
        } 
        // RGB (Type 2 or 10)
        else {
             if (bytesPerPixel === 4) { // 32-bit BGRA
                 b = data[srcOffset];
                 g = data[srcOffset+1];
                 r = data[srcOffset+2];
                 a = data[srcOffset+3];
             } else if (bytesPerPixel === 3) { // 24-bit BGR
                 b = data[srcOffset];
                 g = data[srcOffset+1];
                 r = data[srcOffset+2];
                 a = 255;
             } else if (bytesPerPixel === 2) { // 16-bit 555
                 const val = data[srcOffset] | (data[srcOffset+1] << 8);
                 r = ((val >> 10) & 0x1F) * 8;
                 g = ((val >> 5) & 0x1F) * 8;
                 b = (val & 0x1F) * 8;
                 // Most TGA 16-bit use MSB as alpha bit or ignored
                 a = (val & 0x8000) ? 255 : 0; 
                 // If descriptor says 0 attribute bits, usually implies ignore alpha (force 255)
                 // But some software writes 0 attr bits and still uses alpha bit.
                 // Heuristic: If A is 0, verify if it should be 255.
                 if (a === 0 && (imageDescriptor & 0x0F) === 0) a = 255; 
             }
        }
        return [r, g, b, a];
    };

    const isRLE = (imageType >= 9);

    while (currentPixel < pixelCount && offset < data.length) {
        let chunkCount = 0; // Number of pixels in this chunk
        let isChunkRLE = false;

        if (isRLE) {
            const header = data[offset++];
            chunkCount = (header & 0x7F) + 1;
            isChunkRLE = (header & 0x80) !== 0;
        } else {
            // For non-RLE images, treat remaining pixels as one large RAW chunk
            chunkCount = pixelCount - currentPixel;
            isChunkRLE = false;
        }

        if (isChunkRLE) {
            // RLE Packet: Read ONE color, repeat 'chunkCount' times
            const color = getColor(offset);
            offset += bytesPerPixel;

            for (let i = 0; i < chunkCount; i++) {
                if (currentPixel >= pixelCount) break;
                const idx = currentPixel * 4;
                imageData[idx] = color[0];
                imageData[idx+1] = color[1];
                imageData[idx+2] = color[2];
                imageData[idx+3] = color[3];
                currentPixel++;
            }
        } else {
            // Raw Packet: Read 'chunkCount' colors
            for (let i = 0; i < chunkCount; i++) {
                if (currentPixel >= pixelCount) break;
                const color = getColor(offset);
                offset += bytesPerPixel;
                
                const idx = currentPixel * 4;
                imageData[idx] = color[0];
                imageData[idx+1] = color[1];
                imageData[idx+2] = color[2];
                imageData[idx+3] = color[3];
                currentPixel++;
            }
        }
    }

    // Handle Orientation (Top-Left vs Bottom-Left)
    // Bit 5 of Image Descriptor: 0 = Bottom-Left, 1 = Top-Left
    // Canvas is Top-Left. If TGA is Bottom-Left (default), flip Y.
    if ((imageDescriptor & 0x20) === 0) {
        const stride = width * 4;
        const tempRow = new Uint8Array(stride);
        for (let y = 0; y < Math.floor(height / 2); y++) {
            const topRowIdx = y * stride;
            const bottomRowIdx = (height - 1 - y) * stride;
            
            // Swap
            tempRow.set(imageData.subarray(topRowIdx, topRowIdx + stride));
            imageData.set(imageData.subarray(bottomRowIdx, bottomRowIdx + stride), topRowIdx);
            imageData.set(tempRow, bottomRowIdx);
        }
    }

    return new ImageData(imageData, width, height);
}

async function tgaToDataURL(buffer: ArrayBuffer): Promise<string> {
    const imageData = tgaGetImageData(buffer);
    if (!imageData) throw new Error("Failed to decode TGA");

    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas context failed");

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
}

export async function processTextureFile(file: File): Promise<string> {
    const name = file.name.toLowerCase();

    // Handle TGA
    if (name.endsWith('.tga') || name.endsWith('.vda') || name.endsWith('.icb') || name.endsWith('.vst')) {
        try {
            const buffer = await file.arrayBuffer();
            return await tgaToDataURL(buffer);
        } catch (e) {
            console.error("TGA Parse Error:", e);
            throw e;
        }
    }

    // Default Browser Supported Formats (PNG, JPEG, WEBP, GIF, BMP)
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (reader.result) {
                resolve(reader.result as string);
            } else {
                reject("Empty file result");
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Creates a vertical texture atlas from an array of images.
 * Validates that all images have the same dimensions as the first one.
 */
export async function createTextureAtlas(layers: string[]): Promise<string> {
    if (layers.length === 0) throw new Error("No layers provided");

    const loadedImages: HTMLImageElement[] = [];

    // 1. Load all images first to get dimensions
    for (const src of layers) {
        await new Promise<void>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                loadedImages.push(img);
                resolve();
            };
            img.onerror = reject;
            img.src = src;
        });
    }

    // 2. Validate Dimensions
    const width = loadedImages[0].width;
    const height = loadedImages[0].height;

    for (let i = 1; i < loadedImages.length; i++) {
        if (loadedImages[i].width !== width || loadedImages[i].height !== height) {
            throw new Error(`Dimension mismatch: Layer ${i} is ${loadedImages[i].width}x${loadedImages[i].height}, expected ${width}x${height}`);
        }
    }

    // 3. Create Atlas Canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height * loadedImages.length;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error("Failed to get 2D context for Atlas");

    // 4. Draw Images Vertically
    // Index 0 at top (y=0)
    for (let i = 0; i < loadedImages.length; i++) {
        ctx.drawImage(loadedImages[i], 0, i * height);
    }

    return canvas.toDataURL('image/png');
}
