import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CardEffectMaskEditor } from '../components/CardEffectMaskEditor';
import { CardViewerCanvas } from '../components/CardViewerCanvas';
import {
  fetchProposal,
  overrideProposalAsAdmin,
  saveProposal,
  submitProposal,
  uploadCardArt,
} from '../game/api';
import { buildPreviewOwnedCard } from '../game/cardDraft';
import { useGame } from '../game/GameContext';
import {
  CARD_ACCENT_SWATCHES,
  CARD_FINISH_OPTIONS,
  CARD_FRAME_STYLE_OPTIONS,
  CARD_TREATMENT_EFFECT_OPTIONS,
  CARD_TREATMENT_EFFECT_DESCRIPTIONS,
  CARD_TREATMENT_EFFECT_LABELS,
  getDefaultCardVisuals,
  getDefaultEffectLayer,
  PROPOSAL_STATUS_LABELS,
  type CardProposal,
  type CardTreatmentEffect,
  type Rarity,
  type ProposalEditorPayload,
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
  canvas.width = 1024;
  canvas.height = 1536;
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

function isDataUrl(value: string) {
  return value.startsWith('data:image/');
}

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

function triggerAssetDownload(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function CardCreatorPage() {
  const { proposalId = '' } = useParams();
  const navigate = useNavigate();
  const { authConfigured, authenticated, isAdmin, login, notify } = useGame();
  const [proposal, setProposal] = useState<CardProposal | null>(null);
  const [draft, setDraft] = useState<ProposalEditorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(18);
  const [brushSoftness, setBrushSoftness] = useState(0.5);
  const [eraseMode, setEraseMode] = useState(false);
  const [adminRarity, setAdminRarity] = useState<Rarity>('common');
  const [adminEffects, setAdminEffects] = useState<CardTreatmentEffect[]>([]);

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
        setDraft(draftFromProposal(response.proposal));
        setStatusMessage(null);
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : 'Не удалось открыть редактор.');
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
    setAdminEffects(proposal.allowedEffects);
  }, [proposal]);

  useEffect(() => {
    if (!draft) {
      setSelectedLayerId(null);
      return;
    }

    if (draft.effectLayers.length === 0) {
      setSelectedLayerId(null);
      return;
    }

    if (!selectedLayerId || !draft.effectLayers.some((layer) => layer.id === selectedLayerId)) {
      setSelectedLayerId(draft.effectLayers[0].id);
    }
  }, [draft, selectedLayerId]);

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
          `${layer.id}:${layer.type}:${layer.opacity}:${layer.shimmer}:${layer.relief}:${layer.maskUrl.length}:${layer.maskUrl.slice(-48)}`,
      )
      .join('|');

    return [
      previewCard.instanceId,
      previewCard.urlImage.slice(-48),
      previewCard.defaultFinish,
      visuals.frameStyle,
      visuals.accentColor,
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

  const selectedLayer = useMemo(
    () => draft?.effectLayers.find((layer) => layer.id === selectedLayerId) ?? null,
    [draft, selectedLayerId],
  );

  const availableEffects = useMemo(() => {
    if (!proposal || !draft) {
      return [];
    }

    return proposal.allowedEffects.map((effect) => ({
      effect,
      layer: draft.effectLayers.find((layer) => layer.type === effect) ?? null,
    }));
  }, [draft, proposal]);

  const isLocked = proposal?.status !== 'draft';

  async function materializeDraftAssets(currentDraft: ProposalEditorPayload) {
    const uploadedLayers = [...currentDraft.effectLayers];
    let decorativePatternSvgUrl = currentDraft.visuals.decorativePattern.svgUrl;

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
      setStatusMessage('Черновик сохранен.');
      return response.proposal;
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Не удалось сохранить черновик.');
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
      setStatusMessage('Карточка отправлена на модерацию.');
      notify({
        kind: 'info',
        title: 'Карточка отправлена',
        message: 'Карточка ушла на модерацию. Решение придет отдельным уведомлением.',
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Не удалось отправить карточку.');
    } finally {
      setSaving(false);
    }
  }

  async function handleImageChange(file: File | null) {
    if (!file || !draft) {
      return;
    }

    setSaving(true);

    try {
      const localDataUrl = await fileToDataUrl(file);
      setDraft((current) => (current ? { ...current, urlImage: localDataUrl } : current));
      const uploaded = await uploadCardArt(localDataUrl);
      setDraft((current) => (current ? { ...current, urlImage: uploaded.url } : current));
      setStatusMessage('Изображение загружено.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Не удалось загрузить изображение.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDecorativePatternChange(file: File | null) {
    if (!file || !draft) {
      return;
    }

    if (file.type !== 'image/svg+xml' && !file.name.toLowerCase().endsWith('.svg')) {
      setStatusMessage('Для декоративного паттерна нужен SVG.');
      return;
    }

    setSaving(true);

    try {
      const localDataUrl = await fileToDataUrl(file);
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
      setStatusMessage('SVG паттерн загружен.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Не удалось загрузить SVG паттерн.');
    } finally {
      setSaving(false);
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
      setStatusMessage('Для маски нужен PNG, JPEG, WEBP или SVG.');
      return;
    }

    try {
      const localDataUrl = await fileToDataUrl(file);
      const normalizedMaskUrl = await normalizeImportedMaskDataUrl(localDataUrl);
      updateDraft((current) => ({
        ...current,
        effectLayers: current.effectLayers.map((layer) =>
          layer.id === layerId ? { ...layer, maskUrl: normalizedMaskUrl } : layer,
        ),
      }));
      setStatusMessage('Маска загружена в слой.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Не удалось загрузить маску.');
    }
  }

  function updateDraft(transform: (current: ProposalEditorPayload) => ProposalEditorPayload) {
    setDraft((current) => (current ? transform(current) : current));
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
    setEraseMode(false);
    setStatusMessage(`Добавлен слой: ${CARD_TREATMENT_EFFECT_LABELS[effect]}.`);
  }

  function removeEffectLayer(layerId: string) {
    if (isLocked) {
      return;
    }

    updateDraft((current) => ({
      ...current,
      effectLayers: current.effectLayers.filter((layer) => layer.id !== layerId),
    }));
    setStatusMessage('Слой эффекта удален.');
  }

  async function applyAdminOverride() {
    if (!proposal || !isAdmin || isLocked) {
      return;
    }

    setSaving(true);

    try {
      const response = await overrideProposalAsAdmin(proposal.id, {
        rarity: adminRarity,
        allowedEffects: adminEffects,
      });
      setProposal(response.proposal);
      setDraft(draftFromProposal(response.proposal));
      setStatusMessage('Админский override применен.');
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : 'Не удалось применить админский override.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!authenticated) {
    return (
      <section className="page page--creator">
        <div className="creator-empty empty-state">
          <strong>Редактор доступен после входа</strong>
          {authConfigured ? (
            <button className="action-button action-button--solid" onClick={login} type="button">
              Войти через Google
            </button>
          ) : (
            <span>Google OAuth пока не настроен.</span>
          )}
        </div>
      </section>
    );
  }

  if (loading || !proposal || !draft || !previewCard) {
    return (
      <section className="page page--creator">
        <div className="creator-empty empty-state">
          <strong>Загружаю редактор карточки...</strong>
          {statusMessage ? <span>{statusMessage}</span> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="page page--creator">
      <div className="creator-header">
        <div>
          <strong>Редактор карточки</strong>
          <span>
            Редкость выдана сервером: {proposal.rarity} • treatments: {draft.effectLayers.length}/
            {proposal.maxEffectLayers}
          </span>
        </div>
        <div className="creator-header__actions">
          <button
            className="action-button"
            disabled={saving || isLocked}
            onClick={() => void persistDraft()}
            type="button"
          >
            Сохранить черновик
          </button>
          <button
            className="action-button action-button--solid"
            disabled={saving || isLocked}
            onClick={() => void handleSubmit()}
            type="button"
          >
            Отправить на модерацию
          </button>
        </div>
      </div>

      <div className="creator-layout">
        <div className="creator-preview">
          <CardViewerCanvas
            key={viewerRenderKey}
            card={previewCard}
            introKey={previewCard.instanceId}
            cameraZ={10.6}
            scaleMultiplier={0.7}
            effectsPreset="full"
          />
        </div>

        <div className="creator-form">
          <div className="creator-section">
            <div className="creator-section__head">
              <strong>Основа карточки</strong>
              <span>Изображение обязательно. Без него сервер не примет карточку.</span>
            </div>

            <label className="creator-field">
              <span>Заголовок</span>
              <input
                disabled={isLocked}
                maxLength={80}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                type="text"
                value={draft.title}
              />
            </label>

            <label className="creator-field">
              <span>Описание</span>
              <textarea
                disabled={isLocked}
                maxLength={280}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={5}
                value={draft.description}
              />
            </label>

            <label className="creator-field">
              <span>Изображение</span>
              <input
                accept="image/png,image/jpeg,image/webp"
                disabled={isLocked || saving}
                onChange={(event) => void handleImageChange(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
          </div>

          <div className="creator-section">
            <div className="creator-section__head">
              <strong>Базовый стиль</strong>
              <span>Это общий вид карточки. Спецэффекты ниже работают отдельными слоями.</span>
            </div>

            <div className="creator-row">
              <label className="creator-field">
                <span>Голография базы</span>
                <select
                  disabled={isLocked}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      defaultFinish: event.target.value as ProposalEditorPayload['defaultFinish'],
                    }))
                  }
                  value={draft.defaultFinish}
                >
                  {CARD_FINISH_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="creator-field">
                <span>Рамка</span>
                <select
                  disabled={isLocked}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      visuals: {
                        ...current.visuals,
                        frameStyle: event.target.value as ProposalEditorPayload['visuals']['frameStyle'],
                      },
                    }))
                  }
                  value={draft.visuals.frameStyle}
                >
                  {CARD_FRAME_STYLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="creator-row">
              <label className="creator-field">
                <span>SVG декоративного паттерна</span>
                <input
                  accept=".svg,image/svg+xml"
                  disabled={isLocked || saving}
                  onChange={(event) =>
                    void handleDecorativePatternChange(event.target.files?.[0] ?? null)
                  }
                  type="file"
                />
              </label>

              <label className="creator-field">
                <span>
                  Статус паттерна:{' '}
                  {draft.visuals.decorativePattern.svgUrl ? 'SVG загружен' : 'SVG еще не загружен'}
                </span>
                <div className="creator-tools">
                  <button
                    className="action-button"
                    disabled={!decorativePatternMaskImage}
                    onClick={() =>
                      triggerAssetDownload(
                        decorativePatternMaskImage,
                        'decorative-pattern-mask.png',
                      )
                    }
                    type="button"
                  >
                    Скачать паттерн
                  </button>
                  <button
                    className="action-button"
                    disabled={isLocked || !draft.visuals.decorativePattern.svgUrl}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        visuals: {
                          ...current.visuals,
                          decorativePattern: {
                            ...current.visuals.decorativePattern,
                            svgUrl: '',
                          },
                        },
                      }))
                    }
                    type="button"
                  >
                    Очистить SVG
                  </button>
                </div>
              </label>
            </div>

            <div className="creator-field">
              <span>SVG будет повторяться по всей карточке, кроме области изображения.</span>
            </div>

            <div className="creator-row">
              <label className="creator-field">
                <span>Размер паттерна: {Math.round(draft.visuals.decorativePattern.size)} px</span>
                <input
                  disabled={isLocked}
                  max={260}
                  min={24}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      visuals: {
                        ...current.visuals,
                        decorativePattern: {
                          ...current.visuals.decorativePattern,
                          size: Number(event.target.value),
                        },
                      },
                    }))
                  }
                  step={2}
                  type="range"
                  value={draft.visuals.decorativePattern.size}
                />
              </label>

              <label className="creator-field">
                <span>Отступ между элементами: {Math.round(draft.visuals.decorativePattern.gap)} px</span>
                <input
                  disabled={isLocked}
                  max={220}
                  min={0}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      visuals: {
                        ...current.visuals,
                        decorativePattern: {
                          ...current.visuals.decorativePattern,
                          gap: Number(event.target.value),
                        },
                      },
                    }))
                  }
                  step={2}
                  type="range"
                  value={draft.visuals.decorativePattern.gap}
                />
              </label>
            </div>

            <div className="creator-row">
              <label className="creator-field">
                <span>
                  Прозрачность паттерна: {Math.round(draft.visuals.decorativePattern.opacity * 100)}%
                </span>
                <input
                  disabled={isLocked}
                  max={1}
                  min={0}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      visuals: {
                        ...current.visuals,
                        decorativePattern: {
                          ...current.visuals.decorativePattern,
                          opacity: Number(event.target.value),
                        },
                      },
                    }))
                  }
                  step={0.02}
                  type="range"
                  value={draft.visuals.decorativePattern.opacity}
                />
              </label>

              <label className="creator-field">
                <span>Смещение X: {Math.round(draft.visuals.decorativePattern.offsetX)} px</span>
                <input
                  disabled={isLocked}
                  max={220}
                  min={-220}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      visuals: {
                        ...current.visuals,
                        decorativePattern: {
                          ...current.visuals.decorativePattern,
                          offsetX: Number(event.target.value),
                        },
                      },
                    }))
                  }
                  step={2}
                  type="range"
                  value={draft.visuals.decorativePattern.offsetX}
                />
              </label>
            </div>

            <div className="creator-field">
              <span>Смещение Y: {Math.round(draft.visuals.decorativePattern.offsetY)} px</span>
              <input
                disabled={isLocked}
                max={320}
                min={-320}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    visuals: {
                      ...current.visuals,
                      decorativePattern: {
                        ...current.visuals.decorativePattern,
                        offsetY: Number(event.target.value),
                      },
                    },
                  }))
                }
                step={2}
                type="range"
                value={draft.visuals.decorativePattern.offsetY}
              />
            </div>

            <div className="creator-field">
              <span>Акцентный цвет</span>
              <div className="creator-swatches">
                {CARD_ACCENT_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    className={`creator-swatch ${
                      draft.visuals.accentColor === swatch ? 'creator-swatch--active' : ''
                    }`}
                    disabled={isLocked}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        visuals: {
                          ...current.visuals,
                          accentColor: swatch,
                        },
                      }))
                    }
                    style={{ backgroundColor: swatch }}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="creator-section">
            {isAdmin ? (
              <div className="creator-admin-panel">
                <div className="creator-section__head">
                  <strong>Тестовый override администратора</strong>
                  <span>Только для тестов: вручную меняет редкость и доступные effects у этого черновика.</span>
                </div>

                <div className="creator-row">
                  <label className="creator-field">
                    <span>Редкость</span>
                    <select
                      disabled={saving || isLocked}
                      onChange={(event) => setAdminRarity(event.target.value as Rarity)}
                      value={adminRarity}
                    >
                      <option value="common">common</option>
                      <option value="uncommon">uncommon</option>
                      <option value="rare">rare</option>
                      <option value="epic">epic</option>
                      <option value="veryrare">veryrare</option>
                    </select>
                  </label>
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
                    disabled={saving || isLocked}
                    onClick={() => void applyAdminOverride()}
                    type="button"
                  >
                    Применить override
                  </button>
                </div>
              </div>
            ) : null}

            <div className="creator-section__head">
              <strong>Выданные сервером treatments</strong>
              <span>
                Чем редче карточка, тем больше сервер выдает effect slots и тем сильнее их набор.
              </span>
            </div>

            {proposal.allowedEffects.length > 0 ? (
              <div className="creator-effect-grants">
                {availableEffects.map(({ effect, layer }) => (
                  <button
                    key={effect}
                    className={`creator-effect-grant ${
                      layer ? 'creator-effect-grant--active' : ''
                    }`}
                    disabled={isLocked && !layer}
                    onClick={() => (layer ? setSelectedLayerId(layer.id) : addEffectLayer(effect))}
                    type="button"
                  >
                    <strong>{CARD_TREATMENT_EFFECT_LABELS[effect]}</strong>
                    <span>{CARD_TREATMENT_EFFECT_DESCRIPTIONS[effect]}</span>
                    <em>{layer ? 'Редактировать маску' : 'Добавить слой'}</em>
                  </button>
                ))}
              </div>
            ) : (
              <div className="creator-effect-empty">
                Сервер выдал эту карточку без специальных treatment-эффектов.
              </div>
            )}

            {draft.effectLayers.length > 0 ? (
              <div className="creator-layers">
                {draft.effectLayers.map((layer) => (
                  <div
                    key={layer.id}
                    className={`creator-layer-card ${
                      selectedLayerId === layer.id ? 'creator-layer-card--active' : ''
                    }`}
                  >
                    <button
                      className="creator-layer-card__main"
                      onClick={() => setSelectedLayerId(layer.id)}
                      type="button"
                    >
                      <strong>{CARD_TREATMENT_EFFECT_LABELS[layer.type]}</strong>
                      <span>{layer.maskUrl ? 'Маска нарисована' : 'Маска еще пустая'}</span>
                    </button>
                    <button
                      className="creator-layer-card__remove"
                      disabled={isLocked}
                      onClick={() => removeEffectLayer(layer.id)}
                      type="button"
                    >
                      Убрать
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {selectedLayer ? (
              <div className="creator-layer-panel">
                <div className="creator-row">
                  {selectedLayer.type !== 'emboss' ? (
                    <label className="creator-field">
                      <span>
                        Интенсивность: {Math.round(selectedLayer.opacity * 100)}%
                      </span>
                      <input
                        disabled={isLocked}
                        max={1}
                        min={0.2}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            effectLayers: current.effectLayers.map((layer) =>
                              layer.id === selectedLayer.id
                                ? { ...layer, opacity: Number(event.target.value) }
                                : layer,
                            ),
                          }))
                        }
                        step={0.02}
                        type="range"
                        value={selectedLayer.opacity}
                      />
                    </label>
                  ) : null}

                  {selectedLayer.type === 'texture_sugar' ? (
                    <label className="creator-field">
                      <span>
                        Сила переливания: {Math.round(selectedLayer.shimmer * 100)}%
                      </span>
                      <input
                        disabled={isLocked}
                        max={1.4}
                        min={0.2}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            effectLayers: current.effectLayers.map((layer) =>
                              layer.id === selectedLayer.id
                                ? { ...layer, shimmer: Number(event.target.value) }
                                : layer,
                            ),
                          }))
                        }
                        step={0.02}
                        type="range"
                        value={selectedLayer.shimmer}
                      />
                    </label>
                  ) : null}

                  {selectedLayer.type === 'emboss' ? (
                    <label className="creator-field">
                      <span>
                        Рельеф:{' '}
                        {selectedLayer.relief === 0
                          ? 'нейтрально'
                          : selectedLayer.relief > 0
                            ? `выпуклость ${Math.round(selectedLayer.relief * 100)}%`
                            : `вдавленность ${Math.round(Math.abs(selectedLayer.relief) * 100)}%`}
                      </span>
                      <input
                        disabled={isLocked}
                        max={1}
                        min={-1}
                        onChange={(event) =>
                          updateDraft((current) => ({
                            ...current,
                            effectLayers: current.effectLayers.map((layer) =>
                              layer.id === selectedLayer.id
                                ? { ...layer, relief: Number(event.target.value) }
                                : layer,
                            ),
                          }))
                        }
                        step={0.02}
                        type="range"
                        value={selectedLayer.relief}
                      />
                    </label>
                  ) : null}

                  <label className="creator-field">
                    <span>Размер кисти: {brushSize}px</span>
                    <input
                      disabled={isLocked}
                      max={64}
                      min={6}
                      onChange={(event) => setBrushSize(Number(event.target.value))}
                      step={1}
                      type="range"
                      value={brushSize}
                    />
                  </label>

                  <label className="creator-field">
                    <span>Мягкость кисти: {Math.round(brushSoftness * 100)}%</span>
                    <input
                      disabled={isLocked}
                      max={1}
                      min={0}
                      onChange={(event) => setBrushSoftness(Number(event.target.value))}
                      step={0.02}
                      type="range"
                      value={brushSoftness}
                    />
                  </label>
                </div>

                <div className="creator-tools">
                  <button
                    className={`action-button ${!eraseMode ? 'action-button--solid' : ''}`}
                    disabled={isLocked}
                    onClick={() => setEraseMode(false)}
                    type="button"
                  >
                    Кисть
                  </button>
                  <button
                    className={`action-button ${eraseMode ? 'action-button--solid' : ''}`}
                    disabled={isLocked}
                    onClick={() => setEraseMode(true)}
                    type="button"
                  >
                    Стирание
                  </button>
                  <button
                    className="action-button"
                    disabled={!selectedLayer.maskUrl}
                    onClick={() =>
                      triggerAssetDownload(
                        selectedLayer.maskUrl,
                        `${selectedLayer.type}-mask.${inferAssetExtension(
                          selectedLayer.maskUrl,
                          'png',
                        )}`,
                      )
                    }
                    type="button"
                  >
                    Скачать маску
                  </button>
                  <button
                    className="action-button"
                    disabled={isLocked}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        effectLayers: current.effectLayers.map((layer) =>
                          layer.id === selectedLayer.id ? { ...layer, maskUrl: '' } : layer,
                        ),
                      }))
                    }
                    type="button"
                  >
                    Очистить маску
                  </button>
                </div>

                <div className="creator-row">
                  <label className="creator-field">
                    <span>Загрузить готовую маску</span>
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      disabled={isLocked}
                      onChange={(event) =>
                        void handleEffectMaskUpload(event.target.files?.[0] ?? null, selectedLayer.id)
                      }
                      type="file"
                    />
                  </label>

                  <div className="creator-field">
                    <span>Подсказка по размеру</span>
                    <small>
                      Лучше загружать маску в пропорции карточки: 688x964 px для редактора или
                      1024x1536 px для максимально четкого рендера. Белое включает ламинацию.
                    </small>
                  </div>
                </div>

                <CardEffectMaskEditor
                  brushSize={brushSize}
                  brushSoftness={brushSoftness}
                  disabled={isLocked}
                  eraseMode={eraseMode}
                  layer={selectedLayer}
                  onMaskChange={(maskUrl) =>
                    updateDraft((current) => ({
                      ...current,
                      effectLayers: current.effectLayers.map((layer) =>
                        layer.id === selectedLayer.id ? { ...layer, maskUrl } : layer,
                      ),
                    }))
                  }
                  previewImage={previewImage}
                />
              </div>
            ) : null}
          </div>

          <div className="creator-status">
            <span>Статус: {PROPOSAL_STATUS_LABELS[proposal.status]}</span>
            {proposal.rejectionReason ? <span>Причина отказа: {proposal.rejectionReason}</span> : null}
            {statusMessage ? <span>{statusMessage}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
