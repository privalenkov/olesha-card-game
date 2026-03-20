import { EffectComposer, Vignette } from '@react-three/postprocessing';
import type { ColorRepresentation } from 'three';
import { Vector3 } from 'three';

export const VIEWER_LIGHTS = {
  key: new Vector3(3.9, 6.2, 7.6),
  fill: new Vector3(-5.4, 1.4, 5.8),
  accent: new Vector3(2.4, -2.2, 7.2),
  rim: new Vector3(-4.6, 2.8, -5.4),
} as const;

export const VIEWER_CANVAS_FOV = 30;
export const VIEWER_CANVAS_DPR: [number, number] = [1, 2];
export const VIEWER_CANVAS_BACKGROUND = '#080910';
export const VIEWER_VIGNETTE = {
  offset: 0.24,
  darkness: 0.36,
} as const;
export const VIEWER_BASE_TILT_X = 0.03;
export const VIEWER_HOVER_TILT_X = 0.42;
export const VIEWER_HOVER_TILT_Y = 0.34;
export const VIEWER_IDLE_ROLL_SPEED = 0.45;
export const VIEWER_IDLE_ROLL_AMPLITUDE = 0.018;

interface SharedViewerLightingProps {
  accentColor?: ColorRepresentation;
  ambientColor?: ColorRepresentation;
  ambientIntensity?: number;
  hemisphereColor?: ColorRepresentation;
  hemisphereGroundColor?: ColorRepresentation;
  hemisphereIntensity?: number;
  keyColor?: ColorRepresentation;
  keyIntensity?: number;
  rimColor?: ColorRepresentation;
  rimIntensity?: number;
  fillColor?: ColorRepresentation;
  fillIntensity?: number;
  accentIntensity?: number;
}

export function SharedViewerLighting({
  accentColor = '#74dbff',
  ambientColor = '#e8eff8',
  ambientIntensity = 0.36,
  hemisphereColor = '#f6fbff',
  hemisphereGroundColor = '#151923',
  hemisphereIntensity = 0.78,
  keyColor = '#fff1dd',
  keyIntensity = 2.9,
  rimColor = '#9ecbff',
  rimIntensity = 1.05,
  fillColor = '#cfe4ff',
  fillIntensity = 14,
  accentIntensity = 10,
}: SharedViewerLightingProps) {
  return (
    <>
      <ambientLight intensity={ambientIntensity} color={ambientColor} />
      <hemisphereLight
        intensity={hemisphereIntensity}
        color={hemisphereColor}
        groundColor={hemisphereGroundColor}
      />
      <directionalLight
        position={[VIEWER_LIGHTS.key.x, VIEWER_LIGHTS.key.y, VIEWER_LIGHTS.key.z]}
        intensity={keyIntensity}
        color={keyColor}
      />
      <directionalLight
        position={[VIEWER_LIGHTS.rim.x, VIEWER_LIGHTS.rim.y, VIEWER_LIGHTS.rim.z]}
        intensity={rimIntensity}
        color={rimColor}
      />
      <pointLight
        position={[VIEWER_LIGHTS.fill.x, VIEWER_LIGHTS.fill.y, VIEWER_LIGHTS.fill.z]}
        intensity={fillIntensity}
        distance={18}
        decay={2}
        color={fillColor}
      />
      <pointLight
        position={[VIEWER_LIGHTS.accent.x, VIEWER_LIGHTS.accent.y, VIEWER_LIGHTS.accent.z]}
        intensity={accentIntensity}
        distance={16}
        decay={2}
        color={accentColor}
      />
    </>
  );
}

export function SharedViewerPostProcessing() {
  return (
    <EffectComposer>
      <Vignette
        eskil={false}
        offset={VIEWER_VIGNETTE.offset}
        darkness={VIEWER_VIGNETTE.darkness}
      />
    </EffectComposer>
  );
}
