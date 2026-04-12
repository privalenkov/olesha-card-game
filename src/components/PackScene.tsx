import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, type ThreeEvent, useFrame, useLoader } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import {
  AdditiveBlending,
  Bone,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NoColorSpace,
  SRGBColorSpace,
  SkinnedMesh,
  Texture,
  TextureLoader,
  Vector3,
} from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rarityMeta } from '../game/config';
import type { OwnedCard } from '../game/types';
import packFlapModelUrl from '../assets/mesh/pack-flap.fbx?url';
import packBaseTextureUrl from '../assets/mesh/texture.png?url';
import packMetallicMaskUrl from '../assets/mesh/metalic.png?url';
import packRoughnessMapUrl from '../assets/mesh/roughness.png?url';
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
const PACK_ACCENT_LIGHT = '#a44a1f';
const CAROUSEL_TO_TEAR_SETTLE_DISTANCE = 0.06;
const CAROUSEL_TO_TEAR_SETTLE_SCALE_EPSILON = 0.015;
const CAROUSEL_TO_TEAR_INACTIVE_DEPTH_OFFSET = 0.92;
const CAROUSEL_TO_TEAR_INACTIVE_SCALE_FACTOR = 0.95;
const TEAR_STAGE_DOCK_OFFSET_Y = -2.45;
const TEAR_STAGE_WORLD_Y = TEAR_STAGE_DOCK_OFFSET_Y + 0.02;
const PACK_MODEL_MATERIAL = {
  color: '#e4edf2',
  metalness: 0.08,
  clearcoat: 0.42,
  clearcoatRoughness: 0.28,
  reflectivity: 0.24,
} as const;

useLoader.preload(FBXLoader, packFlapModelUrl);
useLoader.preload(TextureLoader, packBaseTextureUrl);
useLoader.preload(TextureLoader, packMetallicMaskUrl);
useLoader.preload(TextureLoader, packRoughnessMapUrl);

function getPositionKey(x: number, y: number, z: number, tolerance: number) {
  return [
    Math.round(x / tolerance),
    Math.round(y / tolerance),
    Math.round(z / tolerance),
  ].join(':');
}

function createSmoothedGeometry(sourceGeometry: BufferGeometry) {
  const geometry = sourceGeometry.clone();
  const normalTolerance = 1e-4;
  const smoothingGeometry = geometry.clone();

  Object.keys(smoothingGeometry.attributes).forEach((attributeName) => {
    if (attributeName !== 'position') {
      smoothingGeometry.deleteAttribute(attributeName);
    }
  });

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
}

function usePackTextures() {
  const baseTexture = useLoader(TextureLoader, packBaseTextureUrl);
  const metallicMask = useLoader(TextureLoader, packMetallicMaskUrl);
  const roughnessMap = useLoader(TextureLoader, packRoughnessMapUrl);

  return useMemo(() => {
    baseTexture.colorSpace = SRGBColorSpace;
    metallicMask.colorSpace = NoColorSpace;
    roughnessMap.colorSpace = NoColorSpace;
    baseTexture.needsUpdate = true;
    metallicMask.needsUpdate = true;
    roughnessMap.needsUpdate = true;

    return {
      baseTexture,
      metallicMask,
      roughnessMap,
    };
  }, [baseTexture, metallicMask, roughnessMap]);
}

function createPackSurfaceMaterial(
  baseTexture: Texture,
  metallicMask: Texture,
  roughnessMap: Texture,
  emissiveIntensity: number,
) {
  return new MeshPhysicalMaterial({
    ...PACK_MODEL_MATERIAL,
    color: '#ffffff',
    map: baseTexture,
    metalness: 1,
    metalnessMap: metallicMask,
    roughness: 1,
    roughnessMap,
    clearcoat: 1,
    clearcoatMap: metallicMask,
    clearcoatRoughness: 0.12,
    emissive: '#0d2d3d',
    emissiveIntensity,
    transparent: true,
    opacity: 1,
    side: DoubleSide,
  });
}

