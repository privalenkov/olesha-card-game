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
export const VIEWER_VIGNETTE = {
  offset: 0.24,
  darkness: 0.36,
} as const;
export const VIEWER_BASE_TILT_X = 0.03;
export const VIEWER_HOVER_TILT_X = 0.42;
export const VIEWER_HOVER_TILT_Y = 0.34;
export const VIEWER_IDLE_ROLL_SPEED = 0.45;
export const VIEWER_IDLE_ROLL_AMPLITUDE = 0.018;

export function SharedViewerLighting({
  accentColor = '#74dbff',
}: {
  accentColor?: ColorRepresentation;
}) {
  return (
    <>
      <ambientLight intensity={0.36} color="#e8eff8" />
      <hemisphereLight intensity={0.78} color="#f6fbff" groundColor="#151923" />
      <directionalLight
        position={[VIEWER_LIGHTS.key.x, VIEWER_LIGHTS.key.y, VIEWER_LIGHTS.key.z]}
        intensity={2.9}
        color="#fff1dd"
      />
      <directionalLight
        position={[VIEWER_LIGHTS.rim.x, VIEWER_LIGHTS.rim.y, VIEWER_LIGHTS.rim.z]}
        intensity={1.05}
        color="#9ecbff"
      />
      <pointLight
        position={[VIEWER_LIGHTS.fill.x, VIEWER_LIGHTS.fill.y, VIEWER_LIGHTS.fill.z]}
        intensity={14}
        distance={18}
        decay={2}
        color="#cfe4ff"
      />
      <pointLight
        position={[VIEWER_LIGHTS.accent.x, VIEWER_LIGHTS.accent.y, VIEWER_LIGHTS.accent.z]}
        intensity={10}
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
