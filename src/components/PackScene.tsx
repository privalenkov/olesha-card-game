import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, type ThreeEvent, useFrame, useLoader } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Shape,
  Vector3,
} from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rarityMeta } from '../game/config';
import type { OwnedCard } from '../game/types';
import packModelUrl from '../assets/mesh/pack.fbx?url';
import {
  SharedViewerLighting,
  SharedViewerPostProcessing,
  VIEWER_BASE_TILT_X,
  VIEWER_CANVAS_BACKGROUND,
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
  onOffsetSettled?: () => void;
  snapOffsetOnMount?: boolean;
  cameraY?: number;
}

interface PackCarouselSceneProps {
  activeIndex: number;
  orbitIndex: number;
  rotationOffsets: number[];
  dragPreview?: number;
  hoverEnabled?: boolean;
  onPackClick?: (index: number) => void;
  transitionToTear?: boolean;
  onTransitionToTearComplete?: () => void;
}

const PACK_WIDTH = 2.4;
const PACK_BODY_HEIGHT = 3.9;
const PACK_BOTTOM_CRIMP = 0.42;
const PACK_DEPTH = 0.14;
const PACK_TOTAL_HEIGHT = PACK_BODY_HEIGHT + PACK_BOTTOM_CRIMP;
const TEAR_WIDTH = 3.2;
const TEAR_HEIGHT = 0.54;
const DEFAULT_PACK_SCALE = 0.8;
const DEFAULT_PACK_SCENE_CAMERA_Y = 0.1;
const TRANSITION_PACK_SCENE_CAMERA_Y = 0.24;
const CAROUSEL_TILT = 0;
const CAROUSEL_RADIUS = 4.5;
const CAROUSEL_CENTER_Z = -CAROUSEL_RADIUS - 0.54;
const CAROUSEL_HOVER_PLANE_WIDTH = PACK_WIDTH * 1.18;
const CAROUSEL_HOVER_PLANE_HEIGHT = PACK_TOTAL_HEIGHT + TEAR_HEIGHT + 0.24;
const CAROUSEL_HOVER_PLANE_CENTER_Y = 0.08;
const PACK_ACCENT_LIGHT = '#74dbff';
const CAROUSEL_TO_TEAR_SETTLE_DISTANCE = 0.06;
const CAROUSEL_TO_TEAR_SETTLE_SCALE_EPSILON = 0.015;
const CAROUSEL_TO_TEAR_INACTIVE_DEPTH_OFFSET = 0.92;
const CAROUSEL_TO_TEAR_INACTIVE_SCALE_FACTOR = 0.95;
const PACK_BODY_MATERIAL = {
  color: '#0d4c66',
  metalness: 0.24,
  roughness: 0.56,
  clearcoat: 0.78,
  clearcoatRoughness: 0.18,
  reflectivity: 0.18,
} as const;
const TEAR_STAGE_DOCK_OFFSET_Y = -2.45;
const TEAR_STAGE_WORLD_Y = TEAR_STAGE_DOCK_OFFSET_Y + 0.02;
const PACK_MODEL_MATERIAL = {
  color: '#d6e0e5',
  metalness: 0.1,
  roughness: 0.86,
  clearcoat: 0.14,
  clearcoatRoughness: 0.32,
  reflectivity: 0.06,
} as const;

useLoader.preload(FBXLoader, packModelUrl);

function getPositionKey(x: number, y: number, z: number, tolerance: number) {
  return [
    Math.round(x / tolerance),
    Math.round(y / tolerance),
    Math.round(z / tolerance),
  ].join(':');
}