function PackStudioLighting() {
  return (
    <>
      <SharedViewerLighting
        accentColor={PACK_ACCENT_LIGHT}
        ambientColor="#f1e6da"
        ambientIntensity={0.34}
        hemisphereColor="#fff7ee"
        hemisphereGroundColor="#101621"
        hemisphereIntensity={0.86}
        keyColor="#fff2df"
        keyIntensity={2.7}
        rimColor="#b9632e"
        rimIntensity={1.18}
        fillColor="#e8c39b"
        fillIntensity={6.8}
        accentIntensity={5.2}
      />
      <directionalLight
        position={[4.2, 5.6, 6.9]}
        intensity={1.65}
        color="#fff6ea"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.00008}
        shadow-normalBias={0.03}
      />
      <directionalLight
        position={[-3.8, 2.6, 7.8]}
        intensity={1.05}
        color="#d49b68"
      />
      <directionalLight
        position={[-2.6, 4.4, -5.8]}
        intensity={0.92}
        color="#8f371d"
      />
      <pointLight
        position={[0.8, -0.6, 5.6]}
        intensity={2.4}
        distance={11}
        decay={2}
        color="#ffedd8"
      />
    </>
  );
}

interface PackFlapRigModel {
  model: Group;
  bones: Bone[];
  rootBone: Bone | null;
  openBone: Bone | null;
  baseRotations: Array<{ x: number; y: number; z: number }>;
  baseRootPosition: { x: number; y: number; z: number } | null;
  baseOpenRotation: { x: number; y: number; z: number } | null;
  materials: MeshPhysicalMaterial[];
  dispose: () => void;
}

interface PackRigMeshes {
  bodyMesh: Mesh | null;
  flapMesh: SkinnedMesh | null;
}

interface SkinAttributeLike {
  getComponent(index: number, component: number): number;
  itemSize: number;
}

type TypedArrayView =
  | Float32Array
  | Uint32Array
  | Uint16Array
  | Uint8Array
  | Int32Array
  | Int16Array
  | Int8Array;

type TypedArrayViewConstructor = {
  new (length: number): TypedArrayView;
};

function getPackRigMeshes(model: Group): PackRigMeshes {
  let bodyMesh: Mesh | null = null;
  let flapMesh: SkinnedMesh | null = null;

  model.traverse((node) => {
    if ((node as SkinnedMesh).isSkinnedMesh && !flapMesh) {
      flapMesh = node as SkinnedMesh;
      return;
    }

    if ((node as Mesh).isMesh && !bodyMesh) {
      bodyMesh = node as Mesh;
    }
  });

  return {
    bodyMesh,
    flapMesh,
  };
}

function vertexUsesNonRootInfluence(
  skinIndex: SkinAttributeLike,
  skinWeight: SkinAttributeLike,
  vertexIndex: number,
) {
  for (let influenceIndex = 0; influenceIndex < skinIndex.itemSize; influenceIndex += 1) {
    if (skinWeight.getComponent(vertexIndex, influenceIndex) > 1e-4) {
      const boneIndex = skinIndex.getComponent(vertexIndex, influenceIndex);

      if (boneIndex !== 0) {
        return true;
      }
    }
  }

  return false;
}

