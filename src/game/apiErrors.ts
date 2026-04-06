import type { ApiErrorResponse } from './types.js';

interface ApiErrorPreset {
  code: string;
  title: string;
  message: string;
}

export const API_ERROR_PRESETS = {
  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    title: 'Сервер недоступен',
    message: 'Не удалось связаться с сервером.',
  },
  REQUEST_FAILED: {
    code: 'REQUEST_FAILED',
    title: 'Ошибка сервера',
    message: 'Не удалось выполнить запрос к серверу.',
  },
  FORBIDDEN_ORIGIN_REQUIRED: {
    code: 'FORBIDDEN_ORIGIN',
    title: 'Недопустимый origin',
    message: 'Для этого запроса нужен корректный Origin.',
  },
  FORBIDDEN_ORIGIN_MUTATION: {
    code: 'FORBIDDEN_ORIGIN',
    title: 'Недопустимый origin',
    message: 'Недопустимый origin для мутации данных.',
  },
  RATE_LIMITED: {
    code: 'RATE_LIMITED',
    title: 'Слишком много запросов',
    message: 'Слишком много запросов. Подожди немного и попробуй снова.',
  },
  PAYLOAD_TOO_LARGE: {
    code: 'PAYLOAD_TOO_LARGE',
    title: 'Слишком большой файл',
    message: 'Файл слишком большой. Загрузи PNG, JPEG, WEBP или SVG размером до 5 МБ.',
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    title: 'Внутренняя ошибка',
    message: 'Внутренняя ошибка сервера.',
  },
  COLLECTION_NOT_FOUND: {
    code: 'COLLECTION_NOT_FOUND',
    title: 'Витрина не найдена',
    message: 'Витрина игрока не найдена.',
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    title: 'Нужна авторизация',
    message: 'Сначала войди через Google.',
  },
  NOTIFICATION_NOT_FOUND: {
    code: 'NOTIFICATION_NOT_FOUND',
    title: 'Уведомление не найдено',
    message: 'Уведомление не найдено.',
  },
  AUTH_NOT_CONFIGURED: {
    code: 'AUTH_NOT_CONFIGURED',
    title: 'Авторизация недоступна',
    message: 'Вход недоступен',
  },
  INVALID_OAUTH_STATE: {
    code: 'INVALID_OAUTH_STATE',
    title: 'Ошибка авторизации',
    message: 'Некорректное состояние входа',
  },
  GOOGLE_AUTH_UNAVAILABLE_TOKEN_EXCHANGE: {
    code: 'GOOGLE_AUTH_UNAVAILABLE',
    title: 'Google недоступен',
    message: 'Сервер не смог завершить вход через Google. Попробуй ещё раз позже.',
  },
  GOOGLE_AUTH_UNAVAILABLE_TOKEN_RESPONSE: {
    code: 'GOOGLE_AUTH_UNAVAILABLE',
    title: 'Google недоступен',
    message: 'Сервер получил неполный ответ от Google. Попробуй ещё раз позже.',
  },
  GOOGLE_AUTH_UNAVAILABLE_USERINFO: {
    code: 'GOOGLE_AUTH_UNAVAILABLE',
    title: 'Google недоступен',
    message: 'Сервер не смог получить профиль Google. Попробуй ещё раз позже.',
  },
  INVALID_GOOGLE_PROFILE: {
    code: 'INVALID_GOOGLE_PROFILE',
    title: 'Профиль Google отклонён',
    message: 'Google-профиль не прошёл валидацию.',
  },
  INVALID_NICKNAME: {
    code: 'INVALID_NICKNAME',
    title: 'Некорректный ник',
    message:
      'Ник должен быть длиной от 2 до 32 символов и содержать только английские буквы, цифры, дефис или нижнее подчеркивание.',
  },
  NICKNAME_TAKEN: {
    code: 'NICKNAME_TAKEN',
    title: 'Ник занят',
    message: 'Этот ник уже занят.',
  },
  INVALID_IMAGE: {
    code: 'INVALID_IMAGE',
    title: 'Некорректный файл',
    message: 'Нужен PNG, JPEG, WEBP или SVG размером до 5 МБ.',
  },
  UNSAFE_SVG: {
    code: 'UNSAFE_SVG',
    title: 'Небезопасный SVG',
    message: 'SVG содержит небезопасные конструкции. Удали скрипты, внешние ссылки и обработчики событий.',
  },
  PROPOSAL_NOT_FOUND_DRAFT: {
    code: 'PROPOSAL_NOT_FOUND',
    title: 'Черновик не найден',
    message: 'Черновик не найден.',
  },
  PROPOSAL_ACCESS_FORBIDDEN: {
    code: 'FORBIDDEN',
    title: 'Нет доступа',
    message: 'Нет доступа к этому черновику.',
  },
  PROPOSAL_EDIT_FORBIDDEN: {
    code: 'FORBIDDEN',
    title: 'Нет доступа',
    message: 'Нельзя редактировать чужую карточку.',
  },
  INVALID_PROPOSAL: {
    code: 'INVALID_PROPOSAL',
    title: 'Некорректная карточка',
    message:
      'Заполни заголовок, описание, базовый стиль и используй только выданные сервером эффекты.',
  },
  PROPOSAL_LOCKED_SAVE: {
    code: 'PROPOSAL_LOCKED',
    title: 'Карточка заблокирована',
    message: 'Эту карточку уже отправили на модерацию.',
  },
  PROPOSAL_SUBMIT_FORBIDDEN: {
    code: 'FORBIDDEN',
    title: 'Нет доступа',
    message: 'Нельзя отправить чужую карточку.',
  },
  IMAGE_REQUIRED: {
    code: 'IMAGE_REQUIRED',
    title: 'Нужно изображение',
    message: 'Сначала добавь изображение на карточку.',
  },
  MASK_REQUIRED: {
    code: 'MASK_REQUIRED',
    title: 'Нужны маски',
    message: 'У каждого добавленного treatment-слоя должна быть нарисована маска.',
  },
  PROPOSAL_LOCKED_SUBMIT: {
    code: 'PROPOSAL_LOCKED',
    title: 'Карточка заблокирована',
    message: 'Карточка уже отправлена или обработана.',
  },
  ADMIN_ONLY: {
    code: 'FORBIDDEN',
    title: 'Доступ запрещен',
    message: 'Доступ только для администратора.',
  },
  USER_NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    title: 'Пользователь не найден',
    message: 'Пользователь не найден.',
  },
  PROPOSAL_NOT_FOUND_ADMIN_APPROVE: {
    code: 'PROPOSAL_NOT_FOUND',
    title: 'Предложение не найдено',
    message: 'Предложение не найдено или уже обработано.',
  },
  INVALID_OVERRIDE: {
    code: 'INVALID_OVERRIDE',
    title: 'Некорректный override',
    message: 'Укажи корректную редкость и допустимый набор effects.',
  },
  PROPOSAL_NOT_FOUND_ADMIN_OVERRIDE: {
    code: 'PROPOSAL_NOT_FOUND',
    title: 'Черновик не найден',
    message: 'Черновик не найден или уже заблокирован.',
  },
  INVALID_REJECTION_REASON: {
    code: 'INVALID_REJECTION_REASON',
    title: 'Некорректная причина отказа',
    message: 'Укажи причину отказа длиной от 6 до 280 символов.',
  },
  PROPOSAL_NOT_FOUND_ADMIN_DELETE: {
    code: 'PROPOSAL_NOT_FOUND',
    title: 'Предложение не найдено',
    message: 'Предложение не найдено или уже обработано.',
  },
  CARD_NOT_FOUND_ADMIN_DELETE: {
    code: 'CARD_NOT_FOUND',
    title: 'Карточка не найдена',
    message: 'Карточка не найдена или уже удалена.',
  },
  PACK_LIMIT_REACHED: {
    code: 'PACK_LIMIT_REACHED',
    title: 'Пак недоступен',
    message: 'Сегодняшний пак уже открыт.',
  },
  NO_APPROVED_CARDS: {
    code: 'NO_APPROVED_CARDS',
    title: 'Нет карточек',
    message: 'Пока нет одобренных карточек для паков.',
  },
  NOT_FOUND_ROUTE: {
    code: 'NOT_FOUND',
    title: 'Маршрут не найден',
    message: 'Маршрут не найден.',
  },
} as const satisfies Record<string, ApiErrorPreset>;

