
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { previewSystem } from '../services/previewSystem';
import { AlertTriangle } from 'lucide-react';

interface PreviewProps {
  fragShader: string;
  vertShader?: string; 
  mode?: '2d' | '3d';
  // Updated texture interface
  textures?: Record<string, { url: string; wrap: string; filter: string; }>;
  // We pass a unique ID to identify this preview instance in the global map
  nodeId?: string; 
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

export const Preview: React.FC<PreviewProps> = ({ fragShader, vertShader, mode = '3d', textures = {}, nodeId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Unique ID for registration
  const id = useRef(nodeId || Math.random().toString(36).substr(2, 9));

  // Register with Global System
  useLayoutEffect(() => {
      if (!containerRef.current) return;

      previewSystem.register(id.current, {
          id: id.current,
          element: containerRef.current,
          fragShader: String(fragShader),
          vertShader: String(vertShader || DEFAULT_VERT),
          mode: mode as '2d' | '3d',
          textures // Pass the complex texture object
      });

      return () => {
          previewSystem.unregister(id.current);
      };
  }, [fragShader, vertShader, mode, textures]);

  return (
    <div 
        ref={containerRef} 
        className="w-full h-full relative bg-transparent" // Transparent so the Global Canvas behind (or overlaid) shows through? 
        // Actually, if Global Canvas is z-index 5 (Overlay), this div just acts as a placeholder for coordinates.
        // The background color doesn't matter as the canvas draws ON TOP.
    >
      {/* We can still show React-based errors here if needed */}
    </div>
  );
};
