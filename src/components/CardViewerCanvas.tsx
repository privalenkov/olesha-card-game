import {
  memo,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { Float, Sparkles } from '@react-three/drei';
import {
  AdditiveBlending,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Path,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three';
import { finishMeta, rarityMeta } from '../game/config';
import type { OwnedCard } from '../game/types';
import { useCardTextures } from '../three/textures';

const holoTuning = {
  common: {
    strength: 0.42,
    density: 0.45,
    glint: 0.34,
    fresnelPower: 2.4,
  },
  uncommon: {
    strength: 0.5,
    density: 0.62,
    glint: 0.44,
    fresnelPower: 2.2,
  },
  rare: {
    strength: 0.62,
    density: 0.78,
    glint: 0.58,
    fresnelPower: 2,
  },
  epic: {
    strength: 0.76,
    density: 0.96,
    glint: 0.78,
    fresnelPower: 1.9,
  },
  veryrare: {
    strength: 0.92,
    density: 1.16,
    glint: 0.96,
    fresnelPower: 1.75,
  },
} as const;

type ViewerEffectsPreset = 'full' | 'diagnostic';
type CardSide = 'front' | 'back';

interface DragState {
  active: boolean;
  startX: number;
  deltaX: number;
  moved: boolean;
}

interface PointerPressState {
  active: boolean;
  pointerId: number | null;
  startX: number;
}

const initialDrag: DragState = {
  active: false,
  startX: 0,
  deltaX: 0,
  moved: false,
};

const initialPointerPress: PointerPressState = {
  active: false,
  pointerId: null,
  startX: 0,
};

const CARD_ASPECT_WIDTH = 344;
const CARD_ASPECT_HEIGHT = 482;
const CARD_HEIGHT = 4.08;
const CARD_WIDTH = (CARD_HEIGHT * CARD_ASPECT_WIDTH) / CARD_ASPECT_HEIGHT;

const CARD_BODY = {
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  depth: 0.03,
  radius: 0.21,
} as const;

const CARD_FACE = {
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
} as const;

const FLIP_PREVIEW_LIMIT = 0.72;
const FLIP_TRIGGER_DISTANCE = 72;
const HOVER_TILT_X = 0.28;
const HOVER_TILT_Y = 0.22;
const edgeHighlightVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vLocalPosition;

  void main() {
    vUv = uv;
    vLocalPosition = position;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const edgeHighlightFragmentShader = `
  uniform vec3 uTint;
  uniform float uTime;
  uniform float uTilt;
  uniform vec2 uTiltDirection;

  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vLocalPosition;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPosition);

    float fresnel = pow(clamp(1.0 - abs(dot(N, V)), 0.0, 1.0), 1.35);
    vec2 tiltDirection = length(uTiltDirection) > 0.001
      ? normalize(uTiltDirection)
      : normalize(vec2(0.82, 0.26));
    vec2 edgeDirection = normalize(vLocalPosition.xy + vec2(0.0001));

    float sweepPrimary = pow(max(dot(edgeDirection, tiltDirection), 0.0), 7.0);
    float sweepSecondary = pow(max(dot(edgeDirection, -tiltDirection), 0.0), 12.0) * 0.18;
    float edgePulse = 0.92 + 0.08 * sin(uTime * 1.4 + dot(edgeDirection, vec2(2.2, 3.4)));
    float perimeterBias = pow(max(abs(vUv.x - 0.5) * 2.0, abs(vUv.y - 0.5) * 2.0), 1.3);

    float baseGlow = perimeterBias * (0.012 + uTilt * 0.085);
    float fresnelGlow = fresnel * perimeterBias * (0.025 + uTilt * 0.15);
    float sweepGlow =
      perimeterBias * (sweepPrimary + sweepSecondary) * (0.05 + uTilt * 0.26);
    float alpha = clamp((baseGlow + fresnelGlow + sweepGlow) * edgePulse, 0.0, 0.34);
    vec3 color = uTint * (baseGlow * 1.25 + fresnelGlow * 1.8 + sweepGlow * 2.6) * edgePulse;

    gl_FragColor = vec4(color, alpha);
  }
`;

function createRoundedRectShape(width: number, height: number, radius: number) {
  const shape = new Shape();
  appendRoundedRectPath(shape, width, height, radius);
  return shape;
}

function appendRoundedRectPath(path: Shape | Path, width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const safeRadius = Math.min(radius, width / 2, height / 2);

  path.moveTo(x + safeRadius, y);
  path.lineTo(x + width - safeRadius, y);
  path.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  path.lineTo(x + width, y + height - safeRadius);
  path.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  path.lineTo(x + safeRadius, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  path.lineTo(x, y + safeRadius);
  path.quadraticCurveTo(x, y, x + safeRadius, y);
}

function createRoundedFaceGeometry(width: number, height: number, radius: number) {
  const geometry = new ShapeGeometry(createRoundedRectShape(width, height, radius), 24);
  const positions = geometry.getAttribute('position');
  const uvs = new Float32Array(positions.count * 2);

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    uvs[index * 2] = (x + width / 2) / width;
    uvs[index * 2 + 1] = (y + height / 2) / height;
  }

  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}

function createRoundedCardBodyGeometry(width: number, height: number, depth: number, radius: number) {
  const geometry = new ExtrudeGeometry(createRoundedRectShape(width, height, radius), {
    depth,
    bevelEnabled: false,
    curveSegments: 24,
  });

  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function createRoundedEdgeGeometry(width: number, height: number, radius: number, thickness: number) {
  const outer = new Shape();
  appendRoundedRectPath(outer, width, height, radius);

  const inner = new Path();
  appendRoundedRectPath(
    inner,
    Math.max(width - thickness * 2, 0.001),
    Math.max(height - thickness * 2, 0.001),
    Math.max(radius - thickness, 0.001),
  );
  outer.holes.push(inner);

  return new ShapeGeometry(outer, 24);
}

function CardRig({
  card,
  introKey,
  scaleMultiplier,
  effectsPreset,
  flipTargetRef,
  dragPreviewRef,
  pointer,
}: {
  card: OwnedCard;
  introKey: string;
  scaleMultiplier: number;
  effectsPreset: ViewerEffectsPreset;
  flipTargetRef: MutableRefObject<number>;
  dragPreviewRef: MutableRefObject<number>;
  pointer: Vector2;
}) {
  const groupRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  const shaderRef = useRef<ShaderMaterial>(null);
  const edgeRef = useRef<ShaderMaterial>(null);
  const edgeMeshRef = useRef<Mesh>(null);
  const introRef = useRef(0);
  const textures = useCardTextures(card);
  const meta = rarityMeta[card.rarity];
  const finish = finishMeta[card.finish];
  const tuning = holoTuning[card.rarity];
  const showDecorativeEffects = effectsPreset === 'full';
  const faceGeometry = useMemo(
    () => createRoundedFaceGeometry(CARD_FACE.width, CARD_FACE.height, CARD_BODY.radius),
    [],
  );
  const edgeGeometry = useMemo(
    () => createRoundedEdgeGeometry(CARD_FACE.width, CARD_FACE.height, CARD_BODY.radius, 0.025),
    [],
  );
  const bodyGeometry = useMemo(
    () =>
      createRoundedCardBodyGeometry(
        CARD_BODY.width,
        CARD_BODY.height,
        CARD_BODY.depth,
        CARD_BODY.radius,
      ),
    [],
  );
  const faceOffset = CARD_BODY.depth / 2 + 0.0012;

  useEffect(() => {
    introRef.current = 0;
    if (textures) {
      textures.foil.center.set(0.5, 0.5);
      textures.foil.repeat.set(1.04, 1.04);
    }
  }, [introKey, textures]);

  useEffect(() => () => faceGeometry.dispose(), [faceGeometry]);
  useEffect(() => () => edgeGeometry.dispose(), [edgeGeometry]);
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);

  useFrame((state, delta) => {
    if (!groupRef.current || !shaderRef.current || !shaderRef.current.uniforms) {
      return;
    }

    introRef.current = Math.min(introRef.current + delta * 1.6, 1);
    const easedIntro = 1 - (1 - introRef.current) * (1 - introRef.current);
    const baseFlip = flipTargetRef.current;
    const dragPreview = dragPreviewRef.current;

    groupRef.current.position.y = MathUtils.damp(
      groupRef.current.position.y,
      0.1 - (1 - easedIntro) * 1.25,
      4,
      delta,
    );
    groupRef.current.position.z = MathUtils.damp(
      groupRef.current.position.z,
      0.04 + easedIntro * 0.08,
      4,
      delta,
    );
    groupRef.current.rotation.x = MathUtils.damp(
      groupRef.current.rotation.x,
      -pointer.y * HOVER_TILT_X + 0.03,
      4,
      delta,
    );
    groupRef.current.rotation.y = MathUtils.damp(
      groupRef.current.rotation.y,
      baseFlip + dragPreview + pointer.x * HOVER_TILT_Y,
      5,
      delta,
    );
    groupRef.current.rotation.z = MathUtils.damp(
      groupRef.current.rotation.z,
      Math.sin(state.clock.elapsedTime * 0.45) * 0.018,
      2.8,
      delta,
    );
    groupRef.current.scale.setScalar((0.82 + easedIntro * 0.18) * scaleMultiplier);

    const yawTilt = Math.sin(groupRef.current.rotation.y);
    const edgeTilt = Math.min(
      1,
      Math.abs(groupRef.current.rotation.x) * 2.6 + Math.abs(yawTilt) * 1.45 + Math.abs(pointer.x) * 0.35,
    );
    const edgeTiltDirection = new Vector2(
      yawTilt + pointer.x * 0.35,
      -groupRef.current.rotation.x + pointer.y * 0.12,
    );

    if (showDecorativeEffects && ringRef.current) {
      ringRef.current.rotation.z += delta * (0.24 + finish.shimmerBoost * 0.18);
      ringRef.current.scale.setScalar(1.08 + Math.sin(state.clock.elapsedTime * 1.8) * 0.018);

      const ringMaterial = ringRef.current.material as MeshBasicMaterial;
      ringMaterial.opacity = 0.26 + Math.sin(state.clock.elapsedTime * 1.8) * 0.04;
    }

    if (textures) {
      textures.foil.offset.x =
        0.02 + Math.sin(state.clock.elapsedTime * (0.4 + finish.shimmerBoost * 0.22)) * 0.035;
      textures.foil.offset.y =
        0.02 + Math.cos(state.clock.elapsedTime * (0.26 + finish.shimmerBoost * 0.18)) * 0.035;
      textures.foil.rotation =
        state.clock.elapsedTime * (0.035 + finish.shimmerBoost * 0.025) + pointer.x * 0.06;
    }

    if (showDecorativeEffects && haloRef.current) {
      haloRef.current.position.z = -0.16 + Math.sin(state.clock.elapsedTime * 1.4) * 0.008;
      const haloMaterial = haloRef.current.material as MeshBasicMaterial;
      haloMaterial.opacity = MathUtils.damp(
        haloMaterial.opacity,
        0.06 + finish.shimmerBoost * 0.04 + Math.abs(pointer.x) * 0.02,
        4,
        delta,
      );
    }

    shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    shaderRef.current.uniforms.uPointer.value.copy(pointer);
    shaderRef.current.uniforms.uStrength.value = tuning.strength + finish.shimmerBoost * 0.08;
    shaderRef.current.uniforms.uDensity.value = tuning.density;
    shaderRef.current.uniforms.uGlint.value = tuning.glint + finish.shimmerBoost * 0.12;
    shaderRef.current.uniforms.uFresnelPower.value = tuning.fresnelPower;

    const frontFacing = Math.cos(groupRef.current.rotation.y) >= 0;

    if (edgeRef.current?.uniforms) {
      edgeRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      edgeRef.current.uniforms.uTilt.value = edgeTilt;
      edgeRef.current.uniforms.uTiltDirection.value.copy(edgeTiltDirection);
      edgeRef.current.uniforms.uTint.value.set(frontFacing ? '#f7fbff' : '#eef4ff');
    }

    if (edgeMeshRef.current) {
      edgeMeshRef.current.position.z = frontFacing ? faceOffset + 0.0038 : -faceOffset - 0.0038;
      edgeMeshRef.current.rotation.y = frontFacing ? 0 : Math.PI;
    }
  });

  if (!textures) {
    return null;
  }

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[4.5, 7, 6]} intensity={2.6} color="#fff8ec" />
      <pointLight position={[-3.5, 0.8, 5]} intensity={12} color={meta.hue} />
      <pointLight position={[2.8, -1.2, 4.4]} intensity={10} color={meta.accent} />

      {showDecorativeEffects ? (
        <mesh ref={ringRef} position={[0, 0.04, -1.24]}>
          <torusGeometry args={[1.86, 0.03, 16, 80]} />
          <meshBasicMaterial
            color={new Color(meta.hue)}
            transparent
            opacity={0.28}
            blending={AdditiveBlending}
          />
        </mesh>
      ) : null}

      <Float speed={1.35} rotationIntensity={0.06} floatIntensity={0.18}>
        <group ref={groupRef}>
          <mesh>
            <primitive attach="geometry" object={bodyGeometry} />
            <meshPhysicalMaterial
              color="#090b0f"
              metalness={0.22}
              roughness={0.48}
              clearcoat={1}
              clearcoatRoughness={0.12}
              reflectivity={0.28}
              iridescence={0.02 + finish.shimmerBoost * 0.03}
              iridescenceIOR={1.08}
            />
          </mesh>

          <mesh ref={edgeMeshRef} position={[0, 0, faceOffset + 0.0038]} scale={[1.0045, 1.0045, 1]}>
            <primitive attach="geometry" object={edgeGeometry} />
            <shaderMaterial
              ref={edgeRef}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
              uniforms={{
                uTint: { value: new Color('#f7fbff') },
                uTime: { value: 0 },
                uTilt: { value: 0 },
                uTiltDirection: { value: new Vector2(0, 0) },
              }}
              vertexShader={edgeHighlightVertexShader}
              fragmentShader={edgeHighlightFragmentShader}
            />
          </mesh>

          <mesh position={[0, 0, faceOffset]}>
            <primitive attach="geometry" object={faceGeometry} />
            <meshPhysicalMaterial
              map={textures.front}
              metalness={0.06}
              roughness={0.92}
              clearcoat={0}
              reflectivity={0.08}
            />
          </mesh>

          <mesh position={[0, 0, -faceOffset]} rotation={[0, Math.PI, 0]}>
            <primitive attach="geometry" object={faceGeometry} />
            <meshPhysicalMaterial
              map={textures.back}
              metalness={0.06}
              roughness={0.94}
              clearcoat={0}
              reflectivity={0.06}
            />
          </mesh>

          <mesh position={[0, 0, faceOffset + 0.016]}>
            <primitive attach="geometry" object={faceGeometry} />
            <shaderMaterial
              ref={shaderRef}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
              uniforms={{
                uTime: { value: 0 },
                uMaskMap: { value: textures.foil },
                uZoneMap: { value: textures.foilZone },
                uAccent: { value: new Color(meta.accent) },
                uHue: { value: new Color(meta.hue) },
                uStrength: { value: tuning.strength + finish.shimmerBoost * 0.08 },
                uDensity: { value: tuning.density },
                uGlint: { value: tuning.glint + finish.shimmerBoost * 0.12 },
                uFresnelPower: { value: tuning.fresnelPower },
                uPointer: { value: new Vector2(0, 0) },
              }}
              vertexShader={`
                varying vec2 vUv;
                varying vec3 vWorldNormal;
                varying vec3 vWorldPosition;

                void main() {
                  vUv = uv;
                  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                  vWorldPosition = worldPosition.xyz;
                  vWorldNormal = normalize(mat3(modelMatrix) * normal);
                  gl_Position = projectionMatrix * viewMatrix * worldPosition;
                }
              `}
              fragmentShader={`
                uniform sampler2D uMaskMap;
                uniform sampler2D uZoneMap;
                uniform vec3 uAccent;
                uniform vec3 uHue;
                uniform float uTime;
                uniform float uStrength;
                uniform float uDensity;
                uniform float uGlint;
                uniform float uFresnelPower;
                uniform vec2 uPointer;

                varying vec2 vUv;
                varying vec3 vWorldNormal;
                varying vec3 vWorldPosition;

                float hash(vec2 p) {
                  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }

                float noise(vec2 p) {
                  vec2 i = floor(p);
                  vec2 f = fract(p);
                  float a = hash(i);
                  float b = hash(i + vec2(1.0, 0.0));
                  float c = hash(i + vec2(0.0, 1.0));
                  float d = hash(i + vec2(1.0, 1.0));
                  vec2 u = f * f * (3.0 - 2.0 * f);
                  return mix(a, b, u.x) +
                    (c - a) * u.y * (1.0 - u.x) +
                    (d - b) * u.x * u.y;
                }

                vec3 spectrum(float t) {
                  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.16, 0.34)));
                }

                void main() {
                  vec2 uv = vUv;
                  vec3 N = normalize(vWorldNormal);
                  vec3 V = normalize(cameraPosition - vWorldPosition);
                  float fresnel = pow(1.0 - max(dot(N, V), 0.0), uFresnelPower);

                  vec2 flowUv = uv * (1.4 + uDensity * 0.4);
                  float mask = dot(texture2D(uMaskMap, flowUv).rgb, vec3(0.333333));
                  float zone = dot(texture2D(uZoneMap, uv).rgb, vec3(0.333333));
                  float micro = noise(
                    uv * vec2(220.0 + uDensity * 80.0, 320.0 + uDensity * 120.0) + uTime * 0.12
                  );
                  float stripe = sin(
                    uv.y * (32.0 + uDensity * 42.0) + uv.x * 22.0 + uTime * (1.1 + uStrength)
                  );
                  float angleWave = sin((uv.x + uv.y) * 18.0 + fresnel * 9.0 - uTime * 0.6);
                  float diffraction = 0.5 + 0.5 * stripe;
                  float rainbowPhase =
                    diffraction * 0.55 + angleWave * 0.18 + fresnel * 0.42 + micro * 0.15;
                  vec3 rainbow = spectrum(rainbowPhase + uTime * 0.03);

                  vec3 lightDir = normalize(
                    vec3(0.25 + uPointer.x * 0.4, 0.18 + uPointer.y * 0.35, 1.0)
                  );
                  float glint = pow(max(dot(reflect(-V, N), lightDir), 0.0), mix(26.0, 10.0, uGlint));
                  float sweep = pow(
                    max(1.0 - abs(uv.x - (0.5 + uPointer.x * 0.12 + sin(uTime * 0.7) * 0.08)), 0.0),
                    12.0
                  );

                  float zoneIntensity = smoothstep(0.02, 0.95, zone);
                  float holo = zoneIntensity * (0.18 + mask * 0.82);
                  holo *= (0.2 + fresnel * 1.0 + glint * 1.25 + sweep * 0.42);
                  holo *= 0.56 + diffraction * 0.34 + micro * 0.16;

                  vec3 tint = mix(uHue, uAccent, 0.5 + 0.5 * angleWave);
                  vec3 color = mix(tint, rainbow, 0.84) * holo;
                  float alpha = clamp(holo * (0.42 + uStrength * 0.44), 0.0, 0.88);

                  gl_FragColor = vec4(color, alpha);
                }
              `}
            />
          </mesh>

          {showDecorativeEffects ? (
            <mesh ref={haloRef} position={[0, 0, -0.18]}>
              <planeGeometry args={[3.05, 4.4]} />
              <meshBasicMaterial
                color={new Color(meta.hue)}
                transparent
                opacity={0.08}
                blending={AdditiveBlending}
              />
            </mesh>
          ) : null}
        </group>
      </Float>

      {showDecorativeEffects ? (
        <>
          <Sparkles
            count={card.rarity === 'veryrare' ? 54 : card.rarity === 'epic' ? 40 : 24}
            scale={[5.4, 5.4, 3.2]}
            size={card.rarity === 'common' ? 1.8 : 2.6}
            speed={0.26 + finish.shimmerBoost * 0.2}
            color={meta.accent}
          />

          <EffectComposer>
            <Bloom
              intensity={0.9 + finish.shimmerBoost * 0.32}
              luminanceThreshold={0.18}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.16} darkness={0.78} />
          </EffectComposer>
        </>
      ) : null}
    </>
  );
}

