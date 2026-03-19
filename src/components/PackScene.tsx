import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import {
  AdditiveBlending,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Shape,
  type Texture,
} from 'three';
import { rarityMeta } from '../game/config';
import type { OwnedCard } from '../game/types';
import { usePackTexture } from '../three/textures';
import {
  SharedViewerLighting,
  SharedViewerPostProcessing,
  VIEWER_BASE_TILT_X,
  VIEWER_CANVAS_DPR,
  VIEWER_CANVAS_FOV,
  VIEWER_HOVER_TILT_X,
  VIEWER_HOVER_TILT_Y,
  VIEWER_IDLE_ROLL_AMPLITUDE,
  VIEWER_IDLE_ROLL_SPEED,
} from './viewerSceneProfile';

export type PackPhase = 'sealed' | 'tearing' | 'burst' | 'revealing' | 'finished';

interface PackSceneProps {
  phase: PackPhase;
  tearProgress: number;
  dragPreview?: number;
  hoverEnabled?: boolean;
  rotationOffset?: number;
  tearAnchor: number;
  tearDirection: 1 | -1;
  cards: OwnedCard[] | null;
  focusIndex: number;
  offsetY?: number;
  packScale?: number;
}

interface PackCarouselSceneProps {
  activeIndex: number;
  orbitIndex: number;
  rotationOffsets: number[];
  dragPreview?: number;
  hoverEnabled?: boolean;
  onPackClick?: (index: number) => void;
}

const PACK_WIDTH = 3.08;
const PACK_BODY_HEIGHT = 3.78;
const PACK_BOTTOM_CRIMP = 0.42;
const PACK_DEPTH = 0.14;
const TEAR_WIDTH = 3.2;
const TEAR_HEIGHT = 0.54;
const DEFAULT_PACK_SCALE = 0.8;
const CAROUSEL_TILT = 0;
const CAROUSEL_STEP = (Math.PI * 2) / 5;
const CAROUSEL_RADIUS = 4.5;
const CAROUSEL_CENTER_Z = -CAROUSEL_RADIUS - 0.54;
const PACK_ACCENT_LIGHT = '#74dbff';
const PACK_BODY_MATERIAL = {
  color: '#0d4c66',
  metalness: 0.24,
  roughness: 0.56,
  clearcoat: 0.78,
  clearcoatRoughness: 0.18,
  reflectivity: 0.18,
} as const;
const PACK_FACE_MATERIAL = {
  metalness: 0.08,
  roughness: 0.84,
  clearcoat: 0.12,
  clearcoatRoughness: 0.28,
  reflectivity: 0.08,
} as const;
const PACK_BACK_MATERIAL = {
  metalness: 0.06,
  roughness: 0.9,
  clearcoat: 0.08,
  clearcoatRoughness: 0.3,
  reflectivity: 0.06,
} as const;

function createMainPackShape(width: number, bodyHeight: number, crimpHeight: number) {
  const halfWidth = width / 2;
  const topY = bodyHeight / 2;
  const crimpTopY = -bodyHeight / 2;
  const crimpBottomY = crimpTopY - crimpHeight;
  const teeth = 18;
  const step = width / teeth;
  const toothDepth = 0.07;
  const shape = new Shape();

  shape.moveTo(-halfWidth * 0.86, topY);
  shape.lineTo(halfWidth * 0.86, topY);
  shape.bezierCurveTo(
    halfWidth * 1.01,
    topY * 0.72,
    halfWidth * 1.06,
    -bodyHeight * 0.08,
    halfWidth * 0.93,
    crimpTopY,
  );

  for (let tooth = teeth - 1; tooth >= 0; tooth -= 1) {
    const right = -halfWidth + step * (tooth + 1);
    const mid = right - step / 2;
    const left = right - step;
    shape.lineTo(mid, crimpBottomY);
    shape.lineTo(left, crimpBottomY + toothDepth);
  }

  shape.bezierCurveTo(
    -halfWidth * 1.06,
    -bodyHeight * 0.08,
    -halfWidth * 1.01,
    topY * 0.72,
    -halfWidth * 0.86,
    topY,
  );
  shape.closePath();
  return shape;
}

