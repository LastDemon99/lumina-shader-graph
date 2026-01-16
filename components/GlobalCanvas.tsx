
import React, { useEffect, useRef } from 'react';
import { previewSystem } from '../services/previewSystem';

export const GlobalCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (canvasRef.current) {
            previewSystem.init(canvasRef.current);
        }
        return () => {
            previewSystem.destroy();
        };
    }, []);

    return (
        <canvas 
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-[15]" // Z-15: Above Nodes (10) but Below UI (20)
        />
    );
};