function sliceGeometryTriangles(
  sourceGeometry: BufferGeometry,
  triangleMask: boolean[],
  includeSelectedTriangles: boolean,
) {
  const geometry = new BufferGeometry();
  const includedTriangleCount = triangleMask.reduce(
    (count, isSelected) => count + (isSelected === includeSelectedTriangles ? 1 : 0),
    0,
  );

  Object.entries(sourceGeometry.attributes).forEach(([attributeName, attribute]) => {
    const typedArrayConstructor = attribute.array.constructor as TypedArrayViewConstructor;
    const vertexStride = attribute.itemSize * 3;
    const slicedArray = new typedArrayConstructor(includedTriangleCount * vertexStride);
    let writeOffset = 0;

    for (let triangleIndex = 0; triangleIndex < triangleMask.length; triangleIndex += 1) {
      if (triangleMask[triangleIndex] !== includeSelectedTriangles) {
        continue;
      }

      const readOffset = triangleIndex * vertexStride;

      for (let componentIndex = 0; componentIndex < vertexStride; componentIndex += 1) {
        slicedArray[writeOffset + componentIndex] = attribute.array[readOffset + componentIndex];
      }

      writeOffset += vertexStride;
    }

    geometry.setAttribute(
      attributeName,
      new BufferAttribute(slicedArray, attribute.itemSize, attribute.normalized),
    );
  });

  return geometry;
}

function createPackRigFromWeightedMesh(model: Group) {
  let sourceFlapMesh: SkinnedMesh | null = null;

  model.traverse((node) => {
    if ((node as SkinnedMesh).isSkinnedMesh && !sourceFlapMesh) {
      sourceFlapMesh = node as SkinnedMesh;
    }
  });

  if (!sourceFlapMesh) {
    return null;
  }

  const flapMeshSource = sourceFlapMesh as SkinnedMesh;
  const skinIndex = flapMeshSource.geometry.getAttribute('skinIndex');
  const skinWeight = flapMeshSource.geometry.getAttribute('skinWeight');
  const position = flapMeshSource.geometry.getAttribute('position');

  if (!skinIndex || !skinWeight || !position || position.count % 3 !== 0) {
    return null;
  }

  const triangleMask: boolean[] = [];
  let hasBodyTriangles = false;
  let hasFlapTriangles = false;

  for (let triangleStart = 0; triangleStart < position.count; triangleStart += 3) {
    let triangleUsesNonRootInfluence = false;

    for (let vertexOffset = 0; vertexOffset < 3; vertexOffset += 1) {
      if (vertexUsesNonRootInfluence(skinIndex, skinWeight, triangleStart + vertexOffset)) {
        triangleUsesNonRootInfluence = true;
        break;
      }
    }

    triangleMask.push(triangleUsesNonRootInfluence);
    hasFlapTriangles ||= triangleUsesNonRootInfluence;
    hasBodyTriangles ||= !triangleUsesNonRootInfluence;
  }

  if (!hasBodyTriangles || !hasFlapTriangles) {
    return null;
  }

  const bodyGeometry = sliceGeometryTriangles(flapMeshSource.geometry, triangleMask, false);
  const flapGeometry = sliceGeometryTriangles(flapMeshSource.geometry, triangleMask, true);
  const bodyMesh = new Mesh(
    bodyGeometry,
    Array.isArray(flapMeshSource.material) ? flapMeshSource.material[0] : flapMeshSource.material,
  );

  bodyMesh.name = `${flapMeshSource.name}_body`;
  bodyMesh.position.copy(flapMeshSource.position);
  bodyMesh.quaternion.copy(flapMeshSource.quaternion);
  bodyMesh.scale.copy(flapMeshSource.scale);
  bodyMesh.matrixAutoUpdate = flapMeshSource.matrixAutoUpdate;
  bodyMesh.updateMatrix();

  flapMeshSource.geometry = flapGeometry;

  const parent = flapMeshSource.parent ?? model;
  parent.add(bodyMesh);

  return {
    model,
    bodyMesh,
    flapMesh: flapMeshSource,
  };
}

