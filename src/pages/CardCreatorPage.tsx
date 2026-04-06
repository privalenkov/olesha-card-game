import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CardCreatorPreviewPanel } from '../components/CardCreatorPreviewPanel';
import { type CardCreatorPreviewTool } from '../components/CardCreatorPreviewMenu';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CardCreatorStatusHeader } from '../components/CardCreatorStatusHeader';
import { RarityGrantModal } from '../components/RarityGrantModal';
import { ColorPickerPopover } from '../components/ui/ColorPickerPopover';
import { FileUpload } from '../components/ui/FileUpload';
import { RangeInput } from '../components/ui/RangeInput';
import { Select, type SelectOption } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { TextArea } from '../components/ui/TextArea';
import { TextInput } from '../components/ui/TextInput';
import {
  ApiError,
  fetchProposal,
  overrideProposalAsAdmin,
  saveProposal,
  submitProposal,
  uploadCardArt,
} from '../game/api';
import { buildPreviewOwnedCard } from '../game/cardDraft';
import { useGame } from '../game/GameContext';
import {
  CARD_MASK_EDITOR_HEIGHT,
  CARD_MASK_EDITOR_WIDTH,
  CARD_TEXTURE_HEIGHT,
  CARD_TEXTURE_WIDTH,
} from '../game/cardDimensions';
import { rarityMeta } from '../game/config';
import {
  CARD_ACCENT_SWATCHES,
  CARD_LAYOUT_TYPE_OPTIONS,
  CARD_LAYOUT_TYPE_LABELS,
  CARD_LAYER_ONE_FILL_PRESETS,
  CARD_LAYER_TWO_FILL_PRESETS,
  CARD_TREATMENT_EFFECT_OPTIONS,
  CARD_TREATMENT_EFFECT_DESCRIPTIONS,
  CARD_TREATMENT_EFFECT_LABELS,
  type CardLayoutType,
  getDefaultCardVisuals,
  getDefaultDecorativePattern,
  getDefaultEffectLayer,
  PROPOSAL_STATUS_LABELS,
  type CardProposal,
  type CardTreatmentEffect,
  type ProposalEditorPayload,
  type Rarity,
  type RarityBalanceSnapshot,
  rarityOrder,
} from '../game/types';
import { useCardPreviewImage, useDecorativePatternMaskImage } from '../three/textures';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Не удалось прочитать изображение.'));
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось загрузить изображение маски.'));
    image.src = src;
  });
}

async function normalizeImportedMaskDataUrl(dataUrl: string) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_TEXTURE_WIDTH;
  canvas.height = CARD_TEXTURE_HEIGHT;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Не удалось подготовить маску.');
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  let hasTransparency = false;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 250) {
      hasTransparency = true;
      break;
    }
  }

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    const luminance =
      (data[index] / 255) * 0.2126 +
      (data[index + 1] / 255) * 0.7152 +
      (data[index + 2] / 255) * 0.0722;
    const maskAlpha = hasTransparency ? alpha : luminance * alpha;

    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = Math.round(Math.max(0, Math.min(1, maskAlpha)) * 255);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function draftFromProposal(proposal: CardProposal): ProposalEditorPayload {
  return {
    title: proposal.title,
    description: proposal.description,
    urlImage: proposal.urlImage,
    defaultFinish: proposal.defaultFinish,
    visuals: proposal.visuals ?? getDefaultCardVisuals(),
    effectLayers: proposal.effectLayers,
  };
}

const ADMIN_RARITY_SELECT_OPTIONS: SelectOption<Rarity>[] = rarityOrder.map((rarity) => ({
  label: rarity,
  value: rarity,
}));

type EffectLayerDraft = ProposalEditorPayload['effectLayers'][number];

function isDataUrl(value: string) {
  return value.startsWith('data:image/');
}

const MAX_UPLOAD_FILE_BYTES = 5 * 1024 * 1024;

function componentToHex(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
}

function rgbStringToHex(value: string, fallback: string) {
  const match = value.match(
    /^rgba?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*[\d.]+\s*)?\)$/iu,
  );

  if (!match) {
    return fallback;
  }

  return `#${componentToHex(Number(match[1]))}${componentToHex(Number(match[2]))}${componentToHex(Number(match[3]))}`;
}

function normalizeAccentColorValue(value: string, fallback: string) {
  const normalized = value.trim();
  const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/iu);

  if (hexMatch) {
    const hexValue = hexMatch[1];
    if (hexValue.length === 3) {
      return `#${hexValue
        .split('')
        .map((char) => char + char)
        .join('')
        .toLowerCase()}`;
    }

    return `#${hexValue.toLowerCase()}`;
  }

  return rgbStringToHex(normalized, fallback);
}

const GRADIENT_PICKER_LOCALES = {
  CONTROLS: {
    SOLID: 'Цвет',
    GRADIENT: 'Градиент',
  },
};

function inferAssetExtension(url: string, fallback: string) {
  if (url.startsWith('data:image/svg+xml')) {
    return 'svg';
  }

  if (url.startsWith('data:image/png')) {
    return 'png';
  }

  if (url.startsWith('data:image/webp')) {
    return 'webp';
  }

  if (url.startsWith('data:image/jpeg')) {
    return 'jpg';
  }

  const match = url.match(/\.([a-z0-9]+)(?:$|\?)/iu);
  return match?.[1]?.toLowerCase() ?? fallback;
}

function extractAssetFileName(url: string) {
  if (!url || url.startsWith('data:')) {
    return null;
  }

  try {
    const parsedUrl = new URL(url, 'http://localhost');
    const lastSegment = parsedUrl.pathname.split('/').filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : null;
  } catch {
    const sanitizedUrl = url.split('#')[0]?.split('?')[0] ?? '';
    const lastSegment = sanitizedUrl.split('/').filter(Boolean).pop();
    return lastSegment ? decodeURIComponent(lastSegment) : null;
  }
}