function createTearStripShape(width: number, height: number) {
  const halfWidth = width / 2;
  const teeth = 18;
  const step = width / teeth;
  const toothDepth = 0.07;
  const shape = new Shape();

  shape.moveTo(-halfWidth, 0);
  shape.lineTo(halfWidth, 0);
  shape.lineTo(halfWidth, height - toothDepth);

  for (let tooth = teeth - 1; tooth >= 0; tooth -= 1) {
    const right = -halfWidth + step * (tooth + 1);
    const mid = right - step / 2;
    const left = right - step;
    shape.lineTo(mid, height);
    shape.lineTo(left, height - toothDepth);
  }

  shape.lineTo(-halfWidth, 0);
  shape.closePath();
  return shape;
}

function MiniCard({
  card,
  index,
  phase,
  focusIndex,
  tearAnchor,
}: {
  card: OwnedCard;
  index: number;
  phase: PackPhase;
  focusIndex: number;
  tearAnchor: number;
}) {
  const ref = useRef<Group>(null);
  const glowRef = useRef<Mesh>(null);
  const meta = rarityMeta[card.rarity];
  const target = useMemo(() => {
    const originX = MathUtils.lerp(-0.4, 0.4, tearAnchor);

    return {
      stackX: originX * 0.24,
      burstX: originX * 0.48 - 0.94 + index * 0.48,
      burstY: 1.1 - index * 0.18,
      burstZ: 1.06 - index * 0.04,
      settleX: 1.16,
      settleY: 0.16 - index * 0.06,
      settleZ: 0.5 - index * 0.06,
    };
  }, [index, tearAnchor]);

  useFrame((state, delta) => {
    if (!ref.current || !glowRef.current) {
      return;
    }

    const opened = phase !== 'sealed';
    const settled = phase === 'revealing' || phase === 'finished';
    const hover = state.clock.elapsedTime * 1.2 + index;
    const targetPosition = settled
      ? [target.settleX, target.settleY, target.settleZ]
      : opened
        ? [target.burstX, target.burstY, target.burstZ]
        : [target.stackX, 0.12 - index * 0.016, 0];

    ref.current.position.x = MathUtils.damp(
      ref.current.position.x,
      targetPosition[0],
      3.8,
      delta,
    );
    ref.current.position.y = MathUtils.damp(
      ref.current.position.y,
      targetPosition[1] + Math.sin(hover) * 0.02,
      3.8,
      delta,
    );
    ref.current.position.z = MathUtils.damp(
      ref.current.position.z,
      targetPosition[2],
      3.8,
      delta,
    );
    ref.current.rotation.z = MathUtils.damp(
      ref.current.rotation.z,
      opened ? -0.42 + index * 0.08 : 0,
      3.3,
      delta,
    );
    ref.current.rotation.x = MathUtils.damp(
      ref.current.rotation.x,
      opened ? 0.32 : 0.08,
      3.3,
      delta,
    );

    const material = glowRef.current.material as MeshBasicMaterial;
    const intensity = focusIndex === index ? 0.72 : 0.34;
    material.opacity = MathUtils.damp(material.opacity, opened ? intensity : 0, 3.2, delta);
  });

  return (
    <group ref={ref}>
      <mesh>
        <boxGeometry args={[0.84, 1.26, 0.08]} />
        <meshStandardMaterial color="#0c1016" metalness={0.48} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[0.74, 1.14]} />
        <meshBasicMaterial color={meta.hue} />
      </mesh>
      <mesh ref={glowRef} position={[0, 0, -0.1]}>
        <planeGeometry args={[1.08, 1.54]} />
        <meshBasicMaterial
          color={new Color(meta.hue)}
          transparent
          opacity={0}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function PackRig({
  phase,
  tearProgress,
  dragPreview = 0,
  hoverEnabled = true,
  rotationOffset = 0,
  tearAnchor,
  tearDirection,
  cards,
  focusIndex,
  offsetY = 0,
  packScale = DEFAULT_PACK_SCALE,
}: PackSceneProps) {
  const groupRef = useRef<Group>(null);
  const tearPivotRef = useRef<Group>(null);
  const tearOffsetRef = useRef<Group>(null);
  const slitRef = useRef<Mesh>(null);
  const frontTexture = usePackTexture('front');
  const backTexture = usePackTexture('back');

  const mainShape = useMemo(
    () => createMainPackShape(PACK_WIDTH, PACK_BODY_HEIGHT, PACK_BOTTOM_CRIMP),
    [],
  );
  const tearShape = useMemo(() => createTearStripShape(TEAR_WIDTH, TEAR_HEIGHT), []);

  useFrame((state, delta) => {
    if (!groupRef.current || !tearPivotRef.current || !tearOffsetRef.current || !slitRef.current) {
      return;
    }

    const opened = phase !== 'sealed';
    const peelTarget = opened ? 1 : tearProgress;
    const anchorX = MathUtils.lerp(-TEAR_WIDTH * 0.28, TEAR_WIDTH * 0.28, tearAnchor);
    const pointerX = hoverEnabled ? state.pointer.x : 0;
    const pointerY = hoverEnabled ? state.pointer.y : 0;
    groupRef.current.rotation.y = MathUtils.damp(
      groupRef.current.rotation.y,
      rotationOffset + dragPreview + pointerX * VIEWER_HOVER_TILT_Y,
      5,
      delta,
    );
    groupRef.current.rotation.x = MathUtils.damp(
      groupRef.current.rotation.x,
      -pointerY * VIEWER_HOVER_TILT_X + VIEWER_BASE_TILT_X,
      4,
      delta,
    );
    groupRef.current.rotation.z = MathUtils.damp(
      groupRef.current.rotation.z,
      opened && !hoverEnabled
        ? -0.025 * tearDirection
        : Math.sin(state.clock.elapsedTime * VIEWER_IDLE_ROLL_SPEED) * VIEWER_IDLE_ROLL_AMPLITUDE,
      2.8,
      delta,
    );
    groupRef.current.position.y = MathUtils.damp(
      groupRef.current.position.y,
      offsetY + (opened ? -0.08 : 0.02),
      3.4,
      delta,
    );

    tearPivotRef.current.position.x = MathUtils.damp(
      tearPivotRef.current.position.x,
      anchorX,
      5.4,
      delta,
    );
    tearPivotRef.current.position.y = MathUtils.damp(
      tearPivotRef.current.position.y,
      PACK_BODY_HEIGHT / 2 + 0.02 + peelTarget * 0.08,
      5,
      delta,
    );
    tearPivotRef.current.position.z = MathUtils.damp(
      tearPivotRef.current.position.z,
      PACK_DEPTH / 2 + 0.02 + peelTarget * 0.42,
      5,
      delta,
    );
    tearPivotRef.current.rotation.x = MathUtils.damp(
      tearPivotRef.current.rotation.x,
      peelTarget * -2.06,
      5,
      delta,
    );
    tearPivotRef.current.rotation.z = MathUtils.damp(
      tearPivotRef.current.rotation.z,
      peelTarget * tearDirection * 0.18,
      4.8,
      delta,
    );

    tearOffsetRef.current.position.x = MathUtils.damp(
      tearOffsetRef.current.position.x,
      -anchorX,
      5.2,
      delta,
    );

    slitRef.current.position.x = MathUtils.damp(slitRef.current.position.x, anchorX * 0.92, 5, delta);
    const slitMaterial = slitRef.current.material as MeshBasicMaterial;
    slitMaterial.opacity = MathUtils.damp(
      slitMaterial.opacity,
      peelTarget > 0 ? 0.18 + peelTarget * 0.28 : 0.08,
      4.4,
      delta,
    );
  });

  return (
    <>
      <SharedViewerLighting accentColor={PACK_ACCENT_LIGHT} />

      <Float speed={1.35} rotationIntensity={0.06} floatIntensity={0.18}>
        <group ref={groupRef} scale={packScale}>
          <mesh position={[0, 0, -PACK_DEPTH / 2]}>
            <extrudeGeometry
              args={[
                mainShape,
                {
                  depth: PACK_DEPTH,
                  bevelEnabled: false,
                  curveSegments: 24,
                },
              ]}
            />
            <meshPhysicalMaterial {...PACK_BODY_MATERIAL} />
          </mesh>

          <mesh position={[0, 0, PACK_DEPTH / 2 + 0.006]}>
            <shapeGeometry args={[mainShape]} />
            <meshPhysicalMaterial
              map={frontTexture}
              {...PACK_FACE_MATERIAL}
              emissive="#0d2d3d"
              emissiveIntensity={0.05}
            />
          </mesh>

          <mesh position={[0, 0, -PACK_DEPTH / 2 - 0.006]} rotation={[0, Math.PI, 0]}>
            <shapeGeometry args={[mainShape]} />
            <meshPhysicalMaterial
              map={backTexture}
              {...PACK_BACK_MATERIAL}
              emissive="#091c27"
              emissiveIntensity={0.04}
            />
          </mesh>

          <group ref={tearPivotRef} position={[0, PACK_BODY_HEIGHT / 2 + 0.02, PACK_DEPTH / 2 + 0.02]}>
            <group ref={tearOffsetRef}>
              <mesh position={[0, 0, -PACK_DEPTH / 2]}>
                <extrudeGeometry
                  args={[
                    tearShape,
                    {
                      depth: PACK_DEPTH * 0.92,
                      bevelEnabled: false,
                      curveSegments: 20,
                    },
                  ]}
                />
                <meshPhysicalMaterial {...PACK_BODY_MATERIAL} color="#0f5e7f" />
              </mesh>

              <mesh position={[0, TEAR_HEIGHT * 0.42, PACK_DEPTH / 2 + 0.01]}>
                <shapeGeometry args={[tearShape]} />
                <meshBasicMaterial color="#61d7f7" transparent opacity={0.16} />
              </mesh>

              <mesh position={[0, TEAR_HEIGHT * 0.28, PACK_DEPTH / 2 + 0.02]}>
                <planeGeometry args={[0.72, 0.13]} />
                <meshBasicMaterial color="#0a1419" transparent opacity={0.92} />
              </mesh>
            </group>
          </group>

          <mesh
            ref={slitRef}
            position={[0, PACK_BODY_HEIGHT / 2 + 0.02, PACK_DEPTH / 2 + 0.12]}
          >
            <planeGeometry args={[0.54, 0.06]} />
            <meshBasicMaterial
              color="#fff8de"
              transparent
              opacity={0.045}
              blending={AdditiveBlending}
            />
          </mesh>

          {cards?.map((card, index) => (
            <MiniCard
              key={card.instanceId}
              card={card}
              index={index}
              phase={phase}
              focusIndex={focusIndex}
              tearAnchor={tearAnchor}
            />
          ))}
        </group>
      </Float>

      <SharedViewerPostProcessing />
    </>
  );
}

function CarouselPack({
  backTexture,
  dragPreview,
  frontTexture,
  hoverEnabled,
  slotAngle,
  active,
  index,
  onClick,
  mainShape,
  tearShape,
  rotationOffset,
}: {
  backTexture: Texture;
  dragPreview: number;
  frontTexture: Texture;
  hoverEnabled: boolean;
  slotAngle: number;
  active: boolean;
  index: number;
  onClick?: (index: number) => void;
  mainShape: Shape;
  tearShape: Shape;
  rotationOffset: number;
}) {
  const ref = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state, delta) => {
    if (!ref.current) {
      return;
    }

    const targetX = Math.sin(slotAngle) * CAROUSEL_RADIUS;
    const targetZ = Math.cos(slotAngle) * CAROUSEL_RADIUS;
    const targetY = Math.cos(slotAngle) * 0.02 + (active ? 0.06 : 0);
    const pointerX = active && hoverEnabled ? state.pointer.x : 0;
    const pointerY = active && hoverEnabled ? state.pointer.y : 0;
    const targetRotationY =
      slotAngle + rotationOffset + (active ? dragPreview : 0) + pointerX * VIEWER_HOVER_TILT_Y;
    const targetRotationX = active ? -pointerY * VIEWER_HOVER_TILT_X + VIEWER_BASE_TILT_X : 0;
    const targetRotationZ = active
      ? hoverEnabled
        ? Math.sin(state.clock.elapsedTime * VIEWER_IDLE_ROLL_SPEED) * VIEWER_IDLE_ROLL_AMPLITUDE
        : 0
      : 0;
    const targetScale = (active ? 0.8 : 0.72) + (hovered && hoverEnabled ? 0.015 : 0);

    ref.current.position.x = targetX;
    ref.current.position.y = MathUtils.damp(ref.current.position.y, targetY, 5, delta);
    ref.current.position.z = targetZ;
    ref.current.rotation.x =
      active && hoverEnabled
        ? MathUtils.damp(ref.current.rotation.x, targetRotationX, 5, delta)
        : targetRotationX;
    ref.current.rotation.y =
      active && (hoverEnabled || Math.abs(dragPreview) > 0.0001)
        ? MathUtils.damp(ref.current.rotation.y, targetRotationY, 5.4, delta)
        : targetRotationY;
    ref.current.rotation.z =
      active && hoverEnabled
        ? MathUtils.damp(ref.current.rotation.z, targetRotationZ, 5, delta)
        : targetRotationZ;

    const currentScale = ref.current.scale.x;
    const dampedScale = MathUtils.damp(currentScale, targetScale, 5, delta);
    ref.current.scale.setScalar(dampedScale);
  });

  return (
    <group
      ref={ref}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(index);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        setHovered(false);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
    >
      <mesh
        position={[0, 0.08, PACK_DEPTH / 2 + 0.18]}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(index);
        }}
      >
        <planeGeometry args={[PACK_WIDTH * 1.18, PACK_BODY_HEIGHT + PACK_BOTTOM_CRIMP + TEAR_HEIGHT + 0.24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <mesh position={[0, -2.12, -0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.9, 48]} />
        <meshBasicMaterial color="#000000" transparent opacity={active ? 0.16 : 0.1} />
      </mesh>

      <mesh position={[0, 0, -PACK_DEPTH / 2]}>
        <extrudeGeometry
          args={[
            mainShape,
            {
              depth: PACK_DEPTH,
              bevelEnabled: false,
              curveSegments: 24,
            },
          ]}
        />
        <meshPhysicalMaterial {...PACK_BODY_MATERIAL} />
      </mesh>

      <mesh position={[0, 0, PACK_DEPTH / 2 + 0.006]}>
        <shapeGeometry args={[mainShape]} />
        <meshPhysicalMaterial
          map={frontTexture}
          {...PACK_FACE_MATERIAL}
          emissive="#0d2d3d"
          emissiveIntensity={active ? 0.07 : 0.05}
        />
      </mesh>

      <mesh position={[0, 0, -PACK_DEPTH / 2 - 0.006]} rotation={[0, Math.PI, 0]}>
        <shapeGeometry args={[mainShape]} />
        <meshPhysicalMaterial
          map={backTexture}
          {...PACK_BACK_MATERIAL}
          emissive="#091c27"
          emissiveIntensity={active ? 0.055 : 0.04}
        />
      </mesh>

      <group position={[0, PACK_BODY_HEIGHT / 2 + 0.02, PACK_DEPTH / 2 + 0.02]}>
        <mesh position={[0, 0, -PACK_DEPTH / 2]}>
          <extrudeGeometry
            args={[
              tearShape,
              {
                depth: PACK_DEPTH * 0.92,
                bevelEnabled: false,
                curveSegments: 20,
              },
            ]}
          />
          <meshPhysicalMaterial {...PACK_BODY_MATERIAL} color="#0f5e7f" />
        </mesh>

        <mesh position={[0, TEAR_HEIGHT * 0.42, PACK_DEPTH / 2 + 0.01]}>
          <shapeGeometry args={[tearShape]} />
          <meshBasicMaterial color="#61d7f7" transparent opacity={0.16} />
        </mesh>

        <mesh position={[0, TEAR_HEIGHT * 0.28, PACK_DEPTH / 2 + 0.02]}>
          <planeGeometry args={[0.72, 0.13]} />
          <meshBasicMaterial color="#0a1419" transparent opacity={0.92} />
        </mesh>
      </group>

      <mesh position={[0, PACK_BODY_HEIGHT / 2 + 0.02, PACK_DEPTH / 2 + 0.12]}>
        <planeGeometry args={[0.54, 0.06]} />
        <meshBasicMaterial
          color="#fff8de"
          transparent
          opacity={0.045}
          blending={AdditiveBlending}
        />
      </mesh>

    </group>
  );
}

