
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { previewSystem } from '../services/render/previewSystem';
import { AlertTriangle } from 'lucide-react';

interface PreviewProps {
  fragShader: string;
  vertShader?: string;
  mode?: '2d' | '3d';
  // Updated texture interface
  textures?: Record<string, { url: string; wrap: string; filter: string; }>;
  // We pass a unique ID to identify this preview instance in the global map
  nodeId?: string;
  previewObject?: 'sphere' | 'box' | 'quad';
  rotation?: { x: number; y: number };
  onRotationChange?: (rotation: { x: number; y: number }) => void;
}

const DEFAULT_VERT = `
  precision highp float;
  attribute vec3 position;
  attribute vec2 uv;
  attribute vec3 normal;
  attribute vec4 tangent;
  attribute vec4 color;
  
  uniform mat4 u_model;
  uniform mat4 u_view;
  uniform mat4 u_projection;
  
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vObjectPosition;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  varying vec3 vObjectNormal;
  varying vec3 vObjectTangent;
  varying vec4 vColor;

  void main() {
    vUv = uv;
    vObjectPosition = position;
    vObjectNormal = normal;
    vObjectTangent = tangent.xyz;
    vColor = color;
    
    vec4 worldPos = u_model * vec4(position, 1.0);
    vPosition = worldPos.xyz;
    
    mat3 normalMatrix = mat3(u_model);
    vec3 n = normalize(normalMatrix * normal);
    vec3 t = normalize(normalMatrix * tangent.xyz);
    vec3 b = normalize(cross(n, t) * tangent.w);
    vNormal = n;
    vTangent = t;
    vBitangent = b;

    gl_Position = u_projection * u_view * worldPos;
  }
`;

export const Preview: React.FC<PreviewProps> = ({
  fragShader,
  vertShader,
  mode = '3d',
  textures = {},
  nodeId,
  previewObject,
  rotation = { x: 0.5, y: 0.5 },
  onRotationChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Unique ID for registration
  const id = useRef(nodeId || Math.random().toString(36).substr(2, 9));

  // Local rotation state for smooth dragging without React re-renders
  const currentRotation = useRef(rotation);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Sync prop changes to ref (if changed externally)
  useEffect(() => {
    currentRotation.current = rotation;
    previewSystem.updateRotation(id.current, rotation);
  }, [rotation]);

  // Register with Global System
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    previewSystem.register(id.current, {
      id: id.current,
      element: containerRef.current,
      fragShader: String(fragShader),
      vertShader: String(vertShader || DEFAULT_VERT),
      mode: mode as '2d' | '3d',
      previewObject,
      rotation: currentRotation.current, // Initial rotation
      textures // Pass the complex texture object
    });

    return () => {
      previewSystem.unregister(id.current);
    };
  }, [fragShader, vertShader, mode, textures, previewObject]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== '3d') return; // Only rotate 3D previews
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    // Global listeners for drag and release
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;

    const deltaX = e.clientX - lastMousePos.current.x;
    const deltaY = e.clientY - lastMousePos.current.y;

    lastMousePos.current = { x: e.clientX, y: e.clientY };

    // Update rotation
    currentRotation.current = {
      x: currentRotation.current.x + deltaY * 0.01,
      y: currentRotation.current.y + deltaX * 0.01
    };

    // Update system directly for performance
    previewSystem.updateRotation(id.current, currentRotation.current);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);

    // Commit change to persistence
    if (onRotationChange) {
      onRotationChange(currentRotation.current);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      className={`w-full h-full relative bg-transparent ${mode === '3d' ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* We can still show React-based errors here if needed */}
    </div>
  );
};
