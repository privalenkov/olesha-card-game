import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber';
import { Float, Sparkles } from '@react-three/drei';
import {
  AdditiveBlending,
  Color,
  DoubleSide,
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
  Vector3,
} from 'three';
import { finishMeta, rarityMeta } from '../game/config';
import type { CardTreatmentEffect, OwnedCard, Rarity } from '../game/types';
import { useCardTextures, useStackCardBackTexture } from '../three/textures';
import {
  VIEWER_BASE_TILT_X,
  SharedViewerLighting,
  SharedViewerPostProcessing,
  VIEWER_CANVAS_DPR,
  VIEWER_CANVAS_FOV,
  VIEWER_HOVER_TILT_X,
  VIEWER_HOVER_TILT_Y,
  VIEWER_IDLE_ROLL_AMPLITUDE,
  VIEWER_IDLE_ROLL_SPEED,
  VIEWER_LIGHTS,
} from './viewerSceneProfile';

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

const viewerLightStrengthByRarity: Record<Rarity, number> = {
  common: 0.16,
  uncommon: 0.26,
  rare: 0.46,
  epic: 0.68,
  veryrare: 0.9,
};

function createViewerLightingPalette(rarity: Rarity, hue: string, accent: string) {
  const richness = viewerLightStrengthByRarity[rarity];
  const hueColor = new Color(hue);
  const accentColor = new Color(accent);
  const neutral = new Color('#edf4ff');
  const warm = new Color('#fff2df');
  const sky = new Color('#f7fbff');
  const rimBase = new Color('#9ecbff');
  const groundBase = new Color('#131722');

  return {
    ambientColor: neutral.clone().lerp(hueColor, 0.08 + richness * 0.08),
    ambientIntensity: 0.34 + richness * 0.08,
    hemisphereColor: sky.clone().lerp(accentColor, 0.12 + richness * 0.12),
    hemisphereGroundColor: groundBase.clone().lerp(hueColor, 0.06 + richness * 0.08),
    hemisphereIntensity: 0.76 + richness * 0.14,
    keyColor: warm.clone().lerp(accentColor, 0.16 + richness * 0.22),
    keyIntensity: 2.75 + richness * 0.45,
    rimColor: rimBase.clone().lerp(hueColor, 0.22 + richness * 0.34),
    rimIntensity: 1 + richness * 0.22,
    fillColor: neutral.clone().lerp(hueColor, 0.18 + richness * 0.28),
    fillIntensity: 12.8 + richness * 3.4,
    accentColor: accentColor.clone().lerp(hueColor, 0.28 + richness * 0.16),
    accentIntensity: 9.8 + richness * 4.4,
  };
}

function createViewerHighlightPalette(rarity: Rarity, hue: string, accent: string) {
  const richness = viewerLightStrengthByRarity[rarity];
  const hueColor = new Color(hue);
  const accentColor = new Color(accent);
  const white = new Color('#ffffff');
  const coolBack = new Color('#eef4ff');

  return {
    glare: accentColor.clone().lerp(hueColor, 0.5).lerp(white, 0.1 + richness * 0.06),
    edgeFront: accentColor.clone().lerp(hueColor, 0.42).lerp(white, 0.12 + richness * 0.08),
    edgeBack: hueColor.clone().lerp(coolBack, 0.16),
  };
}

type ViewerEffectsPreset = 'full' | 'stack' | 'diagnostic';
type CardSide = 'front' | 'back';
type ViewerShakeMode = 'none' | 'rare' | 'epic' | 'veryrare';
type ViewerImpactRarity = Extract<Rarity, 'rare' | 'epic' | 'veryrare'>;

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