function PackCarouselRig({
  activeIndex,
  orbitIndex,
  rotationOffsets,
  dragPreview = 0,
  hoverEnabled = true,
  onPackClick,
}: PackCarouselSceneProps) {
  const ringRef = useRef<Group>(null);
  const frontTexture = usePackTexture('front');
  const backTexture = usePackTexture('back');
  const mainShape = useMemo(
    () => createMainPackShape(PACK_WIDTH, PACK_BODY_HEIGHT, PACK_BOTTOM_CRIMP),
    [],
  );
  const tearShape = useMemo(() => createTearStripShape(TEAR_WIDTH, TEAR_HEIGHT), []);

  useFrame((state, delta) => {
    state.camera.position.x = MathUtils.damp(state.camera.position.x, 0, 4, delta);
    state.camera.position.y = MathUtils.damp(
      state.camera.position.y,
      0.52,
      4,
      delta,
    );
    state.camera.lookAt(0, -0.1, -0.4);

    if (!ringRef.current) {
      return;
    }

    ringRef.current.rotation.y = MathUtils.damp(
      ringRef.current.rotation.y,
      -orbitIndex * CAROUSEL_STEP,
      6.4,
      delta,
    );
  });

  return (
    <>
      <SharedViewerLighting accentColor={PACK_ACCENT_LIGHT} />

      <group rotation={[CAROUSEL_TILT, 0, 0]} position={[0, -0.08, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.72, -2.2]}>
          <circleGeometry args={[11.6, 84]} />
          <meshBasicMaterial color="#07101a" transparent opacity={0.1} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.68, -2.1]}>
          <circleGeometry args={[8.2, 72]} />
          <meshBasicMaterial color="#0b1c2a" transparent opacity={0.06} />
        </mesh>

        <group ref={ringRef} position={[0, 0, CAROUSEL_CENTER_Z]}>
          {rotationOffsets.map((rotationOffset, index) => (
            <CarouselPack
              key={`carousel-pack-${index}`}
              active={index === activeIndex}
              backTexture={backTexture}
              dragPreview={index === activeIndex ? dragPreview : 0}
              frontTexture={frontTexture}
              hoverEnabled={hoverEnabled}
              index={index}
              mainShape={mainShape}
              onClick={onPackClick}
              rotationOffset={rotationOffset}
              slotAngle={index * CAROUSEL_STEP}
              tearShape={tearShape}
            />
          ))}
        </group>
      </group>

      <SharedViewerPostProcessing />
    </>
  );
}

export function PackScene(props: PackSceneProps) {
  return (
    <div className="pack-scene">
      <Canvas camera={{ position: [0, 0.1, 10.9], fov: VIEWER_CANVAS_FOV }} dpr={VIEWER_CANVAS_DPR}>
        <PackRig {...props} />
      </Canvas>
    </div>
  );
}

export function PackCarouselScene(props: PackCarouselSceneProps) {
  return (
    <div className="pack-scene pack-scene--carousel">
      <Canvas camera={{ position: [0, 0.24, 10.9], fov: VIEWER_CANVAS_FOV }} dpr={VIEWER_CANVAS_DPR}>
        <PackCarouselRig {...props} />
      </Canvas>
    </div>
  );
}