function usePackModelGeometry() {
  const packModel = useLoader(FBXLoader, packModelUrl);

  return useMemo(() => {
    packModel.updateWorldMatrix(true, true);
    const sourceMesh = packModel.getObjectByProperty('isMesh', true) as Mesh | undefined;

    if (!sourceMesh) {
      throw new Error('Pack FBX mesh not found');
    }

    const geometry = sourceMesh.geometry.clone();
    const size = new Vector3();

    geometry.applyMatrix4(sourceMesh.matrixWorld);
    geometry.rotateY(Math.PI / 2);
    geometry.computeBoundingBox();
    geometry.boundingBox?.getSize(size);
    geometry.center();
    const scaleX = PACK_WIDTH / Math.max(size.x, 0.001);
    const scaleY = PACK_TOTAL_HEIGHT / Math.max(size.y, 0.001);
    const scaleZ = PACK_DEPTH / Math.max(size.z, 0.001);
    geometry.scale(scaleX, scaleY, scaleZ);
    const normalTolerance = 1e-4;
    const smoothingGeometry = geometry.clone();
    smoothingGeometry.deleteAttribute('uv');
    smoothingGeometry.deleteAttribute('normal');

    const weldedGeometry = mergeVertices(smoothingGeometry, normalTolerance);
    weldedGeometry.computeVertexNormals();

    const weldedPositions = weldedGeometry.getAttribute('position');
    const weldedNormals = weldedGeometry.getAttribute('normal');
    const positionToNormal = new Map<string, [number, number, number]>();

    for (let index = 0; index < weldedPositions.count; index += 1) {
      positionToNormal.set(
        getPositionKey(
          weldedPositions.getX(index),
          weldedPositions.getY(index),
          weldedPositions.getZ(index),
          normalTolerance,
        ),
        [
          weldedNormals.getX(index),
          weldedNormals.getY(index),
          weldedNormals.getZ(index),
        ],
      );
    }

    const positions = geometry.getAttribute('position');
    const existingNormals = geometry.getAttribute('normal');
    const normals = new Float32Array(positions.count * 3);

    for (let index = 0; index < positions.count; index += 1) {
      const normal =
        positionToNormal.get(
          getPositionKey(
            positions.getX(index),
            positions.getY(index),
            positions.getZ(index),
            normalTolerance,
          ),
        ) ?? [
          existingNormals?.getX(index) ?? 0,
          existingNormals?.getY(index) ?? 0,
          existingNormals?.getZ(index) ?? 1,
        ];

      normals[index * 3] = normal[0];
      normals[index * 3 + 1] = normal[1];
      normals[index * 3 + 2] = normal[2];
    }

    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.computeBoundingSphere();
    smoothingGeometry.dispose();
    weldedGeometry.dispose();

    return geometry;
  }, [packModel]);
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

function getHoverYawDirection(rotationY: number) {
  const normalizedRotation = MathUtils.euclideanModulo(rotationY, Math.PI * 2);
  const showingBackSide =
    normalizedRotation > Math.PI * 0.5 && normalizedRotation < Math.PI * 1.5;

  return showingBackSide ? -1 : 1;
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
  onOffsetSettled,
  snapOffsetOnMount = false,
}: PackSceneProps) {
  const groupRef = useRef<Group>(null);
  const tearPivotRef = useRef<Group>(null);
  const tearOffsetRef = useRef<Group>(null);
  const slitRef = useRef<Mesh>(null);
  const hoverTargetRef = useRef({ x: 0, y: 0 });
  const hoverPointerRef = useRef({ x: 0, y: 0 });
  const offsetSettledRef = useRef(false);
  const offsetSnappedRef = useRef(false);
  const offsetSettledCallbackRef = useRef<(() => void) | undefined>(onOffsetSettled);
  const packGeometry = usePackModelGeometry();
  const tearShape = useMemo(() => createTearStripShape(TEAR_WIDTH, TEAR_HEIGHT), []);
  const showTearSeal = phase === 'tearing' || tearProgress > 0.001;

  useEffect(() => () => packGeometry.dispose(), [packGeometry]);
  useEffect(() => {
    offsetSettledCallbackRef.current = onOffsetSettled;
  }, [onOffsetSettled]);
  useEffect(() => {
    if (hoverEnabled) {
      return;
    }

    hoverTargetRef.current.x = 0;
    hoverTargetRef.current.y = 0;
    hoverPointerRef.current.x = 0;
    hoverPointerRef.current.y = 0;
  }, [hoverEnabled]);
  useEffect(() => {
    offsetSettledRef.current = false;
    offsetSnappedRef.current = false;
  }, [offsetY, phase, snapOffsetOnMount]);

  useFrame((state, delta) => {
    if (!groupRef.current || !tearPivotRef.current || !tearOffsetRef.current || !slitRef.current) {
      return;
    }

    const opened = phase !== 'sealed';
    const peelTarget = opened ? 1 : tearProgress;
    const anchorX = MathUtils.lerp(-TEAR_WIDTH * 0.28, TEAR_WIDTH * 0.28, tearAnchor);
    hoverPointerRef.current.x = MathUtils.damp(
      hoverPointerRef.current.x,
      hoverEnabled ? hoverTargetRef.current.x : 0,
      8,
      delta,
    );
    hoverPointerRef.current.y = MathUtils.damp(
      hoverPointerRef.current.y,
      hoverEnabled ? hoverTargetRef.current.y : 0,
      8,
      delta,
    );
    const pointerX =
      hoverPointerRef.current.x * getHoverYawDirection(rotationOffset + dragPreview);
    const pointerY = hoverPointerRef.current.y;
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
    const targetPositionY = offsetY + (opened ? -0.08 : 0.02);
    if (snapOffsetOnMount && !offsetSnappedRef.current) {
      groupRef.current.position.y = targetPositionY;
      offsetSnappedRef.current = true;
    }
    groupRef.current.position.y = MathUtils.damp(
      groupRef.current.position.y,
      targetPositionY,
      3.4,
      delta,
    );
    if (
      offsetSettledCallbackRef.current &&
      !offsetSettledRef.current &&
      Math.abs(groupRef.current.position.y - targetPositionY) < 0.015
    ) {
      offsetSettledRef.current = true;
      offsetSettledCallbackRef.current();
    }

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

  function handleHoverMove(event: ThreeEvent<PointerEvent>) {
    if (!groupRef.current) {
      return;
    }

    const localPoint = groupRef.current.worldToLocal(event.point.clone());
    hoverTargetRef.current.x = MathUtils.clamp(
      localPoint.x / (CAROUSEL_HOVER_PLANE_WIDTH * 0.5),
      -1,
      1,
    );
    hoverTargetRef.current.y = MathUtils.clamp(
      (localPoint.y - CAROUSEL_HOVER_PLANE_CENTER_Y) / (CAROUSEL_HOVER_PLANE_HEIGHT * 0.5),
      -1,
      1,
    );
  }

  function resetHover() {
    hoverTargetRef.current.x = 0;
    hoverTargetRef.current.y = 0;
  }

  return (
    <>
      <SharedViewerLighting accentColor={PACK_ACCENT_LIGHT} />

      <Float speed={1.35} rotationIntensity={0.06} floatIntensity={0.18}>
        <group ref={groupRef} scale={packScale}>
          <mesh
            position={[0, CAROUSEL_HOVER_PLANE_CENTER_Y, PACK_DEPTH / 2 + 0.18]}
            onPointerMove={handleHoverMove}
            onPointerOut={resetHover}
            onPointerOver={handleHoverMove}
          >
            <planeGeometry args={[CAROUSEL_HOVER_PLANE_WIDTH, CAROUSEL_HOVER_PLANE_HEIGHT]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
          </mesh>

          <mesh>
            <primitive attach="geometry" object={packGeometry} />
            <meshPhysicalMaterial
              {...PACK_MODEL_MATERIAL}
              emissive="#0d2d3d"
              emissiveIntensity={0.03}
            />
          </mesh>

          <group
            ref={tearPivotRef}
            position={[0, PACK_BODY_HEIGHT / 2 + 0.02, PACK_DEPTH / 2 + 0.02]}
            visible={showTearSeal}
          >
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
            visible={showTearSeal}
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
  dragPreview,
  hoverEnabled,
  slotAngle,
  active,
  index,
  onClick,
  onTransitionToTearComplete,
  packGeometry,
  rotationOffset,
  ringGroupRef,
  transitionToTear,
  transitionProgressRef,
}: {
  dragPreview: number;
  hoverEnabled: boolean;
  slotAngle: number;
  active: boolean;
  index: number;
  onClick?: (index: number) => void;
  onTransitionToTearComplete?: () => void;
  packGeometry: BufferGeometry;
  rotationOffset: number;
  ringGroupRef: MutableRefObject<Group | null>;
  transitionToTear: boolean;
  transitionProgressRef: MutableRefObject<number>;
}) {
  const slotRef = useRef<Group>(null);
  const packRef = useRef<Group>(null);
  const bodyMaterialRef = useRef<MeshPhysicalMaterial>(null);
  const shadowMaterialRef = useRef<MeshBasicMaterial>(null);
  const transitionSettledRef = useRef(false);
  const transitionCompleteCallbackRef = useRef<(() => void) | undefined>(onTransitionToTearComplete);
  const transitionWorldPositionRef = useRef(new Vector3());
  const transitionTargetVectorRef = useRef(new Vector3());
  const [hovered, setHovered] = useState(false);
  const hoverTargetRef = useRef({ x: 0, y: 0 });
  const hoverPointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (active && hoverEnabled) {
      return;
    }

    hoverTargetRef.current.x = 0;
    hoverTargetRef.current.y = 0;
    hoverPointerRef.current.x = 0;
    hoverPointerRef.current.y = 0;
  }, [active, hoverEnabled]);
  useEffect(() => {
    transitionCompleteCallbackRef.current = onTransitionToTearComplete;
  }, [onTransitionToTearComplete]);
  useEffect(() => {
    transitionSettledRef.current = false;
  }, [active, transitionToTear]);

  useFrame((state, delta) => {
    if (!slotRef.current || !packRef.current) {
      return;
    }

    const targetX = Math.sin(slotAngle) * CAROUSEL_RADIUS;
    const targetZ = Math.cos(slotAngle) * CAROUSEL_RADIUS;
    const targetY = Math.cos(slotAngle) * 0.02 + (active ? 0.06 : 0);
    const transitionProgress = transitionProgressRef.current ?? 0;
    const transitionMix = MathUtils.smoothstep(transitionProgress, 0, 1);
    hoverPointerRef.current.x = MathUtils.damp(
      hoverPointerRef.current.x,
      active && hoverEnabled ? hoverTargetRef.current.x : 0,
      8,
      delta,
    );
    hoverPointerRef.current.y = MathUtils.damp(
      hoverPointerRef.current.y,
      active && hoverEnabled ? hoverTargetRef.current.y : 0,
      8,
      delta,
    );
    const pointerX =
      hoverPointerRef.current.x *
      getHoverYawDirection(rotationOffset + (active ? dragPreview : 0));
    const pointerY = hoverPointerRef.current.y;
    const targetRotationY =
      rotationOffset + (active ? dragPreview : 0) + pointerX * VIEWER_HOVER_TILT_Y;
    const targetRotationX = active ? -pointerY * VIEWER_HOVER_TILT_X + VIEWER_BASE_TILT_X : 0;
    const targetRotationZ = active
      ? hoverEnabled
        ? Math.sin(state.clock.elapsedTime * VIEWER_IDLE_ROLL_SPEED) * VIEWER_IDLE_ROLL_AMPLITUDE
        : 0
      : 0;
    const baseScale = (active ? 0.8 : 0.72) + (hovered && hoverEnabled ? 0.015 : 0);
    const targetScale = active
      ? MathUtils.lerp(baseScale, 0.86, transitionMix)
      : MathUtils.lerp(baseScale, baseScale * CAROUSEL_TO_TEAR_INACTIVE_SCALE_FACTOR, transitionMix);
    const inactiveFade = active ? 1 : Math.pow(1 - transitionMix, 1.35);

    let targetSlotX = targetX;
    let targetSlotY = targetY;
    let targetSlotZ = targetZ;

    if (transitionMix > 0.001 && ringGroupRef.current) {
      ringGroupRef.current.updateWorldMatrix(true, false);

      if (active) {
        const targetLocal = ringGroupRef.current.worldToLocal(
          transitionTargetVectorRef.current.set(0, TEAR_STAGE_WORLD_Y, 0),
        );

        targetSlotX = MathUtils.lerp(targetX, targetLocal.x, transitionMix);
        targetSlotY = MathUtils.lerp(targetY, targetLocal.y, transitionMix);
        targetSlotZ = MathUtils.lerp(targetZ, targetLocal.z, transitionMix);
      } else {
        const targetWorld = ringGroupRef.current.localToWorld(
          transitionWorldPositionRef.current.set(targetX, targetY, targetZ),
        );

        targetWorld.z -= CAROUSEL_TO_TEAR_INACTIVE_DEPTH_OFFSET * transitionMix;

        const targetLocal = ringGroupRef.current.worldToLocal(
          transitionTargetVectorRef.current.copy(targetWorld),
        );

        targetSlotX = targetLocal.x;
        targetSlotY = targetLocal.y;
        targetSlotZ = targetLocal.z;
      }
    }

    slotRef.current.position.x = MathUtils.damp(slotRef.current.position.x, targetSlotX, 5.8, delta);
    slotRef.current.position.y = MathUtils.damp(slotRef.current.position.y, targetSlotY, 5.8, delta);
    slotRef.current.position.z = MathUtils.damp(slotRef.current.position.z, targetSlotZ, 5.8, delta);
    slotRef.current.rotation.y = slotAngle;

    packRef.current.rotation.x = active
      ? MathUtils.damp(packRef.current.rotation.x, targetRotationX, 5, delta)
      : targetRotationX;
    packRef.current.rotation.y = active
      ? MathUtils.damp(packRef.current.rotation.y, targetRotationY, 5.4, delta)
      : targetRotationY;
    packRef.current.rotation.z = active
      ? MathUtils.damp(packRef.current.rotation.z, targetRotationZ, 5, delta)
      : targetRotationZ;

    const currentScale = packRef.current.scale.x;
    const dampedScale = MathUtils.damp(currentScale, targetScale, 5, delta);
    packRef.current.scale.setScalar(dampedScale);

    if (bodyMaterialRef.current) {
      bodyMaterialRef.current.opacity = MathUtils.damp(
        bodyMaterialRef.current.opacity,
        inactiveFade,
        6,
        delta,
      );
    }

    if (shadowMaterialRef.current) {
      shadowMaterialRef.current.opacity = MathUtils.damp(
        shadowMaterialRef.current.opacity,
        (active ? 0.16 : 0.1) * inactiveFade,
        6,
        delta,
      );
    }

    if (
      active &&
      transitionToTear &&
      !transitionSettledRef.current &&
      transitionProgress > 0.985
    ) {
      const worldPosition = slotRef.current.getWorldPosition(transitionWorldPositionRef.current);
      const targetWorld = transitionTargetVectorRef.current.set(0, TEAR_STAGE_WORLD_Y, 0);
      const distanceToTarget = worldPosition.distanceTo(targetWorld);
      const scaleDelta = Math.abs(packRef.current.scale.x - 0.86);

      if (
        distanceToTarget < CAROUSEL_TO_TEAR_SETTLE_DISTANCE &&
        scaleDelta < CAROUSEL_TO_TEAR_SETTLE_SCALE_EPSILON
      ) {
        transitionSettledRef.current = true;
        transitionCompleteCallbackRef.current?.();
      }
    }
  });

  function handleHoverMove(event: ThreeEvent<PointerEvent>) {
    if (!packRef.current) {
      return;
    }

    event.stopPropagation();
    setHovered(true);

    if (!active || !hoverEnabled) {
      return;
    }

    const localPoint = packRef.current.worldToLocal(event.point.clone());
    hoverTargetRef.current.x = MathUtils.clamp(
      localPoint.x / (CAROUSEL_HOVER_PLANE_WIDTH * 0.5),
      -1,
      1,
    );
    hoverTargetRef.current.y = MathUtils.clamp(
      (localPoint.y - CAROUSEL_HOVER_PLANE_CENTER_Y) / (CAROUSEL_HOVER_PLANE_HEIGHT * 0.5),
      -1,
      1,
    );
  }

  function resetHover(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    setHovered(false);
    hoverTargetRef.current.x = 0;
    hoverTargetRef.current.y = 0;
  }

  return (
    <group
      ref={slotRef}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(index);
      }}
    >
      <group ref={packRef}>
        <mesh
          position={[0, CAROUSEL_HOVER_PLANE_CENTER_Y, PACK_DEPTH / 2 + 0.18]}
          onClick={(event) => {
            event.stopPropagation();
            onClick?.(index);
          }}
          onPointerMove={handleHoverMove}
          onPointerOut={resetHover}
          onPointerOver={handleHoverMove}
        >
          <planeGeometry args={[CAROUSEL_HOVER_PLANE_WIDTH, CAROUSEL_HOVER_PLANE_HEIGHT]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
        </mesh>

        <mesh position={[0, -2.12, -0.4]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.9, 48]} />
          <meshBasicMaterial
            ref={shadowMaterialRef}
            color="#000000"
            transparent
            opacity={active ? 0.16 : 0.1}
          />
        </mesh>

        <mesh>
          <primitive attach="geometry" object={packGeometry} />
          <meshPhysicalMaterial
            ref={bodyMaterialRef}
            {...PACK_MODEL_MATERIAL}
            emissive="#0d2d3d"
            emissiveIntensity={active ? 0.04 : 0.03}
            transparent
            opacity={1}
          />
        </mesh>
      </group>
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
  transitionToTear = false,
  onTransitionToTearComplete,
}: PackCarouselSceneProps) {
  const ringRef = useRef<Group>(null);
  const ringGroupRef = useRef<Group | null>(null);
  const transitionProgressRef = useRef(0);
  const outerFloorMaterialRef = useRef<MeshBasicMaterial>(null);
  const innerFloorMaterialRef = useRef<MeshBasicMaterial>(null);
  const packGeometry = usePackModelGeometry();
  const carouselStep = (Math.PI * 2) / Math.max(rotationOffsets.length, 1);

  useEffect(() => () => packGeometry.dispose(), [packGeometry]);
  useEffect(() => {
    if (transitionToTear) {
      return;
    }

    transitionProgressRef.current = 0;
  }, [transitionToTear]);

  useFrame((state, delta) => {
    transitionProgressRef.current = MathUtils.damp(
      transitionProgressRef.current,
      transitionToTear ? 1 : 0,
      5.2,
      delta,
    );
    const transitionMix = MathUtils.smoothstep(transitionProgressRef.current, 0, 1);

    state.camera.position.x = MathUtils.damp(state.camera.position.x, 0, 4, delta);
    state.camera.position.y = MathUtils.damp(
      state.camera.position.y,
      MathUtils.lerp(0.52, TRANSITION_PACK_SCENE_CAMERA_Y, transitionMix),
      4,
      delta,
    );
    state.camera.lookAt(
      0,
      MathUtils.lerp(-0.1, TRANSITION_PACK_SCENE_CAMERA_Y, transitionMix),
      MathUtils.lerp(-0.4, 0, transitionMix),
    );

    if (!ringRef.current) {
      return;
    }

    ringGroupRef.current = ringRef.current;

    ringRef.current.rotation.y = MathUtils.damp(
      ringRef.current.rotation.y,
      -orbitIndex * carouselStep,
      6.4,
      delta,
    );
    if (outerFloorMaterialRef.current) {
      outerFloorMaterialRef.current.opacity = MathUtils.damp(
        outerFloorMaterialRef.current.opacity,
        0.1 * (1 - transitionMix),
        5,
        delta,
      );
    }

    if (innerFloorMaterialRef.current) {
      innerFloorMaterialRef.current.opacity = MathUtils.damp(
        innerFloorMaterialRef.current.opacity,
        0.06 * (1 - transitionMix),
        5,
        delta,
      );
    }

  });

  return (
    <>
      <SharedViewerLighting accentColor={PACK_ACCENT_LIGHT} />

      <group rotation={[CAROUSEL_TILT, 0, 0]} position={[0, -0.08, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.72, -2.2]}>
          <circleGeometry args={[11.6, 84]} />
          <meshBasicMaterial ref={outerFloorMaterialRef} color="#07101a" transparent opacity={0.1} />
        </mesh>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.68, -2.1]}>
          <circleGeometry args={[8.2, 72]} />
          <meshBasicMaterial ref={innerFloorMaterialRef} color="#0b1c2a" transparent opacity={0.06} />
        </mesh>

        <group ref={ringRef} position={[0, 0, CAROUSEL_CENTER_Z]}>
          {rotationOffsets.map((rotationOffset, index) => (
            <CarouselPack
              key={`carousel-pack-${index}`}
              active={index === activeIndex}
              dragPreview={index === activeIndex ? dragPreview : 0}
              hoverEnabled={hoverEnabled}
              index={index}
              onClick={onPackClick}
              onTransitionToTearComplete={
                index === activeIndex ? onTransitionToTearComplete : undefined
              }
              packGeometry={packGeometry}
              ringGroupRef={ringGroupRef}
              rotationOffset={rotationOffset}
              slotAngle={index * carouselStep}
              transitionToTear={transitionToTear}
              transitionProgressRef={transitionProgressRef}
            />
          ))}
        </group>
      </group>

      <SharedViewerPostProcessing />
    </>
  );
}

export function PackScene(props: PackSceneProps) {
  const { cameraY = DEFAULT_PACK_SCENE_CAMERA_Y, ...rigProps } = props;

  return (
    <div className="pack-scene">
      <Canvas
        camera={{ position: [0, cameraY, 10.9], fov: VIEWER_CANVAS_FOV }}
        dpr={VIEWER_CANVAS_DPR}
        onCreated={({ gl }) => {
          gl.setClearColor(VIEWER_CANVAS_BACKGROUND, 1);
        }}
      >
        <Suspense fallback={null}>
          <PackRig {...rigProps} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export function PackCarouselScene(props: PackCarouselSceneProps) {
  return (
    <div className="pack-scene pack-scene--carousel">
      <Canvas
        camera={{ position: [0, 0.24, 10.9], fov: VIEWER_CANVAS_FOV }}
        dpr={VIEWER_CANVAS_DPR}
        onCreated={({ gl }) => {
          gl.setClearColor(VIEWER_CANVAS_BACKGROUND, 1);
        }}
      >
        <Suspense fallback={null}>
          <PackCarouselRig {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