function usePackFlapRigModel() {
  const packFlapModel = useLoader(FBXLoader, packFlapModelUrl);
  const { baseTexture, metallicMask, roughnessMap } = usePackTextures();

  return useMemo<PackFlapRigModel>(() => {
    const currentModel = cloneSkeleton(packFlapModel) as Group;
    let model = currentModel;
    const root = new Group();
    const size = new Vector3();
    const center = new Vector3();
    const bounds = new Box3();
    let useUnifiedRigMesh = false;

    let { bodyMesh: nextBodyMesh, flapMesh: nextFlapMesh } = getPackRigMeshes(model);

    if (!nextBodyMesh && nextFlapMesh) {
      useUnifiedRigMesh = true;
    } else if (!nextBodyMesh || !nextFlapMesh) {
      const fallbackRig = createPackRigFromWeightedMesh(currentModel);

      if (fallbackRig) {
        model = fallbackRig.model;
        nextBodyMesh = fallbackRig.bodyMesh;
        nextFlapMesh = fallbackRig.flapMesh;
      }
    }

    if ((!useUnifiedRigMesh && !nextBodyMesh) || !nextFlapMesh) {
      throw new Error(
        'Pack flap FBX must contain a body mesh plus rigged flap, or weighted triangles that can be split from a single skinned mesh.',
      );
    }

    const flapMesh = nextFlapMesh as SkinnedMesh;
    const flapGeometry = createSmoothedGeometry(flapMesh.geometry);

    bounds.setFromObject(model);
    bounds.getSize(size);
    bounds.getCenter(center);

    model.scale.set(
      PACK_DEPTH / Math.max(size.x, 0.001),
      PACK_TOTAL_HEIGHT / Math.max(size.y, 0.001),
      PACK_WIDTH / Math.max(size.z, 0.001),
    );
    model.position.set(
      -center.x * model.scale.x,
      -center.y * model.scale.y,
      -center.z * model.scale.z,
    );
    root.rotation.y = Math.PI / 2;
    root.add(model);
    root.updateWorldMatrix(true, true);

    flapMesh.geometry = flapGeometry;

    const bodyMesh = useUnifiedRigMesh ? null : (nextBodyMesh as Mesh);
    let bodyGeometry: BufferGeometry | null = null;
    let bodyMaterial: MeshPhysicalMaterial | null = null;

    if (bodyMesh) {
      bodyGeometry = createSmoothedGeometry(bodyMesh.geometry);
      bodyMesh.geometry = bodyGeometry;
      bodyMaterial = createPackSurfaceMaterial(baseTexture, metallicMask, roughnessMap, 0.03);
      bodyMesh.material = bodyMaterial;
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      bodyMesh.frustumCulled = false;
    }

    const flapMaterial = createPackSurfaceMaterial(
      baseTexture,
      metallicMask,
      roughnessMap,
      useUnifiedRigMesh ? 0.04 : 0.05,
    );
    flapMesh.material = flapMaterial;
    flapMesh.castShadow = true;
    flapMesh.receiveShadow = true;
    flapMesh.frustumCulled = false;

    const rigBones = flapMesh.skeleton.bones.filter((bone: Bone) => !bone.name.endsWith('_end'));
    const rootBone = rigBones[0] ?? null;
    const openBone = rigBones.find((bone: Bone) => bone.name === 'BoneRotate') ?? null;
    const bones = (useUnifiedRigMesh
      ? rigBones.length > 2
        ? rigBones.slice(2)
        : rigBones.length > 1
          ? rigBones.slice(1)
          : rigBones
      : rigBones
    ).filter((bone: Bone) => bone !== openBone);
    const baseRotations = bones.map((bone: Bone) => ({
      x: bone.rotation.x,
      y: bone.rotation.y,
      z: bone.rotation.z,
    }));
    const baseRootPosition = rootBone
      ? {
          x: rootBone.position.x,
          y: rootBone.position.y,
          z: rootBone.position.z,
        }
      : null;
    const baseOpenRotation = openBone
      ? {
          x: openBone.rotation.x,
          y: openBone.rotation.y,
          z: openBone.rotation.z,
        }
      : null;

    return {
      model: root,
      bones,
      rootBone,
      openBone,
      baseRotations,
      baseRootPosition,
      baseOpenRotation,
      materials: bodyMaterial ? [bodyMaterial, flapMaterial] : [flapMaterial],
      dispose: () => {
        bodyGeometry?.dispose();
        flapGeometry.dispose();
        bodyMaterial?.dispose();
        flapMaterial.dispose();
      },
    };
  }, [packFlapModel, baseTexture, metallicMask, roughnessMap]);
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
  const slitRef = useRef<Mesh>(null);
  const hoverTargetRef = useRef({ x: 0, y: 0 });
  const hoverPointerRef = useRef({ x: 0, y: 0 });
  const offsetSettledRef = useRef(false);
  const offsetSnappedRef = useRef(false);
  const offsetSettledCallbackRef = useRef<(() => void) | undefined>(onOffsetSettled);
  const packRigModel = usePackFlapRigModel();
  const useRiggedFlap = !hoverEnabled || phase !== 'sealed' || tearProgress > 0.001;
  const showTearSlit = phase === 'tearing' || tearProgress > 0.001;

  useEffect(() => () => packRigModel.dispose(), [packRigModel]);
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
    if (!groupRef.current || !slitRef.current) {
      return;
    }

    const opened = phase !== 'sealed';
    const peelTarget = opened ? 1 : tearProgress;
    const flapBones = packRigModel.bones;
    const rootBone = packRigModel.rootBone;
    const openBone = packRigModel.openBone;
    const lastBoneIndex = Math.max(flapBones.length - 1, 1);
    const anchorBias = MathUtils.lerp(-1, 1, tearAnchor);

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

    flapBones.forEach((bone, index) => {
      const baseRotation = packRigModel.baseRotations[index];
      const normalizedIndex = lastBoneIndex === 0 ? 1 : index / lastBoneIndex;
      const activePeelTarget = useRiggedFlap
        ? MathUtils.smootherstep(peelTarget, 0.01, 0.96) * (opened ? 1.82 : 1.68)
        : 0;
      const rightEdgeWeight = MathUtils.lerp(0.32, 1, Math.pow(1 - normalizedIndex, 1.05));
      const sweepFade = MathUtils.lerp(0.26, 1, Math.pow(1 - normalizedIndex, 1.45));
      const cornerBias = MathUtils.lerp(0.24, 1, Math.pow(1 - normalizedIndex, 1.18));
      const startFromRight = anchorBias >= 0 ? -1 : 1;
      const anchorBoost =
        anchorBias >= 0 ? 1.02 + anchorBias * 0.42 : 0.94 + Math.abs(anchorBias) * 0.12;
      const cameraFoldX = activePeelTarget * anchorBoost * (0.02 + rightEdgeWeight * 0.11);
      const cornerDiveX = activePeelTarget * anchorBoost * (0.008 + cornerBias * 0.05);
      const leftSweepY =
        activePeelTarget *
        startFromRight *
        anchorBoost *
        sweepFade *
        (0.22 + rightEdgeWeight * 0.94);
      const leftSweepZ =
        activePeelTarget *
        startFromRight *
        anchorBoost *
        sweepFade *
        (0.16 + rightEdgeWeight * 0.72);
      const targetRotationX = baseRotation.x - cameraFoldX - cornerDiveX;
      const targetRotationY = baseRotation.y + leftSweepY;
      const targetRotationZ = baseRotation.z + leftSweepZ;

      bone.rotation.x = MathUtils.damp(
        bone.rotation.x,
        targetRotationX,
        9.2,
        delta,
      );
      bone.rotation.y = MathUtils.damp(
        bone.rotation.y,
        targetRotationY,
        9.4,
        delta,
      );
      bone.rotation.z = MathUtils.damp(
        bone.rotation.z,
        targetRotationZ,
        9.4,
        delta,
      );
    });

    if (rootBone && packRigModel.baseRootPosition) {
      const rootLift =
        opened && useRiggedFlap && !openBone
          ? MathUtils.smootherstep(peelTarget, 0.88, 1) * 0.22
          : 0;

      rootBone.position.x = MathUtils.damp(
        rootBone.position.x,
        packRigModel.baseRootPosition.x,
        7.2,
        delta,
      );
      rootBone.position.y = MathUtils.damp(
        rootBone.position.y,
        packRigModel.baseRootPosition.y + rootLift,
        opened ? 6.8 : 8.2,
        delta,
      );
      rootBone.position.z = MathUtils.damp(
        rootBone.position.z,
        packRigModel.baseRootPosition.z,
        7.2,
        delta,
      );
    }

    if (openBone && packRigModel.baseOpenRotation) {
      const openLift =
        opened && useRiggedFlap ? MathUtils.smootherstep(peelTarget, 0.88, 1) * 0.62 : 0;

      openBone.rotation.x = MathUtils.damp(
        openBone.rotation.x,
        packRigModel.baseOpenRotation.x - openLift,
        opened ? 13.5 : 9.2,
        delta,
      );
      openBone.rotation.y = MathUtils.damp(
        openBone.rotation.y,
        packRigModel.baseOpenRotation.y,
        8.2,
        delta,
      );
      openBone.rotation.z = MathUtils.damp(
        openBone.rotation.z,
        packRigModel.baseOpenRotation.z,
        8.2,
        delta,
      );
    }

    slitRef.current.position.x = MathUtils.damp(
      slitRef.current.position.x,
      MathUtils.lerp(-PACK_WIDTH * 0.18, PACK_WIDTH * 0.18, tearAnchor),
      5,
      delta,
    );
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
      <PackStudioLighting />

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

          <primitive object={packRigModel.model} />

          <mesh
            ref={slitRef}
            position={[0, PACK_BODY_HEIGHT / 2 + 0.02, PACK_DEPTH / 2 + 0.12]}
            visible={showTearSlit}
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

      <SharedViewerPostProcessing
        brightness={0.012}
        contrast={0.045}
        hue={0.01}
        saturation={0.16}
        vignetteDarkness={0.26}
      />
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
  rotationOffset: number;
  ringGroupRef: MutableRefObject<Group | null>;
  transitionToTear: boolean;
  transitionProgressRef: MutableRefObject<number>;
}) {
  const slotRef = useRef<Group>(null);
  const packRef = useRef<Group>(null);
  const shadowMaterialRef = useRef<MeshBasicMaterial>(null);
  const transitionSettledRef = useRef(false);
  const transitionCompleteCallbackRef = useRef<(() => void) | undefined>(onTransitionToTearComplete);
  const transitionWorldPositionRef = useRef(new Vector3());
  const transitionTargetVectorRef = useRef(new Vector3());
  const [hovered, setHovered] = useState(false);
  const hoverTargetRef = useRef({ x: 0, y: 0 });
  const hoverPointerRef = useRef({ x: 0, y: 0 });
  const packRigModel = usePackFlapRigModel();

  useEffect(() => () => packRigModel.dispose(), [packRigModel]);
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

    packRigModel.materials.forEach((material) => {
      material.opacity = MathUtils.damp(material.opacity, inactiveFade, 6, delta);
    });

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

        <primitive object={packRigModel.model} />
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
  const carouselStep = (Math.PI * 2) / Math.max(rotationOffsets.length, 1);

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
      <PackStudioLighting />

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
              ringGroupRef={ringGroupRef}
              rotationOffset={rotationOffset}
              slotAngle={index * carouselStep}
              transitionToTear={transitionToTear}
              transitionProgressRef={transitionProgressRef}
            />
          ))}
        </group>
      </group>

      <SharedViewerPostProcessing
        brightness={0.012}
        contrast={0.045}
        hue={0.01}
        saturation={0.16}
        vignetteDarkness={0.26}
      />
    </>
  );
}

export function PackScene(props: PackSceneProps) {
  const { cameraY = DEFAULT_PACK_SCENE_CAMERA_Y, ...rigProps } = props;

  return (
    <div className="pack-scene">
      <Canvas
        shadows
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
        shadows
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