function getAssetDisplayName(url: string, fallbackBaseName: string, fallbackExtension: string) {
  if (!url) {
    return null;
  }

  const extractedFileName = extractAssetFileName(url);

  if (extractedFileName && /\.[a-z0-9]+$/iu.test(extractedFileName)) {
    return extractedFileName;
  }

  return `${fallbackBaseName}.${inferAssetExtension(url, fallbackExtension)}`;
}

function triggerAssetDownload(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

interface CreatorEntryLocationState {
  awardedProposalId?: string;
}

export function CardCreatorPage() {
  const { proposalId = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { authConfigured, authenticated, isAdmin, login, notify } = useGame();
  const [proposal, setProposal] = useState<CardProposal | null>(null);
  const [rarityBalance, setRarityBalance] = useState<RarityBalanceSnapshot | null>(null);
  const [draft, setDraft] = useState<ProposalEditorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(18);
  const [brushSoftness, setBrushSoftness] = useState(0.5);
  const [previewTool, setPreviewTool] = useState<CardCreatorPreviewTool>('hand');
  const [adminRarity, setAdminRarity] = useState<Rarity>('common');
  const [adminCardTypes, setAdminCardTypes] = useState<CardLayoutType[]>([]);
  const [adminEffects, setAdminEffects] = useState<CardTreatmentEffect[]>([]);
  const [grantedRarity, setGrantedRarity] = useState<Rarity | null>(null);
  const [rarityGrantOpen, setRarityGrantOpen] = useState(false);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [decorativePatternFileName, setDecorativePatternFileName] = useState<string | null>(null);
  const [effectMaskFileNames, setEffectMaskFileNames] = useState<Record<string, string>>({});
  const [patternSettingsOpen, setPatternSettingsOpen] = useState(false);
  const isLocked = proposal?.status !== 'draft';
  const patternAvailable = proposal?.editorCapabilities.decorativePattern ?? false;
  const availableCardTypes = proposal?.allowedCardTypes ?? [];
  const availableCardTypeOptions = useMemo<SelectOption<CardLayoutType>[]>(
    () =>
      availableCardTypes.map((cardType) => ({
        label: CARD_LAYOUT_TYPE_LABELS[cardType],
        value: cardType,
      })),
    [availableCardTypes],
  );
  const lastRejectionNoticeRef = useRef<string | null>(null);
  const imageUploadRequestIdRef = useRef(0);
  const decorativePatternUploadRequestIdRef = useRef(0);
  const effectMaskUploadRequestIdsRef = useRef<Record<string, number>>({});
  const initializedPatternSettingsProposalIdRef = useRef<string | null>(null);

  useEffect(() => {
    setImageFileName(null);
    setDecorativePatternFileName(null);
    setEffectMaskFileNames({});
    setPatternSettingsOpen(false);
    imageUploadRequestIdRef.current = 0;
    decorativePatternUploadRequestIdRef.current = 0;
    effectMaskUploadRequestIdsRef.current = {};
    initializedPatternSettingsProposalIdRef.current = null;
  }, [proposalId]);

  useEffect(() => {
    const patternInitializationKey = `${proposalId}:${patternAvailable ? 'available' : 'hidden'}`;

    if (!draft || initializedPatternSettingsProposalIdRef.current === patternInitializationKey) {
      return;
    }

    initializedPatternSettingsProposalIdRef.current = patternInitializationKey;
    setPatternSettingsOpen(patternAvailable && Boolean(draft.visuals.decorativePattern.svgUrl));
  }, [draft, patternAvailable, proposalId]);

  useEffect(() => {
    if (!proposalId) {
      navigate('/collection');
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const response = await fetchProposal(proposalId);

        if (cancelled) {
          return;
        }

        setProposal(response.proposal);
        setRarityBalance(response.rarityBalance);
        setDraft(draftFromProposal(response.proposal));
      } catch (error) {
        if (!cancelled) {
          showCreatorError(getRequestErrorMessage(error, 'Не удалось открыть редактор.'), 'Ошибка загрузки');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [navigate, proposalId]);

  useEffect(() => {
    if (!proposal) {
      return;
    }

    setAdminRarity(proposal.rarity);
    setAdminCardTypes(proposal.allowedCardTypes);
    setAdminEffects(proposal.allowedEffects);
  }, [proposal]);

  useEffect(() => {
    const state = location.state as CreatorEntryLocationState | null;

    if (!proposal || !state?.awardedProposalId || state.awardedProposalId !== proposal.id) {
      return;
    }

    setGrantedRarity(proposal.rarity);
    setRarityGrantOpen(true);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate, proposal]);

  useEffect(() => {
    if (!proposal?.rejectionReason) {
      lastRejectionNoticeRef.current = null;
      return;
    }

    const rejectionNoticeKey = `${proposal.id}:${proposal.rejectionReason}`;

    if (lastRejectionNoticeRef.current === rejectionNoticeKey) {
      return;
    }

    lastRejectionNoticeRef.current = rejectionNoticeKey;
    notify({
      kind: 'error',
      title: 'Причина отказа',
      message: proposal.rejectionReason,
      proposalId: proposal.id,
    });
  }, [notify, proposal]);

  useEffect(() => {
    if (!draft) {
      setSelectedLayerId(null);
      setPreviewTool('hand');
      return;
    }

    if (draft.effectLayers.length === 0) {
      setSelectedLayerId(null);
      setPreviewTool('hand');
      return;
    }

    if (!selectedLayerId || !draft.effectLayers.some((layer) => layer.id === selectedLayerId)) {
      setSelectedLayerId(draft.effectLayers[0].id);
    }
  }, [draft, selectedLayerId]);

  const selectedLayer = useMemo(
    () => draft?.effectLayers.find((layer) => layer.id === selectedLayerId) ?? null,
    [draft, selectedLayerId],
  );

  useEffect(() => {
    if (previewTool === 'hand') {
      return;
    }

    if (isLocked || !selectedLayer) {
      setPreviewTool('hand');
    }
  }, [isLocked, previewTool, selectedLayer]);

  const previewCard = useMemo(() => {
    if (!proposal || !draft) {
      return null;
    }

    return buildPreviewOwnedCard({
      ...proposal,
      ...draft,
      visuals: draft.visuals,
      defaultFinish: draft.defaultFinish,
      urlImage: draft.urlImage,
      title: draft.title,
      description: draft.description,
      effectLayers: draft.effectLayers,
    });
  }, [draft, proposal]);

  const previewImage = useCardPreviewImage(previewCard);
  const decorativePatternMaskImage = useDecorativePatternMaskImage(previewCard);
  const viewerRenderKey = useMemo(() => {
    if (!previewCard) {
      return 'creator-viewer';
    }

    const visuals = previewCard.visuals ?? getDefaultCardVisuals();
    const effectKey = (previewCard.effectLayers ?? [])
      .map(
        (layer) =>
          `${layer.id}:${layer.type}:${layer.opacity}:${layer.shimmer}:${layer.relief}:${layer.offsetX}:${layer.offsetY}:${layer.maskUrl.length}:${layer.maskUrl.slice(-48)}`,
      )
      .join('|');

    return [
      previewCard.instanceId,
      previewCard.urlImage.slice(-48),
      previewCard.defaultFinish,
      visuals.accentColor,
      visuals.layerOneFill,
      visuals.layerTwoFill,
      visuals.cardType,
      visuals.decorativePattern.svgUrl.length,
      visuals.decorativePattern.svgUrl.slice(-48),
      visuals.decorativePattern.size,
      visuals.decorativePattern.gap,
      visuals.decorativePattern.opacity,
      visuals.decorativePattern.offsetX,
      visuals.decorativePattern.offsetY,
      effectKey,
    ].join('::');
  }, [previewCard]);

  const availableEffects = useMemo(() => {
    if (!proposal || !draft) {
      return [];
    }

    return proposal.allowedEffects.map((effect) => ({
      effect,
      layer: draft.effectLayers.find((layer) => layer.type === effect) ?? null,
    }));
  }, [draft, proposal]);

  const mainImageDisplayName =
    imageFileName ?? getAssetDisplayName(draft?.urlImage ?? '', 'image', 'png');
  const mainImagePreviewUrl = draft?.urlImage || null;
  const decorativePatternDisplayName =
    decorativePatternFileName ??
    getAssetDisplayName(draft?.visuals.decorativePattern.svgUrl ?? '', 'pattern', 'svg');
  const decorativePatternPreviewUrl = draft?.visuals.decorativePattern.svgUrl || null;
  function showCreatorError(message: string, title = 'Ошибка', notifyUser = true) {
    if (!notifyUser) {
      return;
    }

    notify({
      kind: 'error',
      title,
      message,
    });
  }

  function getRequestErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }

  function showCreatorRequestError(error: unknown, fallback: string, title = 'Ошибка') {
    showCreatorError(
      getRequestErrorMessage(error, fallback),
      error instanceof ApiError && error.title ? error.title : title,
      !(error instanceof ApiError && error.alreadyNotified),
    );
  }

  function validateUploadFileSize(file: File, label: string) {
    if (file.size <= MAX_UPLOAD_FILE_BYTES) {
      return true;
    }

    showCreatorError(
      `${label} слишком большой. Загрузи файл размером до 5 МБ.`,
      'Слишком большой файл',
    );
    return false;
  }

  function updateVisualFill(fillKey: 'layerOneFill' | 'layerTwoFill', value: string) {
    updateDraft((current) => ({
      ...current,
      visuals: {
        ...current.visuals,
        [fillKey]: value,
      },
    }));
  }

  async function materializeDraftAssets(currentDraft: ProposalEditorPayload) {
    const uploadedLayers = [...currentDraft.effectLayers];
    let imageUrl = currentDraft.urlImage;
    let decorativePatternSvgUrl = currentDraft.visuals.decorativePattern.svgUrl;

    if (isDataUrl(imageUrl)) {
      const uploaded = await uploadCardArt(imageUrl);
      imageUrl = uploaded.url;
    }

    if (isDataUrl(decorativePatternSvgUrl)) {
      const uploaded = await uploadCardArt(decorativePatternSvgUrl);
      decorativePatternSvgUrl = uploaded.url;
    }

    for (let index = 0; index < uploadedLayers.length; index += 1) {
      const layer = uploadedLayers[index];
      if (!isDataUrl(layer.maskUrl)) {
        continue;
      }

      const uploaded = await uploadCardArt(layer.maskUrl);
      uploadedLayers[index] = {
        ...layer,
        maskUrl: uploaded.url,
      };
    }

    return {
      ...currentDraft,
      urlImage: imageUrl,
      visuals: {
        ...currentDraft.visuals,
        decorativePattern: {
          ...currentDraft.visuals.decorativePattern,
          svgUrl: decorativePatternSvgUrl,
        },
      },
      effectLayers: uploadedLayers,
    };
  }

  async function persistDraft() {
    if (!draft || !proposal) {
      return null;
    }

    setSaving(true);

    try {
      const uploadedDraft = await materializeDraftAssets(draft);
      setDraft(uploadedDraft);
      const response = await saveProposal(proposal.id, uploadedDraft);
      setProposal(response.proposal);
      setDraft(draftFromProposal(response.proposal));
      notify({
        kind: 'success',
        title: 'Черновик сохранен',
        message: 'Изменения сохранены и готовы к дальнейшему редактированию.',
      });
      return response.proposal;
    } catch (error) {
      showCreatorRequestError(error, 'Не удалось сохранить черновик.', 'Ошибка сохранения');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    const saved = await persistDraft();

    if (!saved) {
      return;
    }

    setSaving(true);

    try {
      const response = await submitProposal(saved.id);
      setProposal(response.proposal);
      setDraft(draftFromProposal(response.proposal));
      notify({
        kind: 'success',
        title: 'Карточка отправлена',
        message: 'Карточка ушла на модерацию. Решение придет отдельным уведомлением.',
      });
    } catch (error) {
      showCreatorRequestError(error, 'Не удалось отправить карточку.', 'Ошибка отправки');
    } finally {
      setSaving(false);
    }
  }

  async function handleImageChange(file: File | null) {
    if (!file || !draft) {
      return;
    }

    if (!validateUploadFileSize(file, 'Файл изображения')) {
      return;
    }

    const requestId = imageUploadRequestIdRef.current + 1;
    imageUploadRequestIdRef.current = requestId;
    setImageFileName(file.name);

    try {
      const localDataUrl = await fileToDataUrl(file);

      if (requestId !== imageUploadRequestIdRef.current) {
        return;
      }

      setDraft((current) => (current ? { ...current, urlImage: localDataUrl } : current));
      const uploaded = await uploadCardArt(localDataUrl);

      if (requestId !== imageUploadRequestIdRef.current) {
        return;
      }

      setDraft((current) => (current ? { ...current, urlImage: uploaded.url } : current));
      notify({
        kind: 'success',
        title: 'Изображение загружено',
        message: 'Новое изображение карточки применено к черновику.',
      });
    } catch (error) {
      if (requestId === imageUploadRequestIdRef.current) {
        showCreatorRequestError(error, 'Не удалось загрузить изображение.', 'Ошибка загрузки');
      }
    }
  }

  async function handleDecorativePatternChange(file: File | null) {
    if (!file || !draft || !patternAvailable) {
      return;
    }

    if (file.type !== 'image/svg+xml' && !file.name.toLowerCase().endsWith('.svg')) {
      showCreatorError('Для декоративного паттерна нужен SVG.', 'Неверный формат');
      return;
    }

    if (!validateUploadFileSize(file, 'SVG паттерн')) {
      return;
    }

    const requestId = decorativePatternUploadRequestIdRef.current + 1;
    decorativePatternUploadRequestIdRef.current = requestId;
    setDecorativePatternFileName(file.name);

    try {
      const localDataUrl = await fileToDataUrl(file);

      if (requestId !== decorativePatternUploadRequestIdRef.current) {
        return;
      }

      setDraft((current) =>
        current
          ? {
              ...current,
              visuals: {
                ...current.visuals,
                decorativePattern: {
                  ...current.visuals.decorativePattern,
                  svgUrl: localDataUrl,
                },
              },
            }
          : current,
      );
      const uploaded = await uploadCardArt(localDataUrl);

      if (requestId !== decorativePatternUploadRequestIdRef.current) {
        return;
      }

      setDraft((current) =>
        current
          ? {
              ...current,
              visuals: {
                ...current.visuals,
                decorativePattern: {
                  ...current.visuals.decorativePattern,
                  svgUrl: uploaded.url,
                },
              },
            }
          : current,
      );
      notify({
        kind: 'success',
        title: 'SVG паттерн загружен',
        message: 'Декоративный паттерн применен к карточке.',
      });
    } catch (error) {
      if (requestId === decorativePatternUploadRequestIdRef.current) {
        showCreatorRequestError(error, 'Не удалось загрузить SVG паттерн.', 'Ошибка загрузки');
      }
    }
  }

  async function handleEffectMaskUpload(file: File | null, layerId: string) {
    if (!file || !draft) {
      return;
    }

    if (
      !/^image\/(?:png|jpeg|webp|svg\+xml)$/u.test(file.type) &&
      !/\.(?:png|jpe?g|webp|svg)$/iu.test(file.name)
    ) {
      showCreatorError('Для маски нужен PNG, JPEG, WEBP или SVG.', 'Неверный формат');
      return;
    }

    if (!validateUploadFileSize(file, 'Файл маски')) {
      return;
    }

    const requestId = (effectMaskUploadRequestIdsRef.current[layerId] ?? 0) + 1;
    effectMaskUploadRequestIdsRef.current = {
      ...effectMaskUploadRequestIdsRef.current,
      [layerId]: requestId,
    };

    try {
      setEffectMaskFileNames((current) => ({
        ...current,
        [layerId]: file.name,
      }));
      const localDataUrl = await fileToDataUrl(file);
      const normalizedMaskUrl = await normalizeImportedMaskDataUrl(localDataUrl);

      if (effectMaskUploadRequestIdsRef.current[layerId] !== requestId) {
        return;
      }

      updateDraft((current) => ({
        ...current,
        effectLayers: current.effectLayers.map((layer) =>
          layer.id === layerId ? { ...layer, maskUrl: normalizedMaskUrl } : layer,
        ),
      }));
      notify({
        kind: 'success',
        title: 'Маска загружена',
        message: 'Готовая маска применена к выбранному слою.',
      });
    } catch (error) {
      if (effectMaskUploadRequestIdsRef.current[layerId] === requestId) {
        showCreatorRequestError(error, 'Не удалось загрузить маску.', 'Ошибка загрузки');
      }
    }
  }

  function updateDraft(transform: (current: ProposalEditorPayload) => ProposalEditorPayload) {
    setDraft((current) => (current ? transform(current) : current));
  }

  function updateEffectLayer(
    layerId: string,
    transform: (layer: EffectLayerDraft) => EffectLayerDraft,
  ) {
    updateDraft((current) => ({
      ...current,
      effectLayers: current.effectLayers.map((layer) =>
        layer.id === layerId ? transform(layer) : layer,
      ),
    }));
  }

  function getEffectMaskDisplayName(layer: EffectLayerDraft) {
    return (
      effectMaskFileNames[layer.id] ??
      getAssetDisplayName(layer.maskUrl, `${layer.type}-mask`, 'png')
    );
  }

  function selectEffectLayer(layerId: string) {
    setSelectedLayerId(layerId);
  }

  function renderEffectLayerSettings(layer: EffectLayerDraft) {
    return (
      <>
        {layer.type !== 'emboss' && layer.type !== 'dimensional_lamination' ? (
          <RangeInput
            disabled={isLocked}
            label="Интенсивность"
            max={1}
            min={0.2}
            onValueChange={(value) =>
              updateEffectLayer(layer.id, (currentLayer) => ({
                ...currentLayer,
                opacity: value,
              }))
            }
            step={0.02}
            value={layer.opacity}
            valueLabel={`${Math.round(layer.opacity * 100)}%`}
          />
        ) : null}

        {layer.type === 'spot_gloss' ? (
          <RangeInput
            disabled={isLocked}
            label="Глянцевость"
            max={1}
            min={0}
            onValueChange={(value) =>
              updateEffectLayer(layer.id, (currentLayer) => ({
                ...currentLayer,
                shimmer: value,
              }))
            }
            step={0.01}
            value={layer.shimmer}
            valueLabel={`${Math.round(layer.shimmer * 100)}%`}
          />
        ) : null}

        {layer.type === 'texture_sugar' ? (
          <RangeInput
            disabled={isLocked}
            label="Сила переливания"
            max={1.4}
            min={0.2}
            onValueChange={(value) =>
              updateEffectLayer(layer.id, (currentLayer) => ({
                ...currentLayer,
                shimmer: value,
              }))
            }
            step={0.02}
            value={layer.shimmer}
            valueLabel={`${Math.round(layer.shimmer * 100)}%`}
          />
        ) : null}

        {layer.type === 'emboss' ? (
          <RangeInput
            disabled={isLocked}
            label="Рельеф"
            max={1}
            min={-1}
            onValueChange={(value) =>
              updateEffectLayer(layer.id, (currentLayer) => ({
                ...currentLayer,
                relief: value,
              }))
            }
            step={0.02}
            value={layer.relief}
            valueLabel={
              layer.relief > 0
                ? `+${Math.round(layer.relief * 100)}%`
                : `${Math.round(layer.relief * 100)}%`
            }
          />
        ) : null}

        {layer.type === 'dimensional_lamination' ? (
          <RangeInput
            disabled={isLocked}
            label="Высота слоя"
            max={5}
            min={0.2}
            onValueChange={(value) =>
              updateEffectLayer(layer.id, (currentLayer) => ({
                ...currentLayer,
                shimmer: value,
              }))
            }
            step={0.05}
            value={layer.shimmer}
            valueLabel={`${Math.round(layer.shimmer * 100)}%`}
          />
        ) : null}

        {layer.type === 'dimensional_lamination' ? (
          <RangeInput
            disabled={isLocked}
            label="Сдвиг по X"
            max={0.12}
            min={-0.12}
            onValueChange={(value) =>
              updateEffectLayer(layer.id, (currentLayer) => ({
                ...currentLayer,
                offsetX: value,
              }))
            }
            step={0.002}
            value={layer.offsetX}
            valueLabel={`${layer.offsetX > 0 ? '+' : ''}${(layer.offsetX * 100).toFixed(1)}%`}
          />
        ) : null}

        {layer.type === 'dimensional_lamination' ? (
          <RangeInput
            disabled={isLocked}
            label="Сдвиг по Y"
            max={0.12}
            min={-0.12}
            onValueChange={(value) =>
              updateEffectLayer(layer.id, (currentLayer) => ({
                ...currentLayer,
                offsetY: value,
              }))
            }
            step={0.002}
            value={layer.offsetY}
            valueLabel={`${layer.offsetY > 0 ? '+' : ''}${(layer.offsetY * 100).toFixed(1)}%`}
          />
        ) : null}

        <div className="creator-field creator-field--upload">
          <span>Загрузить готовую маску</span>
          <FileUpload
            accept="image/png,image/jpeg,image/webp"
            addLabel="Добавить изображение"
            changeLabel="Изменить изображение"
            disabled={isLocked}
            fileName={getEffectMaskDisplayName(layer)}
            onClear={() => clearEffectMask(layer.id)}
            onFileSelect={(file) => void handleEffectMaskUpload(file, layer.id)}
            previewUrl={layer.maskUrl}
          />
        </div>

        <div className="creator-field">
          <span>Подсказка по размеру</span>
          <small>
            Лучше загружать маску в пропорции карточки: {CARD_MASK_EDITOR_WIDTH}x
            {CARD_MASK_EDITOR_HEIGHT} px для редактора или {CARD_TEXTURE_WIDTH}x
            {CARD_TEXTURE_HEIGHT} px для максимально четкого рендера. Белое включает ламинацию.
          </small>
        </div>

        <div className="creator-tools">
          <button
            className="action-button"
            disabled={!layer.maskUrl}
            onClick={() =>
              triggerAssetDownload(
                layer.maskUrl,
                `${layer.type}-mask.${inferAssetExtension(layer.maskUrl, 'png')}`,
              )
            }
            type="button"
          >
            Скачать маску
          </button>
        </div>
      </>
    );
  }

  function addEffectLayer(effect: CardTreatmentEffect) {
    if (!draft || !proposal || isLocked) {
      return;
    }

    if (draft.effectLayers.some((layer) => layer.type === effect)) {
      const existing = draft.effectLayers.find((layer) => layer.type === effect);
      setSelectedLayerId(existing?.id ?? null);
      return;
    }

    if (draft.effectLayers.length >= proposal.maxEffectLayers) {
      return;
    }

    const layer = getDefaultEffectLayer(effect, crypto.randomUUID());
    updateDraft((current) => ({
      ...current,
      effectLayers: [...current.effectLayers, layer],
    }));
    setSelectedLayerId(layer.id);
    setPreviewTool('brush');
  }

  function removeEffectLayer(layerId: string) {
    if (isLocked) {
      return;
    }

    delete effectMaskUploadRequestIdsRef.current[layerId];
    setEffectMaskFileNames((current) => {
      if (!(layerId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[layerId];
      return next;
    });

    updateDraft((current) => ({
      ...current,
      effectLayers: current.effectLayers.filter((layer) => layer.id !== layerId),
    }));
  }

  function clearMainImage() {
    imageUploadRequestIdRef.current += 1;
    setImageFileName(null);
    updateDraft((current) => ({
      ...current,
      urlImage: '',
    }));
  }

  function clearDecorativePattern() {
    decorativePatternUploadRequestIdRef.current += 1;
    setDecorativePatternFileName(null);
    updateDraft((current) => ({
      ...current,
      visuals: {
        ...current.visuals,
        decorativePattern: {
          ...current.visuals.decorativePattern,
          svgUrl: '',
        },
      },
    }));
  }

  function handlePatternSettingsToggle(checked: boolean) {
    if (checked) {
      setPatternSettingsOpen(true);
      return;
    }

    decorativePatternUploadRequestIdRef.current += 1;
    setDecorativePatternFileName(null);
    setPatternSettingsOpen(false);
    updateDraft((current) => ({
      ...current,
      visuals: {
        ...current.visuals,
        decorativePattern: getDefaultDecorativePattern(),
      },
    }));
  }

  function clearEffectMask(layerId: string) {
    effectMaskUploadRequestIdsRef.current = {
      ...effectMaskUploadRequestIdsRef.current,
      [layerId]: (effectMaskUploadRequestIdsRef.current[layerId] ?? 0) + 1,
    };
    setEffectMaskFileNames((current) => {
      if (!(layerId in current)) {
        return current;
      }

      const next = { ...current };
      delete next[layerId];
      return next;
    });

    updateDraft((current) => ({
      ...current,
      effectLayers: current.effectLayers.map((layer) =>
        layer.id === layerId ? { ...layer, maskUrl: '' } : layer,
      ),
    }));
  }

  async function applyAdminOverride() {
    if (!proposal || !isAdmin || isLocked) {
      return;
    }

    setSaving(true);

    try {
      const response = await overrideProposalAsAdmin(proposal.id, {
        rarity: adminRarity,
        allowedCardTypes: adminCardTypes,
        allowedEffects: adminEffects,
      });
      setProposal(response.proposal);
      setDraft(draftFromProposal(response.proposal));
      notify({
        kind: 'success',
        title: 'Override применен',
        message: 'Редкость, доступные типы карточки и эффекты обновлены для этого черновика.',
      });
    } catch (error) {
      showCreatorRequestError(error, 'Не удалось применить админский override.', 'Ошибка override');
    } finally {
      setSaving(false);
    }
  }

  if (!authenticated) {
    return (
      <section className="page page--creator">
        <div className="creator-empty empty-state">
          <strong className="creator-empty__title">Редактор доступен после входа</strong>
          {authConfigured ? (
            <button className="action-button action-button--solid" onClick={login} type="button">
              Войти через Google
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (loading || !proposal || !draft || !previewCard) {
    return (
      <section className="page page--creator">
        <div className="creator-empty empty-state">
          <strong className="creator-empty__title">загрузка</strong>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="page page--creator">
        <CardCreatorStatusHeader
          disabled={isLocked}
          onSaveDraft={() => void persistDraft()}
          onSubmit={() => void handleSubmit()}
          saving={saving}
          statusLabel={PROPOSAL_STATUS_LABELS[proposal.status]}
        />

        {isAdmin && rarityBalance ? (
          <div className="creator-rarity-balance">
            {rarityOrder.map((rarity) => {
              const entry = rarityBalance.entries.find((item) => item.rarity === rarity);

              if (!entry) {
                return null;
              }

              return (
                <article
                  key={entry.rarity}
                  className="creator-rarity-balance__card"
                  style={{ '--rarity-color': rarityMeta[entry.rarity].hue } as CSSProperties}
                >
                  <strong>{rarityMeta[entry.rarity].label}</strong>
                  <span>Сейчас в редакторе: {(entry.proposalChance * 100).toFixed(1)}%</span>
                  <span>
                    В каталоге: {entry.catalogCount} • цель {(entry.targetCatalogShare * 100).toFixed(1)}%
                  </span>
                </article>
              );
            })}
          </div>
        ) : null}

        <div className="creator-layout">
          <CardCreatorPreviewPanel
            activeTool={previewTool}
            brushSize={brushSize}
            brushSoftness={brushSoftness}
            card={previewCard}
            disabled={isLocked}
            onBrushSizeChange={setBrushSize}
            onBrushSoftnessChange={setBrushSoftness}
            onMaskChange={(maskUrl) =>
              updateDraft((current) => ({
                ...current,
                effectLayers: current.effectLayers.map((layer) =>
                  layer.id === selectedLayerId ? { ...layer, maskUrl } : layer,
                ),
              }))
            }
            onToolChange={setPreviewTool}
            previewImage={previewImage}
            selectedLayer={selectedLayer}
            viewerRenderKey={viewerRenderKey}
          />

          <div className="creator-form">
          <p className="creator-form__notice">
            * В зависимости от редкости карточки, вам выдаются разные настройки. Чем реже
            карточка, тем более уникальную карточку можно создать
          </p>
          <div className="creator-section">
            <div className="creator-section__head">
              <strong>Базовые настройки</strong>
            </div>

            <div className="creator-rarity-card">
              <div className="creator-field">
                <Select
                  ariaLabel="Тип карточки"
                  disabled={isLocked}
                  onValueChange={(cardType) =>
                    updateDraft((current) => ({
                      ...current,
                      visuals: {
                        ...current.visuals,
                        cardType,
                      },
                    }))
                  }
                  options={availableCardTypeOptions}
                  value={draft.visuals.cardType}
                />
              </div>
            </div>

            <label className="creator-field">
              <TextInput
                debounceMs={400}
                disabled={isLocked}
                maxLength={80}
                onValueChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    title: value,
                  }))
                }
                placeholder="Заголовок"
                value={draft.title}
              />
            </label>

            <label className="creator-field">
              <TextArea
                debounceMs={400}
                disabled={isLocked}
                maxLength={280}
                onValueChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    description: value,
                  }))
                }
                placeholder="Описание"
                rows={5}
                value={draft.description}
              />
            </label>

            <div className="creator-field creator-field--upload">
              <span>Изображение</span>
              <FileUpload
                accept="image/png,image/jpeg,image/webp"
                addLabel="Добавить изображение"
                changeLabel="Изменить изображение"
                disabled={isLocked}
                fileName={mainImageDisplayName}
                onClear={clearMainImage}
                onFileSelect={(file) => void handleImageChange(file)}
                previewUrl={mainImagePreviewUrl}
              />
            </div>

            <div className="creator-field creator-field--picker">
              <span>Цвет фона</span>
              <ColorPickerPopover
                disableLightMode
                disabled={isLocked}
                height={196}
                hideAdvancedSliders
                hideColorGuide
                hideEyeDrop
                hideGradientType
                hideInputType
                idSuffix="layer-one-fill"
                locales={GRADIENT_PICKER_LOCALES}
                onChange={(value) => {
                  if (!isLocked) {
                    updateVisualFill('layerOneFill', value);
                  }
                }}
                presets={[...CARD_LAYER_ONE_FILL_PRESETS]}
                value={draft.visuals.layerOneFill}
                width={270}
              />
            </div>

            <div className="creator-field creator-field--picker">
              <span>Цвет контента</span>
              <ColorPickerPopover
                disableLightMode
                disabled={isLocked}
                height={196}
                hideAdvancedSliders
                hideColorGuide
                hideEyeDrop
                hideGradientType
                hideInputType
                idSuffix="layer-two-fill"
                locales={GRADIENT_PICKER_LOCALES}
                onChange={(value) => {
                  if (!isLocked) {
                    updateVisualFill('layerTwoFill', value);
                  }
                }}
                presets={[...CARD_LAYER_TWO_FILL_PRESETS]}
                value={draft.visuals.layerTwoFill}
                width={270}
              />
            </div>

            {patternAvailable ? (
              <div className="creator-rarity-card creator-rarity-card--pattern">
                <Switch
                  checked={patternSettingsOpen}
                  disabled={isLocked}
                  label="Паттерн"
                  onCheckedChange={handlePatternSettingsToggle}
                />

                <div
                  aria-hidden={!patternSettingsOpen}
                  className={`creator-collapsible ${patternSettingsOpen ? 'creator-collapsible--open' : ''}`}
                >
                  <div className="creator-collapsible__inner">
                    <div className="creator-field creator-field--upload">
                      <FileUpload
                        accept=".svg,image/svg+xml"
                        addLabel="Добавить SVG"
                        changeLabel="Изменить SVG"
                        disabled={isLocked}
                        fileName={decorativePatternDisplayName}
                        onClear={clearDecorativePattern}
                        onFileSelect={(file) => void handleDecorativePatternChange(file)}
                        previewUrl={decorativePatternPreviewUrl}
                      />
                    </div>

                    <RangeInput
                      disabled={isLocked}
                      label="Размер паттерна"
                      max={260}
                      min={24}
                      onValueChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          visuals: {
                            ...current.visuals,
                            decorativePattern: {
                              ...current.visuals.decorativePattern,
                              size: value,
                            },
                          },
                        }))
                      }
                      step={2}
                      value={draft.visuals.decorativePattern.size}
                      valueLabel={`${Math.round(draft.visuals.decorativePattern.size)}px`}
                    />

                    <RangeInput
                      disabled={isLocked}
                      label="Отступ между элементами"
                      max={220}
                      min={0}
                      onValueChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          visuals: {
                            ...current.visuals,
                            decorativePattern: {
                              ...current.visuals.decorativePattern,
                              gap: value,
                            },
                          },
                        }))
                      }
                      step={2}
                      value={draft.visuals.decorativePattern.gap}
                      valueLabel={`${Math.round(draft.visuals.decorativePattern.gap)}px`}
                    />

                    <RangeInput
                      disabled={isLocked}
                      label="Прозрачность паттерна"
                      max={1}
                      min={0}
                      onValueChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          visuals: {
                            ...current.visuals,
                            decorativePattern: {
                              ...current.visuals.decorativePattern,
                              opacity: value,
                            },
                          },
                        }))
                      }
                      step={0.02}
                      value={draft.visuals.decorativePattern.opacity}
                      valueLabel={`${Math.round(draft.visuals.decorativePattern.opacity * 100)}%`}
                    />

                    <RangeInput
                      disabled={isLocked}
                      label="Смещение X"
                      max={220}
                      min={-220}
                      onValueChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          visuals: {
                            ...current.visuals,
                            decorativePattern: {
                              ...current.visuals.decorativePattern,
                              offsetX: value,
                            },
                          },
                        }))
                      }
                      step={2}
                      value={draft.visuals.decorativePattern.offsetX}
                      valueLabel={`${Math.round(draft.visuals.decorativePattern.offsetX)}px`}
                    />

                    <RangeInput
                      disabled={isLocked}
                      label="Смещение Y"
                      max={320}
                      min={-320}
                      onValueChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          visuals: {
                            ...current.visuals,
                            decorativePattern: {
                              ...current.visuals.decorativePattern,
                              offsetY: value,
                            },
                          },
                        }))
                      }
                      step={2}
                      value={draft.visuals.decorativePattern.offsetY}
                      valueLabel={`${Math.round(draft.visuals.decorativePattern.offsetY)}px`}
                    />

                    <div className="creator-tools">
                      <button
                        className="creator-link-button"
                        disabled={!decorativePatternMaskImage}
                        onClick={() =>
                          triggerAssetDownload(
                            decorativePatternMaskImage,
                            'decorative-pattern-mask.png',
                          )
                        }
                        type="button"
                      >
                        Скачать маску паттерна
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="creator-field creator-field--picker">
              <span>Цвет обводки</span>
              <ColorPickerPopover
                disableLightMode
                disabled={isLocked}
                height={196}
                hideAdvancedSliders
                hideColorGuide
                hideColorTypeBtns
                hideEyeDrop
                hideGradientControls
                hideInputType
                idSuffix="accent-color"
                onChange={(value) => {
                  if (!isLocked) {
                    updateDraft((current) => ({
                      ...current,
                      visuals: {
                        ...current.visuals,
                        accentColor: normalizeAccentColorValue(
                          value,
                          current.visuals.accentColor,
                        ),
                      },
                    }));
                  }
                }}
                presets={[...CARD_ACCENT_SWATCHES]}
                value={draft.visuals.accentColor}
                width={270}
              />
            </div>
          </div>

          <div className="creator-section">
            {isAdmin ? (
              <div className="creator-admin-panel">
                <div className="creator-section__head">
                  <strong>Тестовый override администратора</strong>
                  <span>Только для тестов: вручную меняет редкость, доступные типы карточки и effects у этого черновика.</span>
                </div>

                <div className="creator-row">
                  <label className="creator-field">
                    <span>Редкость</span>
                    <Select
                      ariaLabel="Редкость"
                      disabled={saving || isLocked}
                      onValueChange={setAdminRarity}
                      options={ADMIN_RARITY_SELECT_OPTIONS}
                      value={adminRarity}
                    />
                  </label>
                </div>

                <div className="creator-field">
                  <span>Доступные типы карточки</span>
                  <div className="creator-effect-grants creator-effect-grants--admin">
                    {CARD_LAYOUT_TYPE_OPTIONS.map((cardType) => {
                      const active = adminCardTypes.includes(cardType);
                      return (
                        <button
                          key={cardType}
                          className={`creator-effect-grant ${active ? 'creator-effect-grant--active' : ''}`}
                          disabled={saving || isLocked}
                          onClick={() =>
                            setAdminCardTypes((current) =>
                              CARD_LAYOUT_TYPE_OPTIONS.filter((item) =>
                                item === cardType ? !current.includes(item) : current.includes(item),
                              ),
                            )
                          }
                          type="button"
                        >
                          <strong>{CARD_LAYOUT_TYPE_LABELS[cardType]}</strong>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="creator-field">
                  <span>Доступные effects</span>
                  <div className="creator-effect-grants creator-effect-grants--admin">
                    {CARD_TREATMENT_EFFECT_OPTIONS.map((effect) => {
                      const active = adminEffects.includes(effect);
                      return (
                        <button
                          key={effect}
                          className={`creator-effect-grant ${active ? 'creator-effect-grant--active' : ''}`}
                          disabled={saving || isLocked}
                          onClick={() =>
                            setAdminEffects((current) =>
                              current.includes(effect)
                                ? current.filter((item) => item !== effect)
                                : [...current, effect],
                            )
                          }
                          type="button"
                        >
                          <strong>{CARD_TREATMENT_EFFECT_LABELS[effect]}</strong>
                          <span>{CARD_TREATMENT_EFFECT_DESCRIPTIONS[effect]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="creator-tools">
                  <button
                    className="action-button"
                    disabled={saving || isLocked || adminCardTypes.length === 0}
                    onClick={() => void applyAdminOverride()}
                    type="button"
                  >
                    Применить override
                  </button>
                </div>
              </div>
            ) : null}

            <div className="creator-section__head creator-section__head--effects">
              <strong>Доступные эффекты</strong>
              {isAdmin ? (
                <span>Чем реже карточка, тем больше эффектов доступно</span>
              ) : (
                <span>Добавляй только те спецэффекты, которые доступны для этой карточки.</span>
              )}
            </div>

            {proposal.allowedEffects.length > 0 ? (
              <div className="creator-effect-switches">
                {availableEffects.map(({ effect, layer }) => {
                  const isActive = Boolean(layer);
                  const isSelected = layer ? selectedLayerId === layer.id : false;
                  const canEnableEffect = Boolean(layer) || draft.effectLayers.length < proposal.maxEffectLayers;

                  return (
                    <div
                      key={effect}
                      className={`creator-effect-switch creator-rarity-card ${
                        isActive ? 'creator-effect-switch--active' : ''
                      } ${isSelected ? 'creator-effect-switch--selected' : ''}`.trim()}
                    >
                      <div className="creator-effect-switch__header">
                        <button
                          className="creator-effect-switch__select"
                          disabled={!layer}
                          onClick={() => {
                            if (layer) {
                              selectEffectLayer(layer.id);
                            }
                          }}
                          type="button"
                        >
                          <strong>{CARD_TREATMENT_EFFECT_LABELS[effect]}</strong>
                        </button>

                        <Switch
                          aria-label={`${isActive ? 'Выключить' : 'Включить'} эффект ${CARD_TREATMENT_EFFECT_LABELS[effect]}`}
                          checked={isActive}
                          className="creator-effect-switch__toggle"
                          disabled={isLocked || !canEnableEffect}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              addEffectLayer(effect);
                              return;
                            }

                            if (layer) {
                              removeEffectLayer(layer.id);
                            }
                          }}
                        />
                      </div>

                      <div
                        className={`creator-effect-switch__settings ${
                          isActive ? 'creator-effect-switch__settings--open' : ''
                        }`}
                      >
                        <div className="creator-effect-switch__settings-inner">
                          {layer ? renderEffectLayerSettings(layer) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="creator-effect-empty creator-rarity-card">
                Для этой карточки сейчас нет доступных специальных эффектов.
              </div>
            )}
          </div>
          </div>
        </div>
      </section>

      {rarityGrantOpen && grantedRarity ? (
        <RarityGrantModal
          onClose={() => {
            setRarityGrantOpen(false);
            setGrantedRarity(null);
          }}
          rarity={grantedRarity}
        />
      ) : null}
    </>
  );
}
