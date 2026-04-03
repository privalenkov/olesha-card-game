import { memo, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import {
  Group,
  LinearFilter,
  MathUtils,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';
import {
  rarityRevealImpactOrder,
  rarityRevealImpactProfiles,
} from '../game/rarityRevealEffects';
import type { Rarity } from '../game/types';
import {
  VIEWER_CANVAS_BACKGROUND,
  VIEWER_CANVAS_DPR,
  VIEWER_CANVAS_FOV,
} from './viewerSceneProfile';

interface ImpactParticleConfig {
  angle: number;
  radiusStart: number;
  radiusEnd: number;
  yLift: number;
  size: number;
  spin: number;
  delay: number;
  depth: number;
  orbit: number;
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 127.1) * 43758.5453123;
  return value - Math.floor(value);
}

export function useImpactParticleTextures() {
  const textures = useLoader(
    TextureLoader,
    rarityRevealImpactOrder.map((rarity) => rarityRevealImpactProfiles[rarity].iconUrl),
  );

  return useMemo(
    () =>
      Object.fromEntries(
        rarityRevealImpactOrder.map((rarity, index) => {
          const texture = textures[index];
          texture.colorSpace = SRGBColorSpace;
          texture.magFilter = LinearFilter;
          texture.minFilter = LinearFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
          return [rarity, texture];
        }),
      ) as Record<Rarity, Texture>,
    [textures],
  );
}

export function createImpactParticleConfigs(rarity: Rarity) {
  const profile = rarityRevealImpactProfiles[rarity];

  return Array.from({ length: profile.count }, (_, index): ImpactParticleConfig => {
    const seed = index + 1;
    const band = index % 3;
    const angle =
      (index / profile.count) * Math.PI * 2 +
      (seededUnit(seed * 1.37) - 0.5) * profile.angleJitter;
    const radiusStart = MathUtils.lerp(
      profile.radiusStartMin,
      profile.radiusStartMax,
      seededUnit(seed * 2.11),
    );
    const radiusEnd =
      profile.reach * (0.74 + seededUnit(seed * 3.17) * 0.42) + band * profile.bandOffset;

    return {
      angle,
      radiusStart,
      radiusEnd,
      yLift: (seededUnit(seed * 4.09) - 0.5) * profile.verticalReach + (band - 1) * 0.12,
      size: MathUtils.lerp(profile.sizeMin, profile.sizeMax, seededUnit(seed * 5.33)),
      spin: (seededUnit(seed * 7.07) - 0.5) * Math.PI * profile.spinFactor,
      delay: seededUnit(seed * 8.17) * profile.delaySpread,
      depth: (seededUnit(seed * 9.91) - 0.5) * profile.depthSpread,
      orbit: (seededUnit(seed * 10.73) - 0.5) * profile.orbit,
    };
  });
}

interface ImpactParticleBurstProps {
  durationMs: number;
  loop?: boolean;
  loopDelayMs?: number;
  origin?: readonly [number, number, number];
  rarity: Rarity;
  sizeScale?: number;
  travelScale?: number;
}

function ImpactParticleBurst({
  durationMs,
  loop = false,
  loopDelayMs = 180,
  origin = [0, 0, 0],
  rarity,
  sizeScale = 1,
  travelScale = 1,
}: ImpactParticleBurstProps) {
  const particleRefs = useRef<(Group | null)[]>([]);
  const impactParticleTextures = useImpactParticleTextures();
  const impactParticleConfigs = useMemo(() => createImpactParticleConfigs(rarity), [rarity]);
  const impactParticleTexture = impactParticleTextures[rarity];
  const burstRef = useRef({
    active: true,
    duration: Math.max(durationMs / 1000, 0.9),
    idleUntil: 0,
    progress: 0,
  });

  const impactParticleTextureAspect = useMemo(() => {
    const image = impactParticleTexture?.image as
      | { width?: number; height?: number }
      | undefined;

    if (!image?.width || !image?.height) {
      return 1;
    }

    return image.width / image.height;
  }, [impactParticleTexture]);

  useEffect(() => {
    burstRef.current = {
      active: true,
      duration: Math.max(durationMs / 1000, 0.9),
      idleUntil: 0,
      progress: 0,
    };
  }, [durationMs, rarity]);

  useFrame((state, delta) => {
    if (burstRef.current.active) {
      burstRef.current.progress = Math.min(
        burstRef.current.progress + delta / burstRef.current.duration,
        1,
      );

      if (burstRef.current.progress >= 1) {
        burstRef.current.active = false;
        burstRef.current.idleUntil = state.clock.elapsedTime + loopDelayMs / 1000;
      }
    } else if (loop && state.clock.elapsedTime >= burstRef.current.idleUntil) {
      burstRef.current.active = true;
      burstRef.current.progress = 0;
      burstRef.current.duration = Math.max(durationMs / 1000, 0.9);
    }

    const progress = burstRef.current.active ? burstRef.current.progress : 1;
    const splashProfile = rarityRevealImpactProfiles[rarity];

    particleRefs.current.forEach((particleRef, index) => {
      const config = impactParticleConfigs[index];

      if (!particleRef || !config || !burstRef.current.active) {
        if (particleRef) {
          particleRef.visible = false;
        }
        return;
      }

      const localProgress = MathUtils.clamp(
        (progress - config.delay) / Math.max(splashProfile.burstWindow, 0.001),
        0,
        1,
      );

      if (localProgress <= 0.001) {
        particleRef.visible = false;
        return;
      }

      const burst = localProgress < 1 ? 1 - MathUtils.smoothstep(localProgress, 0.72, 1) : 0;
      const travelProgress = 1 - Math.pow(1 - localProgress, 3.2);
      const radius = MathUtils.lerp(config.radiusStart, config.radiusEnd, travelProgress);
      const angle = config.angle + config.orbit * travelProgress;
      const x = Math.cos(angle) * radius * travelScale;
      const y =
        (Math.sin(angle) * radius * 0.58 + config.yLift * travelProgress) * travelScale;

      particleRef.visible = burst > 0.001;
      particleRef.position.set(
        origin[0] + x,
        origin[1] + y,
        origin[2] + config.depth * travelScale,
      );
      particleRef.rotation.z = config.spin * travelProgress;
      particleRef.scale.setScalar(config.size * sizeScale * (0.14 + burst * 1.28));
    });
  });

  if (!impactParticleTexture || impactParticleConfigs.length === 0) {
    return null;
  }

  return (
    <group>
      {impactParticleConfigs.map((particle, index) => (
        <group
          key={`impact-particle-burst-${index}`}
          ref={(node) => {
            particleRefs.current[index] = node;
          }}
          visible={false}
        >
          <mesh rotation={[0, 0, particle.angle]} scale={[impactParticleTextureAspect, 1, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              alphaTest={0.02}
              depthTest={false}
              depthWrite={false}
              map={impactParticleTexture}
              toneMapped={false}
              transparent
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const MemoImpactParticleBurst = memo(ImpactParticleBurst);

interface RarityImpactParticlesCanvasProps {
  className?: string;
  durationMs: number;
  loop?: boolean;
  loopDelayMs?: number;
  origin?: readonly [number, number, number];
  rarity: Rarity;
  sizeScale?: number;
  travelScale?: number;
}

export function RarityImpactParticlesCanvas({
  className,
  durationMs,
  loop = true,
  loopDelayMs = 180,
  origin = [-3.45, 0, 0],
  rarity,
  sizeScale = 1,
  travelScale = 1,
}: RarityImpactParticlesCanvasProps) {
  return (
    <div className={className} style={{ pointerEvents: 'none' }}>
      <Canvas
        camera={{ position: [0, 0, 10.6], fov: VIEWER_CANVAS_FOV }}
        dpr={VIEWER_CANVAS_DPR}
        gl={{ alpha: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(VIEWER_CANVAS_BACKGROUND, 0);
        }}
        style={{ background: 'transparent', pointerEvents: 'none' }}
      >
        <MemoImpactParticleBurst
          durationMs={durationMs}
          loop={loop}
          loopDelayMs={loopDelayMs}
          origin={origin}
          rarity={rarity}
          sizeScale={sizeScale}
          travelScale={travelScale}
        />
      </Canvas>
    </div>
  );
}