const MemoCardRig = memo(CardRig);

export function CardViewerCanvas({
  card,
  introKey,
  cameraZ = 7,
  scaleMultiplier = 1,
  effectsPreset = 'full',
}: {
  card: OwnedCard;
  introKey: string;
  cameraZ?: number;
  scaleMultiplier?: number;
  effectsPreset?: ViewerEffectsPreset;
}) {
  const suppressClickRef = useRef(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const flipTargetRef = useRef(0);
  const sideRef = useRef<CardSide>('front');
  const dragRef = useRef(initialDrag);
  const dragPreviewRef = useRef(0);
  const mousePressRef = useRef(initialPointerPress);
  const dragPointerRef = useRef<{ pointerType: string | null; pointerId: number | null }>({
    pointerType: null,
    pointerId: null,
  });
  const pointer = useMemo(() => new Vector2(0, 0), []);

  const applySide = (nextSide: CardSide, targetRotation = nextSide === 'back' ? Math.PI : 0) => {
    sideRef.current = nextSide;
    flipTargetRef.current = targetRotation;
  };

  const flipInDragDirection = (deltaX: number) => {
    const nextSide = sideRef.current === 'front' ? 'back' : 'front';
    const rotationStep = deltaX > 0 ? Math.PI : -Math.PI;
    applySide(nextSide, flipTargetRef.current + rotationStep);
  };

  const resetMousePress = () => {
    mousePressRef.current = initialPointerPress;
  };

  const resetDragPointer = () => {
    dragPointerRef.current = {
      pointerType: null,
      pointerId: null,
    };
  };

  const beginDrag = ({
    pointerType,
    pointerId,
    startX,
    deltaX,
    moved,
  }: {
    pointerType: string;
    pointerId: number;
    startX: number;
    deltaX: number;
    moved: boolean;
  }) => {
    dragPointerRef.current = { pointerType, pointerId };
    dragRef.current = {
      active: true,
      startX,
      deltaX,
      moved,
    };
    dragPreviewRef.current = MathUtils.clamp(deltaX / 180, -1, 1) * FLIP_PREVIEW_LIMIT;
  };

  const finishDrag = (deltaX: number, moved: boolean) => {
    if (moved) {
      suppressClickRef.current = true;
    }

    if (Math.abs(deltaX) > FLIP_TRIGGER_DISTANCE) {
      flipInDragDirection(deltaX);
    }

    resetMousePress();
    resetDragPointer();
    dragRef.current = initialDrag;
    dragPreviewRef.current = 0;
  };

  useEffect(() => {
    suppressClickRef.current = false;
    pointer.set(0, 0);
    resetMousePress();
    resetDragPointer();
    dragRef.current = initialDrag;
    dragPreviewRef.current = 0;
    applySide('front');
  }, [introKey, pointer]);

  const syncPointerFromClient = (clientX: number, clientY: number) => {
    const rect = viewerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const isInside =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    if (!isInside && !dragRef.current.active) {
      pointer.set(0, 0);
      return;
    }

    const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = -((((clientY - rect.top) / rect.height) * 2) - 1);
    pointer.set(
      MathUtils.clamp(normalizedX, -1, 1),
      MathUtils.clamp(normalizedY, -1, 1),
    );
  };

  const syncPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    syncPointerFromClient(event.clientX, event.clientY);
  };

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      syncPointerFromClient(event.clientX, event.clientY);

      if (
        mousePressRef.current.active &&
        mousePressRef.current.pointerId === event.pointerId &&
        !dragRef.current.active
      ) {
        const deltaX = event.clientX - mousePressRef.current.startX;

        if (Math.abs(deltaX) > 8) {
          beginDrag({
            pointerType: 'mouse',
            pointerId: event.pointerId,
            startX: mousePressRef.current.startX,
            deltaX,
            moved: true,
          });
          resetMousePress();
        }

        return;
      }

      if (
        dragRef.current.active &&
        dragPointerRef.current.pointerType === 'mouse' &&
        dragPointerRef.current.pointerId === event.pointerId
      ) {
        const deltaX = event.clientX - dragRef.current.startX;
        dragRef.current = {
          ...dragRef.current,
          deltaX,
          moved: dragRef.current.moved || Math.abs(deltaX) > 8,
        };
        dragPreviewRef.current = MathUtils.clamp(deltaX / 180, -1, 1) * FLIP_PREVIEW_LIMIT;
      }
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
      syncPointerFromClient(event.clientX, event.clientY);

      if (
        dragRef.current.active &&
        dragPointerRef.current.pointerType === 'mouse' &&
        dragPointerRef.current.pointerId === event.pointerId
      ) {
        const deltaX = event.clientX - dragRef.current.startX;
        finishDrag(deltaX, dragRef.current.moved || Math.abs(deltaX) > 8);
        return;
      }

      if (mousePressRef.current.active && mousePressRef.current.pointerId === event.pointerId) {
        resetMousePress();
      }
    };

    const handleWindowPointerCancel = (event: PointerEvent) => {
      if (
        dragRef.current.active &&
        dragPointerRef.current.pointerType === 'mouse' &&
        dragPointerRef.current.pointerId === event.pointerId
      ) {
        resetDragPointer();
        dragRef.current = initialDrag;
        dragPreviewRef.current = 0;
      }

      if (mousePressRef.current.active && mousePressRef.current.pointerId === event.pointerId) {
        resetMousePress();
      }
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerCancel);
    };
  }, [pointer]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    syncPointer(event);

    if (event.pointerType === 'mouse') {
      mousePressRef.current = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
      };
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    beginDrag({
      pointerType: event.pointerType,
      pointerId: event.pointerId,
      startX: event.clientX,
      deltaX: 0,
      moved: false,
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    syncPointer(event);

    if (
      event.pointerType === 'mouse' &&
      mousePressRef.current.active &&
      mousePressRef.current.pointerId === event.pointerId &&
      !dragRef.current.active
    ) {
      const deltaX = event.clientX - mousePressRef.current.startX;

      if (Math.abs(deltaX) > 8) {
        event.stopPropagation();
        beginDrag({
          pointerType: 'mouse',
          pointerId: event.pointerId,
          startX: mousePressRef.current.startX,
          deltaX,
          moved: true,
        });
        resetMousePress();
      }

      return;
    }

    if (
      !dragRef.current.active ||
      dragPointerRef.current.pointerId !== event.pointerId
    ) {
      return;
    }

    event.stopPropagation();
    const deltaX = event.clientX - dragRef.current.startX;
    dragRef.current = {
      ...dragRef.current,
      deltaX,
      moved: dragRef.current.moved || Math.abs(deltaX) > 8,
    };
    dragPreviewRef.current = MathUtils.clamp(deltaX / 180, -1, 1) * FLIP_PREVIEW_LIMIT;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    syncPointer(event);

    if (event.pointerType === 'mouse') {
      if (
        dragRef.current.active &&
        dragPointerRef.current.pointerType === 'mouse' &&
        dragPointerRef.current.pointerId === event.pointerId
      ) {
        const deltaX = event.clientX - dragRef.current.startX;
        finishDrag(deltaX, dragRef.current.moved || Math.abs(deltaX) > 8);
        return;
      }

      if (mousePressRef.current.active && mousePressRef.current.pointerId === event.pointerId) {
        resetMousePress();
      }

      return;
    }

    if (
      !dragRef.current.active ||
      dragPointerRef.current.pointerId !== event.pointerId
    ) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    finishDrag(dragRef.current.deltaX, dragRef.current.moved);
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') {
      resetMousePress();

      if (dragPointerRef.current.pointerType === 'mouse' && dragRef.current.active) {
        resetDragPointer();
        dragRef.current = initialDrag;
        dragPreviewRef.current = 0;
      }

      return;
    }

    if (dragRef.current.active) {
      event.stopPropagation();
      resetDragPointer();
      dragRef.current = initialDrag;
      dragPreviewRef.current = 0;
    }
  };

  return (
    <div
      ref={viewerRef}
      className="card-viewer"
      onClick={(event) => {
        if (suppressClickRef.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = false;
        }
      }}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerLeave={() => {
        if (!dragRef.current.active && !mousePressRef.current.active) {
          pointer.set(0, 0);
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ touchAction: 'pan-y' }}
    >
      <Canvas camera={{ position: [0, 0, cameraZ], fov: 30 }} dpr={[1, 2]}>
        <MemoCardRig
          card={card}
          introKey={introKey}
          scaleMultiplier={scaleMultiplier}
          effectsPreset={effectsPreset}
          flipTargetRef={flipTargetRef}
          dragPreviewRef={dragPreviewRef}
          pointer={pointer}
        />
      </Canvas>
    </div>
  );
}
