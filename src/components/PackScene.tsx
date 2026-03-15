import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Float, Sparkles } from '@react-three/drei';
import {
  AdditiveBlending,
  Color,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Shape,
} from 'three';
import { rarityMeta } from '../game/config';
import type { OwnedCard } from '../game/types';
import { usePackTexture } from '../three/textures';

type PackPhase = 'sealed' | 'tearing' | 'burst' | 'revealing' | 'finished';

interface PackSceneProps {
  face: 'front' | 'back';
  phase: PackPhase;
  tearProgress: number;
  flipProgress: number;
  tearAnchor: number;
  tearDirection: 1 | -1;
  cards: OwnedCard[] | null;
  focusIndex: number;
}

const PACK_WIDTH = 3.08;
const PACK_BODY_HEIGHT = 3.78;
const PACK_BOTTOM_CRIMP = 0.42;
const PACK_DEPTH = 0.14;
const TEAR_WIDTH = 3.2;
const TEAR_HEIGHT = 0.54;
const PACK_SCALE = 0.8;

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
  face,
  phase,
  tearProgress,
  flipProgress,
  tearAnchor,
  tearDirection,
  cards,
  focusIndex,
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
    const flipY = flipProgress * -1.08;

    groupRef.current.rotation.y = MathUtils.damp(
      groupRef.current.rotation.y,
      (face === 'back' ? Math.PI : 0) + flipY,
      4.2,
      delta,
    );
    groupRef.current.rotation.x = MathUtils.damp(
      groupRef.current.rotation.x,
      -0.04 + state.pointer.y * 0.08,
      4,
      delta,
    );
    groupRef.current.rotation.z = MathUtils.damp(
      groupRef.current.rotation.z,
      opened ? -0.025 * tearDirection : state.pointer.x * 0.03,
      4,
      delta,
    );
    groupRef.current.position.y = MathUtils.damp(
      groupRef.current.position.y,
      opened ? -0.08 : 0.02,
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
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={1.08} />
      <directionalLight position={[4, 8, 8]} intensity={3.2} color="#fff3de" />
      <pointLight position={[-4, 1, 6]} intensity={24} color="#68deff" />
      <pointLight position={[5, -2, 4]} intensity={15} color="#ff8b5a" />

      <Float speed={1.15} rotationIntensity={0.14} floatIntensity={0.2}>
        <group ref={groupRef} scale={PACK_SCALE}>
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
            <meshPhysicalMaterial
              color="#0d4c66"
              metalness={0.82}
              roughness={0.24}
              clearcoat={1}
              clearcoatRoughness={0.14}
              reflectivity={1}
            />
          </mesh>

          <mesh position={[0, 0, PACK_DEPTH / 2 + 0.006]}>
            <shapeGeometry args={[mainShape]} />
            <meshPhysicalMaterial
              map={frontTexture}
              metalness={0.44}
              roughness={0.18}
              clearcoat={1}
              clearcoatRoughness={0.12}
              emissive="#10384d"
              emissiveIntensity={0.16}
            />
          </mesh>

          <mesh position={[0, 0, -PACK_DEPTH / 2 - 0.006]} rotation={[0, Math.PI, 0]}>
            <shapeGeometry args={[mainShape]} />
            <meshPhysicalMaterial
              map={backTexture}
              metalness={0.38}
              roughness={0.2}
              clearcoat={1}
              clearcoatRoughness={0.14}
              emissive="#0b2230"
              emissiveIntensity={0.14}
            />
          </mesh>

          <mesh position={[0, 0.1, PACK_DEPTH / 2 + 0.012]}>
            <shapeGeometry args={[mainShape]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.055}
              blending={AdditiveBlending}
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
                <meshPhysicalMaterial
                  color="#0f5e7f"
                  metalness={0.88}
                  roughness={0.2}
                  clearcoat={1}
                  clearcoatRoughness={0.1}
                  reflectivity={1}
                />
              </mesh>

              <mesh position={[0, TEAR_HEIGHT * 0.42, PACK_DEPTH / 2 + 0.01]}>
                <shapeGeometry args={[tearShape]} />
                <meshBasicMaterial color="#61d7f7" transparent opacity={0.24} />
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
              opacity={0.08}
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

      <Sparkles
        count={phase === 'sealed' ? 24 : 52}
        scale={[8, 6, 5]}
        size={phase === 'sealed' ? 1.9 : 3.3}
        speed={0.22}
        color="#ffefc1"
      />

      <EffectComposer>
        <Bloom mipmapBlur intensity={1.06} luminanceThreshold={0.2} />
        <Vignette eskil={false} offset={0.14} darkness={0.86} />
      </EffectComposer>
    </>
  );
}

export function PackScene(props: PackSceneProps) {
  return (
    <div className="pack-scene">
      <Canvas camera={{ position: [0, 0.1, 10.9], fov: 31 }} dpr={[1, 2]}>
        <PackRig {...props} />
      </Canvas>
    </div>
  );
}