function getLayerValue(
  card: OwnedCard,
  type: CardTreatmentEffect,
  field: 'opacity' | 'shimmer' | 'relief',
) {
  const layer = card.effectLayers?.find((item) => item.type === type);
  if (!layer) {
    return field === 'relief' ? 0 : 1;
  }

  return layer[field];
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

const CARD_HOVER_PLANE_WIDTH = CARD_FACE.width * 1.08;
const CARD_HOVER_PLANE_HEIGHT = CARD_FACE.height * 1.08;
const FLIP_PREVIEW_LIMIT = 0.72;
const FLIP_TRIGGER_DISTANCE = 72;

function getHoverYawDirection(rotationY: number) {
  const normalizedRotation = MathUtils.euclideanModulo(rotationY, Math.PI * 2);
  const showingBackSide =
    normalizedRotation > Math.PI * 0.5 && normalizedRotation < Math.PI * 1.5;

  return showingBackSide ? -1 : 1;
}
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

const cardSurfaceVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vWorldTangent;
  varying vec3 vWorldBitangent;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vWorldTangent = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
    vWorldBitangent = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const finishTreatmentFragmentShader = `
  uniform sampler2D uSugarMap;
  uniform sampler2D uSparkleMap;
  uniform sampler2D uPrismMap;
  uniform vec3 uLayerWeights;
  uniform vec2 uSurfaceReliefWeights;
  uniform vec3 uAccent;
  uniform vec3 uHue;
  uniform vec3 uKeyLightPos;
  uniform vec3 uFillLightPos;
  uniform vec3 uAccentLightPos;
  uniform float uTime;
  uniform float uSugarIntensity;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vWorldTangent;
  varying vec3 vWorldBitangent;

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

  float specularFromLight(vec3 lightPos, vec3 normal, vec3 viewDir, float power) {
    vec3 lightDir = normalize(lightPos - vWorldPosition);
    return pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), power);
  }

  vec2 random2(vec2 p) {
    return vec2(
      hash(p + vec2(1.7, 9.2)),
      hash(p + vec2(8.3, 2.8))
    );
  }

  float sugarHeightField(vec2 uv) {
    float sugarMask = texture2D(uSugarMap, uv).r * uSurfaceReliefWeights.x;
    float prismMask = texture2D(uPrismMap, uv).r * uSurfaceReliefWeights.y;
    float noiseA = noise(uv * vec2(760.0, 1080.0));
    float noiseB = noise(uv * vec2(460.0, 640.0) + 9.17);
    float ridges = 0.5 + 0.5 * sin(uv.y * 180.0 + uv.x * 120.0);

    return
      sugarMask * (noiseA * 0.72 + noiseB * 0.38) +
      prismMask * ridges * 0.34;
  }

  vec3 microNormalFromHeight(vec2 uv, vec3 baseNormal) {
    vec2 texel = vec2(1.0 / 1024.0, 1.0 / 1536.0);
    float hx = sugarHeightField(uv + vec2(texel.x, 0.0)) - sugarHeightField(uv - vec2(texel.x, 0.0));
    float hy = sugarHeightField(uv + vec2(0.0, texel.y)) - sugarHeightField(uv - vec2(0.0, texel.y));
    return normalize(
      baseNormal +
      vWorldTangent * (-hx * 3.4) +
      vWorldBitangent * (-hy * 3.4)
    );
  }

  vec4 sampleDiamondDust(vec2 uv, vec2 density, float seedOffset) {
    vec2 scaled = uv * density;
    vec2 cell = floor(scaled);
    vec2 local = fract(scaled);
    float bestDist = 100.0;
    float bestSeed = 0.0;
    vec2 bestRand = vec2(0.0);

    for (int y = -1; y <= 1; y += 1) {
      for (int x = -1; x <= 1; x += 1) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 cellId = cell + neighbor;
        vec2 rand = random2(cellId + vec2(seedOffset, seedOffset * 1.37));
        vec2 center = neighbor + mix(vec2(0.16), vec2(0.84), rand);
        vec2 delta = center - local;
        float dist = dot(delta, delta);

        if (dist < bestDist) {
          bestDist = dist;
          bestRand = rand;
          bestSeed = hash(cellId + vec2(seedOffset * 0.43, seedOffset * 2.17));
        }
      }
    }

    float radius = mix(0.05, 0.16, bestRand.x);
    float shape = 1.0 - smoothstep(radius * radius * 0.16, radius * radius, bestDist);
    return vec4(shape, bestSeed, bestRand);
  }

  float diamondDustSpec(
    vec4 dust,
    vec3 baseNormal,
    vec3 viewDir,
    vec3 lightDir,
    float tangentStrength,
    float powerMin,
    float powerMax
  ) {
    vec2 jitter = dust.zw * 2.0 - 1.0;
    vec3 facetNormal = normalize(
      baseNormal +
      vWorldTangent * jitter.x * tangentStrength +
      vWorldBitangent * jitter.y * tangentStrength
    );
    vec3 halfVector = normalize(lightDir + viewDir);
    float specular = pow(max(dot(facetNormal, halfVector), 0.0), mix(powerMin, powerMax, dust.y));
    return dust.x * specular;
  }

  vec4 sampleSparkleFacet(vec2 uv, vec2 density, float seedOffset) {
    vec2 scaled = uv * density;
    vec2 cell = floor(scaled);
    vec2 local = fract(scaled);
    float bestDist = 100.0;
    vec2 bestDelta = vec2(0.0);
    float bestSeed = 0.0;
    float bestGate = 0.0;

    for (int y = -1; y <= 1; y += 1) {
      for (int x = -1; x <= 1; x += 1) {
        vec2 neighbor = vec2(float(x), float(y));
        vec2 cellId = cell + neighbor;
        vec2 rand = random2(cellId + vec2(seedOffset * 0.61, seedOffset * 1.91));
        vec2 center = neighbor + mix(vec2(0.14), vec2(0.86), rand);
        vec2 delta = local - center;
        float dist = dot(delta, delta);

        if (dist < bestDist) {
          bestDist = dist;
          bestDelta = delta;
          bestSeed = hash(cellId + vec2(seedOffset * 0.57, seedOffset * 2.41));
          bestGate = step(0.42, rand.y);
        }
      }
    }

    return vec4(bestDelta, bestSeed, bestGate);
  }

  float sparkleFacetShape(vec2 delta, float seed) {
    float angle = seed * 6.28318;
    float cs = cos(angle);
    float sn = sin(angle);
    mat2 rotation = mat2(cs, -sn, sn, cs);
    vec2 p = rotation * delta;
    float sizeX = mix(0.065, 0.18, fract(seed * 13.17));
    float sizeY = mix(0.04, 0.11, fract(seed * 7.31));
    float skew = mix(-0.6, 0.6, fract(seed * 5.73));
    p.x += p.y * skew;

    float rhombus = abs(p.x) / sizeX + abs(p.y) / sizeY;
    float body = 1.0 - smoothstep(0.72, 1.0, rhombus);
    float mirrorRidge =
      exp(-abs(p.y) / (sizeY * 0.34 + 0.0001)) *
      smoothstep(1.0, 0.18, rhombus);
    float edgeFlash = exp(-abs(rhombus - 0.82) * 12.0) * 0.18;

    return body * 0.84 + mirrorRidge * 0.66 + edgeFlash;
  }

  vec3 sparkleFacetNormal(vec3 baseNormal, float seed) {
    float angle = seed * 6.28318;
    float tilt = mix(0.22, 0.56, fract(seed * 9.17));
    vec2 axis = vec2(cos(angle), sin(angle));
    return normalize(
      baseNormal +
      vWorldTangent * axis.x * tilt +
      vWorldBitangent * axis.y * tilt * 0.82
    );
  }

  float sparkleFacetSpec(
    vec4 facet,
    vec3 baseNormal,
    vec3 viewDir,
    vec3 lightDir,
    float power
  ) {
    float shape = sparkleFacetShape(facet.xy, facet.z) * facet.w;
    vec3 facetNormal = sparkleFacetNormal(baseNormal, facet.z);
    vec3 halfVector = normalize(lightDir + viewDir);
    float specular = pow(max(dot(facetNormal, halfVector), 0.0), power);
    return shape * specular;
  }

  void main() {
    float sugarMask = texture2D(uSugarMap, vUv).r * uLayerWeights.x;
    float sparkleMask = texture2D(uSparkleMap, vUv).r * uLayerWeights.y;
    float prismMask = texture2D(uPrismMap, vUv).r * uLayerWeights.z;

    if (sugarMask < 0.0002 && sparkleMask < 0.0002 && prismMask < 0.0002) {
      discard;
    }

    vec3 baseNormal = normalize(vWorldNormal);
    vec3 normal = microNormalFromHeight(vUv, baseNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(clamp(1.0 - max(dot(normal, viewDir), 0.0), 0.0, 1.0), 2.4);

    vec3 keyLightDir = normalize(uKeyLightPos - vWorldPosition);
    vec3 fillLightDir = normalize(uFillLightPos - vWorldPosition);
    vec3 accentLightDir = normalize(uAccentLightPos - vWorldPosition);

    float grainLarge = smoothstep(0.58, 0.95, noise(vUv * vec2(420.0, 640.0) + 5.3));

    float keyWide = specularFromLight(uKeyLightPos, normal, viewDir, 16.0);
    float fillWide = specularFromLight(uFillLightPos, normal, viewDir, 22.0);
    float accentWide = specularFromLight(uAccentLightPos, normal, viewDir, 18.0);
    float accentTight = specularFromLight(uAccentLightPos, normal, viewDir, 56.0);

    vec4 dustPrimary = sampleDiamondDust(vUv, vec2(170.0, 240.0), 1.7);
    vec4 dustSecondary = sampleDiamondDust(vUv + vec2(0.011, 0.017), vec2(108.0, 148.0), 6.1);
    vec4 dustFine = sampleDiamondDust(vUv + vec2(0.003, 0.007), vec2(230.0, 320.0), 11.4);

    float sugarPrimary =
      diamondDustSpec(dustPrimary, normal, viewDir, keyLightDir, 1.2, 44.0, 180.0) * 1.72 +
      diamondDustSpec(dustPrimary, normal, viewDir, accentLightDir, 1.05, 36.0, 140.0) * 0.66;
    float sugarSecondary =
      diamondDustSpec(dustSecondary, normal, viewDir, keyLightDir, 0.92, 28.0, 110.0) * 0.98 +
      diamondDustSpec(dustSecondary, normal, viewDir, fillLightDir, 0.88, 26.0, 96.0) * 0.52;
    float sugarFine =
      diamondDustSpec(dustFine, normal, viewDir, keyLightDir, 1.35, 120.0, 260.0) * 1.46 +
      diamondDustSpec(dustFine, normal, viewDir, accentLightDir, 1.22, 96.0, 220.0) * 0.56;

    float sugarSheen = sugarMask * (
      keyWide * 0.48 +
      fillWide * 0.32 +
      accentWide * 0.2 +
      fresnel * 0.14
    ) * (0.18 + grainLarge * 0.12);
    float sugar =
      sugarMask * (sugarPrimary + sugarSecondary + sugarFine) +
      sugarSheen;
    sugar *= uSugarIntensity;
    vec4 sparkleFacetPrimary = sampleSparkleFacet(vUv + vec2(0.007, 0.011), vec2(14.0, 20.0), 3.8);
    vec4 sparkleFacetSecondary = sampleSparkleFacet(vUv + vec2(-0.013, 0.009), vec2(10.0, 14.0), 8.4);
    float sparkleFacetField =
      sparkleFacetShape(sparkleFacetPrimary.xy, sparkleFacetPrimary.z) * sparkleFacetPrimary.w +
      sparkleFacetShape(sparkleFacetSecondary.xy, sparkleFacetSecondary.z) * sparkleFacetSecondary.w * 0.72;
    float mirrorBandCoord = dot(vUv - vec2(0.5), normalize(vec2(0.88, -0.42)));
    float mirrorBandCenter = sin(uTime * 0.38) * 0.08;
    float sparkleMirrorBand = pow(
      max(1.0 - abs(mirrorBandCoord - mirrorBandCenter) * 7.2, 0.0),
      18.0
    );
    float sparkleMirror = sparkleMask *
      sparkleMirrorBand *
      (keyWide * 0.52 + accentTight * 0.64 + fresnel * 0.18) *
      (0.35 + sparkleFacetField * 0.4);
    float sparkleAmbient = sparkleMask * sparkleFacetField * (
      accentWide * 0.16 +
      fresnel * 0.12
    );
    float sparkleFacets =
      sparkleFacetSpec(sparkleFacetPrimary, normal, viewDir, keyLightDir, 36.0) * 1.56 +
      sparkleFacetSpec(sparkleFacetPrimary, normal, viewDir, accentLightDir, 40.0) * 1.28 +
      sparkleFacetSpec(sparkleFacetSecondary, normal, viewDir, fillLightDir, 30.0) * 0.92;
    float sparkle = sparkleMask * (
      sparkleFacets * 1.36 +
      sparkleMirror +
      sparkleAmbient
    );
    float prism = prismMask * (accentTight * 0.82 + keyWide * 0.56 + fresnel * 1.08);

    float phase =
      noise(vUv * vec2(24.0, 34.0)) * 0.48 +
      fresnel * 0.34 +
      accentTight * 0.18 +
      uTime * 0.05;

    vec3 sugarColor = mix(vec3(1.0), uAccent, 0.16);
    vec3 sparkleColor = mix(vec3(0.98, 0.985, 1.0), mix(uAccent, uHue, 0.24), 0.12);
    vec3 prismColor = mix(uHue, spectrum(phase), 0.82);
    vec3 sugarVeil = sugarColor * sugarMask * (0.028 + keyWide * 0.07 + fresnel * 0.04) * uSugarIntensity;

    vec3 color =
      sugarVeil +
      sugarColor * sugar * 0.98 +
      sparkleColor * sparkle * 1.54 +
      prismColor * prism * 1.32;
    float sugarAlpha = clamp(sugarMask * 0.04 + sugar * 0.44, 0.0, 0.72);
    float sparkleAlpha = clamp(sparkle * 0.78, 0.0, 0.78);
    float prismAlpha = clamp(prism * 0.7, 0.0, 0.82);
    float alpha =
      1.0 - (1.0 - sugarAlpha) * (1.0 - sparkleAlpha) * (1.0 - prismAlpha);
    alpha = min(alpha, 0.94);

    gl_FragColor = vec4(color, alpha);
  }
`;

const glossFragmentShader = `
  uniform sampler2D uGlossMap;
  uniform vec3 uKeyLightPos;
  uniform vec3 uFillLightPos;
  uniform vec3 uAccentLightPos;
  uniform vec3 uGlareColor;
  uniform float uGlossiness;
  uniform vec2 uPointer;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  float specularFromLight(vec3 lightPos, vec3 normal, vec3 viewDir, float power) {
    vec3 lightDir = normalize(lightPos - vWorldPosition);
    vec3 halfVector = normalize(lightDir + viewDir);
    return pow(max(dot(normal, halfVector), 0.0), power);
  }

  void main() {
    float mask = texture2D(uGlossMap, vUv).r;
    float glossiness = clamp(uGlossiness, 0.0, 1.0);

    if (mask < 0.0002 || glossiness < 0.001) {
      discard;
    }

    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(
      clamp(1.0 - max(dot(normal, viewDir), 0.0), 0.0, 1.0),
      mix(3.2, 4.8, glossiness)
    );

    float tightPower = mix(36.0, 120.0, glossiness);
    float widePower = mix(8.0, 24.0, glossiness);

    float keyTight = specularFromLight(uKeyLightPos, normal, viewDir, tightPower);
    float fillTight = specularFromLight(uFillLightPos, normal, viewDir, tightPower * 0.9);
    float accentTight = specularFromLight(uAccentLightPos, normal, viewDir, tightPower * 1.14);
    float keyWide = specularFromLight(uKeyLightPos, normal, viewDir, widePower);
    float fillWide = specularFromLight(uFillLightPos, normal, viewDir, widePower * 0.92);
    float accentWide = specularFromLight(uAccentLightPos, normal, viewDir, widePower * 1.08);

    vec2 sweepAxis = normalize(vec2(0.86, -0.5));
    vec2 sweepCenter = vec2(0.5 + uPointer.x * 0.16, 0.5 - uPointer.y * 0.1);
    float sweepCoord = dot(vUv - sweepCenter, sweepAxis);
    float broadSweep = pow(
      max(1.0 - abs(sweepCoord) * mix(3.2, 2.2, glossiness), 0.0),
      mix(1.6, 3.2, glossiness)
    );
    float crispSweep = pow(
      max(1.0 - abs(sweepCoord) * mix(9.0, 6.2, glossiness), 0.0),
      mix(4.0, 9.0, glossiness)
    );
    float sweep =
      broadSweep * (0.36 + 0.46 * glossiness) +
      crispSweep * (0.18 + 0.38 * glossiness);

    float highlight =
      keyTight * 1.18 +
      fillTight * 0.4 +
      accentTight * 1.34 +
      keyWide * 0.34 +
      fillWide * 0.2 +
      accentWide * 0.28 +
      fresnel * (0.12 + glossiness * 0.22) +
      sweep * (0.32 + keyWide * 0.58 + accentWide * 0.42 + fresnel * 0.34);
    highlight *= glossiness;

    float alpha = clamp(mask * highlight * mix(0.56, 0.94, glossiness), 0.0, 0.92);
    vec3 glareTint = mix(uGlareColor, vec3(1.0), 0.12 + glossiness * 0.08);
    vec3 color = glareTint * highlight * mask * (0.94 + glossiness * 0.22);

    gl_FragColor = vec4(color, alpha);
  }
`;

const holoFragmentShader = `
  uniform sampler2D uMaskMap;
  uniform sampler2D uZoneMap;
  uniform sampler2D uTreatmentMap;
  uniform sampler2D uPrismMap;
  uniform vec3 uAccent;
  uniform vec3 uHue;
  uniform vec3 uKeyLightPos;
  uniform vec3 uFillLightPos;
  uniform vec3 uAccentLightPos;
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

  float specularFromLight(vec3 lightPos, vec3 normal, vec3 viewDir, float power) {
    vec3 lightDir = normalize(lightPos - vWorldPosition);
    return pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), power);
  }

  void main() {
    vec2 uv = vUv;
    vec3 normal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), uFresnelPower);

    vec2 flowUv = uv * (1.4 + uDensity * 0.4);
    float mask = dot(texture2D(uMaskMap, flowUv).rgb, vec3(0.333333));
    float zone = dot(texture2D(uZoneMap, uv).rgb, vec3(0.333333));
    float treatment = texture2D(uTreatmentMap, uv).r;
    float prism = texture2D(uPrismMap, uv).r;

    float micro = noise(
      uv * vec2(220.0 + uDensity * 80.0, 320.0 + uDensity * 120.0) + uTime * 0.12
    );
    float stripe = sin(
      uv.y * (32.0 + uDensity * 42.0) + uv.x * 22.0 + uTime * (1.1 + uStrength)
    );
    float angleWave = sin((uv.x + uv.y) * 18.0 + fresnel * 9.0 - uTime * 0.6);
    float diffraction = 0.5 + 0.5 * stripe;
    float rainbowPhase =
      diffraction * 0.55 +
      angleWave * 0.18 +
      fresnel * 0.42 +
      micro * 0.15 +
      treatment * 0.08 +
      prism * 0.12;
    vec3 rainbow = spectrum(rainbowPhase + uTime * 0.03);

    float keyGlint = specularFromLight(uKeyLightPos, normal, viewDir, mix(40.0, 14.0, uGlint));
    float fillGlint = specularFromLight(uFillLightPos, normal, viewDir, mix(54.0, 20.0, uGlint));
    float accentGlint = specularFromLight(
      uAccentLightPos,
      normal,
      viewDir,
      mix(32.0, 12.0, uGlint)
    );
    float glint = keyGlint + fillGlint * 0.55 + accentGlint * 0.85;
    float sweep = pow(
      max(1.0 - abs(uv.x - (0.5 + uPointer.x * 0.12 + sin(uTime * 0.7) * 0.08)), 0.0),
      12.0
    );

    float zoneIntensity = smoothstep(0.02, 0.95, max(zone, treatment * 0.92));
    float holo = zoneIntensity * (0.16 + mask * 0.8 + treatment * 0.58 + prism * 0.36);
    holo *= (0.16 + fresnel * (1.0 + prism * 0.42) + glint * (0.96 + treatment * 0.42) + sweep * 0.26);
    holo *= 0.56 + diffraction * 0.34 + micro * 0.16;

    vec3 tint = mix(uHue, uAccent, 0.5 + 0.5 * angleWave);
    vec3 color = mix(tint, rainbow, 0.84 + prism * 0.08) * holo;
    color += spectrum(rainbowPhase + 0.18) * prism * (fresnel * 0.5 + glint * 0.22);
    float alpha = clamp(holo * (0.38 + uStrength * 0.44 + treatment * 0.12), 0.0, 0.92);

    gl_FragColor = vec4(color, alpha);
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

interface ImpactSplashProfile {
  count: number;
  reach: number;
  verticalReach: number;
  sizeMin: number;
  sizeMax: number;
  stretchMin: number;
  stretchMax: number;
  delaySpread: number;
  burstWindow: number;
  orbit: number;
  depthSpread: number;
  accentEvery: number;
}

interface ImpactParticleConfig {
  angle: number;
  radiusStart: number;
  radiusEnd: number;
  yLift: number;
  size: number;
  stretch: number;
  spin: number;
  delay: number;
  depth: number;
  orbit: number;
  secondary: boolean;
}

const impactSplashProfiles: Record<ViewerImpactRarity, ImpactSplashProfile> = {
  rare: {
    count: 16,
    reach: 2.55,
    verticalReach: 1.1,
    sizeMin: 0.22,
    sizeMax: 0.38,
    stretchMin: 1.8,
    stretchMax: 2.7,
    delaySpread: 0.04,
    burstWindow: 0.18,
    orbit: 0.18,
    depthSpread: 0.08,
    accentEvery: 4,
  },
  epic: {
    count: 24,
    reach: 3.15,
    verticalReach: 1.45,
    sizeMin: 0.24,
    sizeMax: 0.48,
    stretchMin: 2.1,
    stretchMax: 3.2,
    delaySpread: 0.055,
    burstWindow: 0.2,
    orbit: 0.28,
    depthSpread: 0.12,
    accentEvery: 3,
  },
  veryrare: {
    count: 34,
    reach: 3.9,
    verticalReach: 1.8,
    sizeMin: 0.26,
    sizeMax: 0.58,
    stretchMin: 2.4,
    stretchMax: 3.8,
    delaySpread: 0.075,
    burstWindow: 0.22,
    orbit: 0.42,
    depthSpread: 0.16,
    accentEvery: 2,
  },
};

function seededUnit(seed: number) {
  const value = Math.sin(seed * 127.1) * 43758.5453123;
  return value - Math.floor(value);
}

function getImpactSplashRarity(rarity: Rarity): ViewerImpactRarity | null {
  return rarity === 'rare' || rarity === 'epic' || rarity === 'veryrare' ? rarity : null;
}

function createImpactParticleConfigs(rarity: ViewerImpactRarity) {
  const profile = impactSplashProfiles[rarity];

  return Array.from({ length: profile.count }, (_, index): ImpactParticleConfig => {
    const seed = index + 1;
    const band = index % 3;
    const angle =
      (index / profile.count) * Math.PI * 2 + (seededUnit(seed * 1.37) - 0.5) * 0.52;
    const radiusStart = 0.12 + seededUnit(seed * 2.11) * 0.34;
    const radiusEnd =
      profile.reach * (0.74 + seededUnit(seed * 3.17) * 0.42) + band * 0.16;

    return {
      angle,
      radiusStart,
      radiusEnd,
      yLift: (seededUnit(seed * 4.09) - 0.5) * profile.verticalReach + (band - 1) * 0.12,
      size: MathUtils.lerp(profile.sizeMin, profile.sizeMax, seededUnit(seed * 5.33)),
      stretch: MathUtils.lerp(profile.stretchMin, profile.stretchMax, seededUnit(seed * 6.41)),
      spin: (seededUnit(seed * 7.07) - 0.5) * Math.PI * 1.2,
      delay: seededUnit(seed * 8.17) * profile.delaySpread,
      depth: (seededUnit(seed * 9.91) - 0.5) * profile.depthSpread,
      orbit: (seededUnit(seed * 10.73) - 0.5) * profile.orbit,
      secondary: index % profile.accentEvery === 0,
    };
  });
}

function CardRig({
  card,
  introKey,
  scaleMultiplier,
  stackBackCount,
  activeLiftProgress,
  effectsPreset,
  renderStackOnly,
  enterFromStackAnimation,
  launchExitProgress,
  shakeMode,
  revealImpactRarity,
  revealImpactDurationMs,
  skipIntroAnimation,
  flipTargetRef,
  dragPreviewRef,
  pointer,
  pointerTarget,
}: {
  card: OwnedCard;
  introKey: string;
  scaleMultiplier: number;
  stackBackCount: number;
  activeLiftProgress: number;
  effectsPreset: ViewerEffectsPreset;
  renderStackOnly: boolean;
  enterFromStackAnimation: boolean;
  launchExitProgress: number;
  shakeMode: ViewerShakeMode;
  revealImpactRarity: ViewerImpactRarity | null;
  revealImpactDurationMs: number;
  skipIntroAnimation: boolean;
  flipTargetRef: MutableRefObject<number>;
  dragPreviewRef: MutableRefObject<number>;
  pointer: Vector2;
  pointerTarget: Vector2;
}) {
  const outerGroupRef = useRef<Group>(null);
  const stackGroupRef = useRef<Group>(null);
  const activeHoverGroupRef = useRef<Group>(null);
  const activeGroupRef = useRef<Group>(null);
  const ringRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  const shaderRef = useRef<ShaderMaterial>(null);
  const glossShaderRef = useRef<ShaderMaterial>(null);
  const sugarFinishShaderRef = useRef<ShaderMaterial>(null);
  const sparkleFinishShaderRef = useRef<ShaderMaterial>(null);
  const prismFinishShaderRef = useRef<ShaderMaterial>(null);
  const edgeRef = useRef<ShaderMaterial>(null);
  const edgeMeshRef = useRef<Mesh>(null);
  const impactFlashRef = useRef<MeshBasicMaterial>(null);
  const impactGlowRef = useRef<MeshBasicMaterial>(null);
  const impactParticleRefs = useRef<(Group | null)[]>([]);
  const introRef = useRef(0);
  const stackEntryRef = useRef(0);
  const impactRef = useRef({
    active: false,
    progress: 1,
    duration: 1.2,
  });
  const textures = useCardTextures(card);
  const stackBackTexture = useStackCardBackTexture();
  const meta = rarityMeta[card.rarity];
  const finish = finishMeta[card.finish];
  const tuning = holoTuning[card.rarity];
  const viewerLighting = useMemo(
    () => createViewerLightingPalette(card.rarity, meta.hue, meta.accent),
    [card.rarity, meta.accent, meta.hue],
  );
  const highlightPalette = useMemo(
    () => createViewerHighlightPalette(card.rarity, meta.hue, meta.accent),
    [card.rarity, meta.accent, meta.hue],
  );
  const glossiness = MathUtils.clamp(getLayerValue(card, 'spot_gloss', 'shimmer'), 0, 1);
  const sugarIntensity = getLayerValue(card, 'texture_sugar', 'shimmer');
  const sugarLayerWeights = useMemo(() => new Vector3(1, 0, 0), []);
  const sparkleLayerWeights = useMemo(() => new Vector3(0, 1, 0), []);
  const prismLayerWeights = useMemo(() => new Vector3(0, 0, 1), []);
  const sugarReliefWeights = useMemo(() => new Vector2(1, 0), []);
  const sparkleReliefWeights = useMemo(() => new Vector2(0, 0), []);
  const prismReliefWeights = useMemo(() => new Vector2(0, 1), []);
  const surfaceNormalScale = useMemo(() => new Vector2(0.16, 0.16), []);
  const surfaceClearcoatScale = useMemo(() => new Vector2(0.24, 0.24), []);
  const isStackPreset = effectsPreset === 'stack';
  const showDecorativeEffects = false;
  const showPostProcessing = effectsPreset === 'full';
  const showFrontTreatments = !isStackPreset;
  const enableEdgeHighlight = !isStackPreset;
  const canRenderActiveCard = !renderStackOnly && Boolean(textures);
  const impactSplashRarity = useMemo(() => getImpactSplashRarity(card.rarity), [card.rarity]);
  const impactParticleConfigs = useMemo(
    () => (impactSplashRarity ? createImpactParticleConfigs(impactSplashRarity) : []),
    [impactSplashRarity],
  );
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

  useLayoutEffect(() => {
    if (activeGroupRef.current) {
      activeGroupRef.current.rotation.y = flipTargetRef.current;
    }
  }, [introKey, flipTargetRef]);

  useEffect(() => {
    introRef.current = skipIntroAnimation ? 1 : 0;
  }, [introKey, skipIntroAnimation]);

  useEffect(() => {
    if (textures) {
      textures.front.needsUpdate = true;
      textures.back.needsUpdate = true;
      textures.foil.needsUpdate = true;
      textures.foilZone.needsUpdate = true;
      textures.glossMask.needsUpdate = true;
      textures.embossMap.needsUpdate = true;
      textures.surfaceNormalMap.needsUpdate = true;
      textures.sugarMask.needsUpdate = true;
      textures.sparkleMask.needsUpdate = true;
      textures.prismMask.needsUpdate = true;
      textures.holoTreatmentMap.needsUpdate = true;
      textures.foil.center.set(0.5, 0.5);
      textures.foil.repeat.set(1.04, 1.04);
    }
  }, [introKey, textures]);

  useEffect(() => {
    stackEntryRef.current = enterFromStackAnimation ? 1 : 0;
  }, [enterFromStackAnimation, introKey]);

  useEffect(() => {
    if (!textures) {
      return;
    }

    if (shaderRef.current?.uniforms) {
      shaderRef.current.uniforms.uMaskMap.value = textures.foil;
      shaderRef.current.uniforms.uZoneMap.value = textures.foilZone;
      shaderRef.current.uniforms.uTreatmentMap.value = textures.holoTreatmentMap;
      shaderRef.current.uniforms.uPrismMap.value = textures.prismMask;
      shaderRef.current.uniforms.uAccent.value.set(meta.accent);
      shaderRef.current.uniforms.uHue.value.set(meta.hue);
      shaderRef.current.uniformsNeedUpdate = true;
      shaderRef.current.needsUpdate = true;
    }

    if (glossShaderRef.current?.uniforms) {
      glossShaderRef.current.uniforms.uGlossMap.value = textures.glossMask;
      glossShaderRef.current.uniforms.uGlareColor.value.copy(highlightPalette.glare);
      glossShaderRef.current.uniforms.uGlossiness.value = glossiness;
      glossShaderRef.current.uniformsNeedUpdate = true;
      glossShaderRef.current.needsUpdate = true;
    }

    [sugarFinishShaderRef.current, sparkleFinishShaderRef.current, prismFinishShaderRef.current]
      .filter((material): material is ShaderMaterial => Boolean(material?.uniforms))
      .forEach((material) => {
        material.uniforms.uSugarMap.value = textures.sugarMask;
        material.uniforms.uSparkleMap.value = textures.sparkleMask;
        material.uniforms.uPrismMap.value = textures.prismMask;
        material.uniforms.uAccent.value.set(meta.accent);
        material.uniforms.uHue.value.set(meta.hue);
        material.uniforms.uSugarIntensity.value = sugarIntensity;
        material.uniformsNeedUpdate = true;
        material.needsUpdate = true;
      });
  }, [glossiness, highlightPalette.glare, meta.accent, meta.hue, sugarIntensity, textures]);

  useEffect(() => () => faceGeometry.dispose(), [faceGeometry]);
  useEffect(() => () => edgeGeometry.dispose(), [edgeGeometry]);
  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);

  useEffect(() => {
    if (!revealImpactRarity) {
      return;
    }

    impactRef.current = {
      active: true,
      progress: 0,
      duration: Math.max(revealImpactDurationMs / 1000, 0.9),
    };
  }, [introKey, revealImpactDurationMs, revealImpactRarity]);

  useFrame((state, delta) => {
    if (!outerGroupRef.current || !activeGroupRef.current || !activeHoverGroupRef.current) {
      return;
    }

    pointer.x = MathUtils.damp(pointer.x, pointerTarget.x, 8, delta);
    pointer.y = MathUtils.damp(pointer.y, pointerTarget.y, 8, delta);

    introRef.current = Math.min(introRef.current + delta * 1.6, 1);
    stackEntryRef.current = Math.max(stackEntryRef.current - delta / 0.42, 0);
    const easedIntro = 1 - (1 - introRef.current) * (1 - introRef.current);
    const stackEntryOffset = Math.pow(stackEntryRef.current, 0.86);
    const baseFlip = flipTargetRef.current;
    const dragPreview = dragPreviewRef.current;
    const activeFlipTarget = baseFlip + dragPreview;
    const hoverPointerX = pointer.x * getHoverYawDirection(activeFlipTarget);
    const sharedYawTarget = hoverPointerX * VIEWER_HOVER_TILT_Y;
    const shakeStrength =
      shakeMode === 'veryrare' ? 1.25 : shakeMode === 'epic' ? 1 : shakeMode === 'rare' ? 0.8 : 0;
    const shakeX =
      shakeStrength > 0
        ? Math.sin(state.clock.elapsedTime * (26 + shakeStrength * 4.5)) * 0.026 * shakeStrength
        : 0;
    const shakeY =
      shakeStrength > 0
        ? Math.cos(state.clock.elapsedTime * (23 + shakeStrength * 4)) * 0.018 * shakeStrength
        : 0;
    const shakeRoll =
      shakeStrength > 0
        ? Math.sin(state.clock.elapsedTime * (28 + shakeStrength * 5.5)) * 0.024 * shakeStrength
        : 0;

    outerGroupRef.current.position.x = MathUtils.damp(
      outerGroupRef.current.position.x,
      shakeX,
      14,
      delta,
    );
    outerGroupRef.current.position.y = MathUtils.damp(
      outerGroupRef.current.position.y,
      0.1 - (1 - easedIntro) * 1.25 + shakeY - stackEntryOffset * 0.42 + launchExitProgress * 8.8,
      4,
      delta,
    );
    outerGroupRef.current.position.z = MathUtils.damp(
      outerGroupRef.current.position.z,
      0.04 + easedIntro * 0.08 - stackEntryOffset * 0.12,
      4,
      delta,
    );
    outerGroupRef.current.rotation.x = MathUtils.damp(
      outerGroupRef.current.rotation.x,
      -pointer.y * VIEWER_HOVER_TILT_X + VIEWER_BASE_TILT_X,
      4,
      delta,
    );
    outerGroupRef.current.rotation.z = MathUtils.damp(
      outerGroupRef.current.rotation.z,
      isStackPreset
        ? shakeRoll
        : Math.sin(state.clock.elapsedTime * VIEWER_IDLE_ROLL_SPEED) * VIEWER_IDLE_ROLL_AMPLITUDE + shakeRoll,
      2.8,
      delta,
    );
    outerGroupRef.current.scale.setScalar((0.82 + easedIntro * 0.18) * scaleMultiplier);

    activeGroupRef.current.rotation.y = MathUtils.damp(
      activeGroupRef.current.rotation.y,
      activeFlipTarget,
      5,
      delta,
    );

    const flipMotion = Math.abs(Math.sin(activeGroupRef.current.rotation.y));
    const stackYawTarget =
      stackBackCount > 0 ? (flipMotion > 0.08 ? 0 : sharedYawTarget * 0.16) : 0;

    if (stackGroupRef.current) {
      stackGroupRef.current.position.z = MathUtils.damp(
        stackGroupRef.current.position.z,
        stackBackCount > 0 ? -0.36 - flipMotion * 0.48 : 0,
        5.2,
        delta,
      );
      stackGroupRef.current.position.y = MathUtils.damp(
        stackGroupRef.current.position.y,
        stackBackCount > 0 ? -flipMotion * 0.06 : 0,
        5.2,
        delta,
      );
      stackGroupRef.current.rotation.y = MathUtils.damp(
        stackGroupRef.current.rotation.y,
        stackYawTarget,
        4.8,
        delta,
      );
    }

    const flipDepthLift = 0.28 + flipMotion * 0.92;
    const flipVerticalLift = flipMotion * 0.22 + activeLiftProgress * 2.6;
    activeHoverGroupRef.current.position.z = MathUtils.damp(
      activeHoverGroupRef.current.position.z,
      flipDepthLift,
      5.2,
      delta,
    );
    activeHoverGroupRef.current.position.y = MathUtils.damp(
      activeHoverGroupRef.current.position.y,
      flipVerticalLift,
      5.2,
      delta,
    );
    activeHoverGroupRef.current.rotation.y = MathUtils.damp(
      activeHoverGroupRef.current.rotation.y,
      sharedYawTarget,
      5,
      delta,
    );

    const totalYaw = activeHoverGroupRef.current.rotation.y + activeGroupRef.current.rotation.y;
    const yawTilt = Math.sin(totalYaw);
    const edgeTilt = Math.min(
      1,
      Math.abs(outerGroupRef.current.rotation.x) * 2.6 +
        Math.abs(yawTilt) * 1.45 +
        Math.abs(hoverPointerX) * 0.35,
    );
    const edgeTiltDirection = new Vector2(
      yawTilt + hoverPointerX * 0.35,
      -outerGroupRef.current.rotation.x + pointer.y * 0.12,
    );

    if (showDecorativeEffects && ringRef.current) {
      ringRef.current.rotation.z += delta * (0.24 + finish.shimmerBoost * 0.18);
      ringRef.current.scale.setScalar(1.08 + Math.sin(state.clock.elapsedTime * 1.8) * 0.018);

      const ringMaterial = ringRef.current.material as MeshBasicMaterial;
      ringMaterial.opacity = 0.26 + Math.sin(state.clock.elapsedTime * 1.8) * 0.04;
    }

    if (textures && showFrontTreatments) {
      textures.foil.offset.x =
        0.02 + Math.sin(state.clock.elapsedTime * (0.4 + finish.shimmerBoost * 0.22)) * 0.035;
      textures.foil.offset.y =
        0.02 + Math.cos(state.clock.elapsedTime * (0.26 + finish.shimmerBoost * 0.18)) * 0.035;
      textures.foil.rotation =
        state.clock.elapsedTime * (0.035 + finish.shimmerBoost * 0.025) + hoverPointerX * 0.06;
    }

    if (showDecorativeEffects && haloRef.current) {
      haloRef.current.position.z = -0.16 + Math.sin(state.clock.elapsedTime * 1.4) * 0.008;
      const haloMaterial = haloRef.current.material as MeshBasicMaterial;
      haloMaterial.opacity = MathUtils.damp(
        haloMaterial.opacity,
        0.06 + finish.shimmerBoost * 0.04 + Math.abs(hoverPointerX) * 0.02,
        4,
        delta,
      );
    }

    if (shaderRef.current?.uniforms) {
      shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      shaderRef.current.uniforms.uPointer.value.copy(pointer);
      shaderRef.current.uniforms.uStrength.value = tuning.strength + finish.shimmerBoost * 0.08;
      shaderRef.current.uniforms.uDensity.value = tuning.density;
      shaderRef.current.uniforms.uGlint.value = tuning.glint + finish.shimmerBoost * 0.12;
      shaderRef.current.uniforms.uFresnelPower.value = tuning.fresnelPower;
    }

    if (glossShaderRef.current?.uniforms) {
      glossShaderRef.current.uniforms.uPointer.value.copy(pointer);
    }

    [sugarFinishShaderRef.current, sparkleFinishShaderRef.current, prismFinishShaderRef.current]
      .filter((material): material is ShaderMaterial => Boolean(material?.uniforms))
      .forEach((material) => {
        material.uniforms.uTime.value = state.clock.elapsedTime;
        material.uniforms.uSugarIntensity.value = sugarIntensity;
      });

    const frontFacing = Math.cos(totalYaw) >= 0;

    if (enableEdgeHighlight && edgeRef.current?.uniforms) {
      edgeRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      edgeRef.current.uniforms.uTilt.value = edgeTilt;
      edgeRef.current.uniforms.uTiltDirection.value.copy(edgeTiltDirection);
      edgeRef.current.uniforms.uTint.value.copy(
        frontFacing ? highlightPalette.edgeFront : highlightPalette.edgeBack,
      );
    }

    if (enableEdgeHighlight && edgeMeshRef.current) {
      edgeMeshRef.current.position.z = frontFacing ? faceOffset + 0.0038 : -faceOffset - 0.0038;
      edgeMeshRef.current.rotation.y = frontFacing ? 0 : Math.PI;
    }

    if (impactFlashRef.current && impactGlowRef.current) {
      if (impactRef.current.active) {
        impactRef.current.progress = Math.min(
          impactRef.current.progress + delta / impactRef.current.duration,
          1,
        );

        if (impactRef.current.progress >= 1) {
          impactRef.current.active = false;
        }
      }

      const progress = impactRef.current.active ? impactRef.current.progress : 1;
      const splashProfile = impactSplashRarity ? impactSplashProfiles[impactSplashRarity] : null;
      const fillFadeStart = splashProfile
        ? Math.min(splashProfile.delaySpread + splashProfile.burstWindow, 0.82)
        : 0.28;
      const fillFadeEnd = Math.min(fillFadeStart + 0.18, 0.96);
      const fillOpacity =
        impactRef.current.active
          ? progress < 0.08
            ? MathUtils.smoothstep(progress, 0, 0.08)
            : progress < fillFadeStart
              ? 1
              : progress < fillFadeEnd
                ? 1 - MathUtils.smoothstep(progress, fillFadeStart, fillFadeEnd)
                : 0
          : 0;

      impactFlashRef.current.opacity = fillOpacity;
      impactGlowRef.current.opacity = 0;
      impactFlashRef.current.color.set(meta.hue);
      impactGlowRef.current.color.set(meta.hue);

      impactParticleRefs.current.forEach((particleRef, index) => {
        const config = impactParticleConfigs[index];

        if (!particleRef || !config || !splashProfile || !impactRef.current.active) {
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
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * 0.58 + config.yLift * travelProgress;

        particleRef.visible = burst > 0.001;
        particleRef.position.set(x, y, faceOffset + 0.048 + config.depth);
        particleRef.rotation.z = config.spin * travelProgress;
        particleRef.scale.setScalar(config.size * (0.14 + burst * 1.28));
      });
    }
  });

  function handleHoverMove(event: ThreeEvent<PointerEvent>) {
    if (!activeGroupRef.current) {
      return;
    }

    event.stopPropagation();
    const localPoint = activeGroupRef.current.worldToLocal(event.point.clone());
    pointerTarget.set(
      MathUtils.clamp(localPoint.x / (CARD_HOVER_PLANE_WIDTH * 0.5), -1, 1),
      MathUtils.clamp(localPoint.y / (CARD_HOVER_PLANE_HEIGHT * 0.5), -1, 1),
    );
  }

  function resetHover(event?: ThreeEvent<PointerEvent>) {
    event?.stopPropagation();
    pointerTarget.set(0, 0);
  }

  if (!textures && !renderStackOnly) {
    return null;
  }

  return (
    <>
      <SharedViewerLighting
        accentColor={viewerLighting.accentColor}
        accentIntensity={viewerLighting.accentIntensity}
        ambientColor={viewerLighting.ambientColor}
        ambientIntensity={viewerLighting.ambientIntensity}
        fillColor={viewerLighting.fillColor}
        fillIntensity={viewerLighting.fillIntensity}
        hemisphereColor={viewerLighting.hemisphereColor}
        hemisphereGroundColor={viewerLighting.hemisphereGroundColor}
        hemisphereIntensity={viewerLighting.hemisphereIntensity}
        keyColor={viewerLighting.keyColor}
        keyIntensity={viewerLighting.keyIntensity}
        rimColor={viewerLighting.rimColor}
        rimIntensity={viewerLighting.rimIntensity}
      />

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

      <Float
        speed={isStackPreset ? 0 : 1.35}
        rotationIntensity={isStackPreset ? 0 : 0.06}
        floatIntensity={isStackPreset ? 0 : 0.18}
      >
        <group ref={outerGroupRef}>
          {stackBackCount > 0 ? (
            <group ref={stackGroupRef}>
              {Array.from({ length: stackBackCount }, (_, index) => {
                const stackIndex = stackBackCount - index;
                return (
                  <group
                    key={`stack-back-${stackIndex}`}
                    position={[stackIndex * 0.18, -stackIndex * 0.14, -stackIndex * 0.06]}
                    rotation={[0, 0, stackIndex * 0.01]}
                  >
                    <mesh>
                      <primitive attach="geometry" object={bodyGeometry} />
                      <meshPhysicalMaterial
                        color="#090b0f"
                        metalness={0.16}
                        roughness={0.74}
                        clearcoat={0.18}
                        clearcoatRoughness={0.26}
                        reflectivity={0.08}
                        iridescence={0}
                      />
                    </mesh>

                    <mesh position={[0, 0, faceOffset]}>
                      <primitive attach="geometry" object={faceGeometry} />
                      <meshPhysicalMaterial
                        map={stackBackTexture}
                        metalness={0.04}
                        roughness={0.96}
                        clearcoat={0}
                        reflectivity={0.04}
                        color="#ffffff"
                        side={DoubleSide}
                      />
                    </mesh>
                  </group>
                );
              })}
            </group>
          ) : null}

          <group ref={activeHoverGroupRef}>
            <group ref={activeGroupRef} visible={canRenderActiveCard}>
              {canRenderActiveCard && textures ? (
                <>
              <mesh
                position={[0, 0, faceOffset + 0.06]}
                onPointerMove={handleHoverMove}
                onPointerOut={resetHover}
                onPointerOver={handleHoverMove}
              >
                <planeGeometry args={[CARD_HOVER_PLANE_WIDTH, CARD_HOVER_PLANE_HEIGHT]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
              </mesh>

              <mesh>
                <primitive attach="geometry" object={bodyGeometry} />
                <meshPhysicalMaterial
                  color="#090b0f"
                  metalness={0.22}
                  roughness={0.58}
                  clearcoat={0.8}
                  clearcoatRoughness={0.18}
                  reflectivity={0.18}
                  iridescence={0.02 + finish.shimmerBoost * 0.03}
                  iridescenceIOR={1.08}
                />
              </mesh>

              {enableEdgeHighlight ? (
                <mesh
                  ref={edgeMeshRef}
                  position={[0, 0, faceOffset + 0.0038]}
                  scale={[1.0045, 1.0045, 1]}
                >
                  <primitive attach="geometry" object={edgeGeometry} />
                  <shaderMaterial
                    ref={edgeRef}
                    transparent
                    depthWrite={false}
                    blending={AdditiveBlending}
                    toneMapped={false}
                    uniforms={{
                      uTint: { value: highlightPalette.edgeFront.clone() },
                      uTime: { value: 0 },
                      uTilt: { value: 0 },
                      uTiltDirection: { value: new Vector2(0, 0) },
                    }}
                    vertexShader={edgeHighlightVertexShader}
                    fragmentShader={edgeHighlightFragmentShader}
                  />
                </mesh>
              ) : null}

              {showFrontTreatments ? (
                <>
                  <mesh position={[0, 0, faceOffset + 0.0204]} scale={[1.004, 1.004, 1]}>
                    <primitive attach="geometry" object={faceGeometry} />
                    <meshBasicMaterial
                      ref={impactGlowRef}
                      color={new Color(meta.hue)}
                      transparent
                      opacity={0}
                      depthTest={false}
                      depthWrite={false}
                      toneMapped={false}
                    />
                  </mesh>

                  <mesh position={[0, 0, faceOffset + 0.0212]} scale={[1.001, 1.001, 1]}>
                    <primitive attach="geometry" object={faceGeometry} />
                    <meshBasicMaterial
                      ref={impactFlashRef}
                      color={new Color(meta.hue)}
                      transparent
                      opacity={0}
                      depthTest={false}
                      depthWrite={false}
                      toneMapped={false}
                    />
                  </mesh>

                  {impactParticleConfigs.length > 0 ? (
                    <group position={[0, 0, faceOffset + 0.052]}>
                      {impactParticleConfigs.map((particle, index) => (
                        <group
                          key={`impact-particle-${index}`}
                          ref={(node) => {
                            impactParticleRefs.current[index] = node;
                          }}
                          visible={false}
                        >
                          <mesh rotation={[0, 0, particle.angle]} scale={[particle.stretch, 0.18, 1]}>
                            <planeGeometry args={[1, 1]} />
                            <meshBasicMaterial
                              color={new Color(meta.hue)}
                              depthTest={false}
                              depthWrite={false}
                              toneMapped={false}
                            />
                          </mesh>

                          <mesh rotation={[0, 0, particle.angle + Math.PI * 0.25]} scale={[0.32, 0.32, 1]}>
                            <planeGeometry args={[1, 1]} />
                            <meshBasicMaterial
                              color={new Color(meta.hue)}
                              depthTest={false}
                              depthWrite={false}
                              toneMapped={false}
                            />
                          </mesh>

                          {particle.secondary ? (
                            <mesh
                              rotation={[0, 0, particle.angle + Math.PI * 0.5]}
                              scale={[particle.stretch * 0.64, 0.12, 1]}
                            >
                              <planeGeometry args={[1, 1]} />
                              <meshBasicMaterial
                                color={new Color(meta.hue)}
                                depthTest={false}
                                depthWrite={false}
                                toneMapped={false}
                              />
                            </mesh>
                          ) : null}
                        </group>
                      ))}
                    </group>
                  ) : null}

                  <mesh position={[0, 0, faceOffset]}>
                    <primitive attach="geometry" object={faceGeometry} />
                    <meshPhysicalMaterial
                      map={textures.front}
                      metalness={0.08}
                      roughness={0.84}
                      clearcoat={0.1}
                      clearcoatRoughness={0.28}
                      reflectivity={0.07}
                      normalMap={textures.surfaceNormalMap}
                      normalScale={surfaceNormalScale}
                      clearcoatNormalMap={textures.surfaceNormalMap}
                      clearcoatNormalScale={surfaceClearcoatScale}
                    />
                  </mesh>

                  <mesh position={[0, 0, faceOffset + 0.0048]} scale={[1.001, 1.001, 1]}>
                    <primitive attach="geometry" object={faceGeometry} />
                    <shaderMaterial
                      ref={glossShaderRef}
                      transparent
                      depthWrite={false}
                      blending={AdditiveBlending}
                      toneMapped={false}
                      uniforms={{
                        uGlossMap: { value: textures.glossMask },
                        uKeyLightPos: { value: VIEWER_LIGHTS.key.clone() },
                        uFillLightPos: { value: VIEWER_LIGHTS.fill.clone() },
                        uAccentLightPos: { value: VIEWER_LIGHTS.accent.clone() },
                        uGlareColor: { value: highlightPalette.glare.clone() },
                        uGlossiness: { value: glossiness },
                        uPointer: { value: new Vector2(0, 0) },
                      }}
                      vertexShader={cardSurfaceVertexShader}
                      fragmentShader={glossFragmentShader}
                    />
                  </mesh>

                  <mesh position={[0, 0, faceOffset + 0.0092]} scale={[1.0018, 1.0018, 1]}>
                    <primitive attach="geometry" object={faceGeometry} />
                    <shaderMaterial
                      ref={sugarFinishShaderRef}
                      transparent
                      depthWrite={false}
                      blending={AdditiveBlending}
                      toneMapped={false}
                      uniforms={{
                        uSugarMap: { value: textures.sugarMask },
                        uSparkleMap: { value: textures.sparkleMask },
                        uPrismMap: { value: textures.prismMask },
                        uLayerWeights: { value: sugarLayerWeights },
                        uSurfaceReliefWeights: { value: sugarReliefWeights },
                        uAccent: { value: new Color(meta.accent) },
                        uHue: { value: new Color(meta.hue) },
                        uKeyLightPos: { value: VIEWER_LIGHTS.key.clone() },
                        uFillLightPos: { value: VIEWER_LIGHTS.fill.clone() },
                        uAccentLightPos: { value: VIEWER_LIGHTS.accent.clone() },
                        uSugarIntensity: { value: sugarIntensity },
                        uTime: { value: 0 },
                      }}
                      vertexShader={cardSurfaceVertexShader}
                      fragmentShader={finishTreatmentFragmentShader}
                    />
                  </mesh>

                  <mesh position={[0, 0, faceOffset + 0.0096]} scale={[1.0018, 1.0018, 1]}>
                    <primitive attach="geometry" object={faceGeometry} />
                    <shaderMaterial
                      ref={sparkleFinishShaderRef}
                      transparent
                      depthWrite={false}
                      blending={AdditiveBlending}
                      toneMapped={false}
                      uniforms={{
                        uSugarMap: { value: textures.sugarMask },
                        uSparkleMap: { value: textures.sparkleMask },
                        uPrismMap: { value: textures.prismMask },
                        uLayerWeights: { value: sparkleLayerWeights },
                        uSurfaceReliefWeights: { value: sparkleReliefWeights },
                        uAccent: { value: new Color(meta.accent) },
                        uHue: { value: new Color(meta.hue) },
                        uKeyLightPos: { value: VIEWER_LIGHTS.key.clone() },
                        uFillLightPos: { value: VIEWER_LIGHTS.fill.clone() },
                        uAccentLightPos: { value: VIEWER_LIGHTS.accent.clone() },
                        uSugarIntensity: { value: sugarIntensity },
                        uTime: { value: 0 },
                      }}
                      vertexShader={cardSurfaceVertexShader}
                      fragmentShader={finishTreatmentFragmentShader}
                    />
                  </mesh>

                  <mesh position={[0, 0, faceOffset + 0.01]} scale={[1.0018, 1.0018, 1]}>
                    <primitive attach="geometry" object={faceGeometry} />
                    <shaderMaterial
                      ref={prismFinishShaderRef}
                      transparent
                      depthWrite={false}
                      blending={AdditiveBlending}
                      toneMapped={false}
                      uniforms={{
                        uSugarMap: { value: textures.sugarMask },
                        uSparkleMap: { value: textures.sparkleMask },
                        uPrismMap: { value: textures.prismMask },
                        uLayerWeights: { value: prismLayerWeights },
                        uSurfaceReliefWeights: { value: prismReliefWeights },
                        uAccent: { value: new Color(meta.accent) },
                        uHue: { value: new Color(meta.hue) },
                        uKeyLightPos: { value: VIEWER_LIGHTS.key.clone() },
                        uFillLightPos: { value: VIEWER_LIGHTS.fill.clone() },
                        uAccentLightPos: { value: VIEWER_LIGHTS.accent.clone() },
                        uSugarIntensity: { value: sugarIntensity },
                        uTime: { value: 0 },
                      }}
                      vertexShader={cardSurfaceVertexShader}
                      fragmentShader={finishTreatmentFragmentShader}
                    />
                  </mesh>
                </>
              ) : null}

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

              {showFrontTreatments ? (
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
                      uTreatmentMap: { value: textures.holoTreatmentMap },
                      uPrismMap: { value: textures.prismMask },
                      uAccent: { value: new Color(meta.accent) },
                      uHue: { value: new Color(meta.hue) },
                      uKeyLightPos: { value: VIEWER_LIGHTS.key.clone() },
                      uFillLightPos: { value: VIEWER_LIGHTS.fill.clone() },
                      uAccentLightPos: { value: VIEWER_LIGHTS.accent.clone() },
                      uStrength: { value: tuning.strength + finish.shimmerBoost * 0.08 },
                      uDensity: { value: tuning.density },
                      uGlint: { value: tuning.glint + finish.shimmerBoost * 0.12 },
                      uFresnelPower: { value: tuning.fresnelPower },
                      uPointer: { value: new Vector2(0, 0) },
                    }}
                    vertexShader={cardSurfaceVertexShader}
                    fragmentShader={holoFragmentShader}
                  />
                </mesh>
              ) : null}

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
                </>
              ) : null}
            </group>
          </group>
        </group>
      </Float>

      {showDecorativeEffects ? (
        <Sparkles
          count={card.rarity === 'veryrare' ? 54 : card.rarity === 'epic' ? 40 : 24}
          scale={[5.4, 5.4, 3.2]}
          size={card.rarity === 'common' ? 1.8 : 2.6}
          speed={0.26 + finish.shimmerBoost * 0.2}
          color={meta.accent}
        />
      ) : null}

      {showPostProcessing ? (
        <SharedViewerPostProcessing />
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
  stackBackCount = 0,
  activeLiftProgress = 0,
  effectsPreset = 'full',
  renderStackOnly = false,
  enterFromStackAnimation = false,
  launchExitProgress = 0,
  initialSide = 'front',
  forcedSide = null,
  interactive = true,
  shakeMode = 'none',
  revealImpactRarity = null,
  revealImpactDurationMs = 0,
  skipIntroAnimation = false,
  onUserFlip,
}: {
  card: OwnedCard;
  introKey: string;
  cameraZ?: number;
  scaleMultiplier?: number;
  stackBackCount?: number;
  activeLiftProgress?: number;
  effectsPreset?: ViewerEffectsPreset;
  renderStackOnly?: boolean;
  enterFromStackAnimation?: boolean;
  launchExitProgress?: number;
  initialSide?: CardSide;
  forcedSide?: CardSide | null;
  interactive?: boolean;
  shakeMode?: ViewerShakeMode;
  revealImpactRarity?: ViewerImpactRarity | null;
  revealImpactDurationMs?: number;
  skipIntroAnimation?: boolean;
  onUserFlip?: (side: CardSide) => void;
}) {
  const resolvedInitialSide = forcedSide ?? initialSide;
  const suppressClickRef = useRef(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const flipTargetRef = useRef(resolvedInitialSide === 'back' ? Math.PI : 0);
  const sideRef = useRef<CardSide>(resolvedInitialSide);
  const dragRef = useRef(initialDrag);
  const dragPreviewRef = useRef(0);
  const mousePressRef = useRef(initialPointerPress);
  const dragPointerRef = useRef<{ pointerType: string | null; pointerId: number | null }>({
    pointerType: null,
    pointerId: null,
  });
  const pointer = useMemo(() => new Vector2(0, 0), []);
  const pointerTarget = useMemo(() => new Vector2(0, 0), []);

  const applySide = (nextSide: CardSide, targetRotation = nextSide === 'back' ? Math.PI : 0) => {
    sideRef.current = nextSide;
    flipTargetRef.current = targetRotation;
  };

  const getNearestSideRotation = (nextSide: CardSide, aroundRotation: number) => {
    const sideBaseRotation = nextSide === 'back' ? Math.PI : 0;
    const turns = Math.round((aroundRotation - sideBaseRotation) / (Math.PI * 2));
    return sideBaseRotation + turns * Math.PI * 2;
  };

  const flipInDragDirection = (deltaX: number) => {
    const nextSide = sideRef.current === 'front' ? 'back' : 'front';
    const rotationStep = deltaX > 0 ? Math.PI : -Math.PI;
    applySide(nextSide, flipTargetRef.current + rotationStep);
    onUserFlip?.(nextSide);
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
    pointerTarget.set(0, 0);
    resetMousePress();
    resetDragPointer();
    dragRef.current = initialDrag;
    dragPreviewRef.current = 0;
    applySide(initialSide);
  }, [initialSide, introKey, pointer, pointerTarget]);

  useEffect(() => {
    if (!interactive) {
      pointer.set(0, 0);
      pointerTarget.set(0, 0);
    }
  }, [interactive, pointer, pointerTarget]);

  useEffect(() => {
    if (!forcedSide) {
      return;
    }

    applySide(forcedSide, getNearestSideRotation(forcedSide, flipTargetRef.current));
  }, [forcedSide]);

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
      pointerTarget.set(0, 0);
      return;
    }
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
  }, [pointerTarget]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactive) {
      return;
    }

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
    if (!interactive) {
      return;
    }

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
    if (!interactive) {
      return;
    }

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
    if (!interactive) {
      return;
    }

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
        if (interactive && !dragRef.current.active && !mousePressRef.current.active) {
          pointerTarget.set(0, 0);
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ pointerEvents: interactive ? 'auto' : 'none', touchAction: interactive ? 'pan-y' : 'none' }}
    >
      <Canvas
        camera={{ position: [0, 0, cameraZ], fov: VIEWER_CANVAS_FOV }}
        dpr={effectsPreset === 'stack' ? 1 : VIEWER_CANVAS_DPR}
      >
        <MemoCardRig
          card={card}
          introKey={introKey}
          scaleMultiplier={scaleMultiplier}
          stackBackCount={stackBackCount}
          activeLiftProgress={activeLiftProgress}
          effectsPreset={effectsPreset}
          renderStackOnly={renderStackOnly}
          enterFromStackAnimation={enterFromStackAnimation}
          launchExitProgress={launchExitProgress}
          shakeMode={shakeMode}
          revealImpactRarity={revealImpactRarity}
          revealImpactDurationMs={revealImpactDurationMs}
          skipIntroAnimation={skipIntroAnimation}
          flipTargetRef={flipTargetRef}
          dragPreviewRef={dragPreviewRef}
          pointer={pointer}
          pointerTarget={pointerTarget}
        />
      </Canvas>
    </div>
  );
}