export type ApiErrorPresetKey = keyof typeof API_ERROR_PRESETS;

export function buildApiErrorResponse(
  presetKey: ApiErrorPresetKey,
  options: {
    error?: string;
    message?: string;
    title?: string;
    extra?: Partial<ApiErrorResponse>;
  } = {},
) {
  const preset = API_ERROR_PRESETS[presetKey];

  return {
    error: options.error ?? preset.code,
    title: options.title ?? preset.title,
    message: options.message ?? preset.message,
    ...options.extra,
  } satisfies ApiErrorResponse;
}

export function getApiErrorTitle({
  error,
  title,
  statusCode,
}: {
  error?: string | null;
  title?: string | null;
  statusCode?: number | null;
}) {
  if (typeof title === 'string' && title.trim()) {
    return title.trim();
  }

  if (error === API_ERROR_PRESETS.NETWORK_ERROR.code) {
    return API_ERROR_PRESETS.NETWORK_ERROR.title;
  }

  if (statusCode === 413) {
    return API_ERROR_PRESETS.PAYLOAD_TOO_LARGE.title;
  }

  if (statusCode === 401) {
    return API_ERROR_PRESETS.UNAUTHORIZED.title;
  }

  if (statusCode === 403) {
    return API_ERROR_PRESETS.ADMIN_ONLY.title;
  }

  if (statusCode === 404) {
    return API_ERROR_PRESETS.NOT_FOUND_ROUTE.title;
  }

  if (statusCode === 429) {
    return API_ERROR_PRESETS.RATE_LIMITED.title;
  }

  return API_ERROR_PRESETS.REQUEST_FAILED.title;
}
