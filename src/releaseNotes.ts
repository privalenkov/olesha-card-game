export const RELEASE_NOTES_STORAGE_KEY = 'olesha.release-notes.seen-version';

// Bump this on each public update to show the modal once again for every user.
export const RELEASE_NOTES_VERSION = '2026-03-19-public-showcase';

export const RELEASE_NOTES = {
  actionLabel: 'Понятно',
  backgroundColor: '#0D0E17',
  version: RELEASE_NOTES_VERSION,
  title: 'Обновление от 19.03.2026',
  sections: [
    {
      key: 'public-links',
      title: 'Публичные витрины',
      text:
        'У витрин появились прямые ссылки. Теперь профиль игрока можно открыть по чистому адресу без # в строке браузера.',
    },
    {
      key: 'nicknames',
      title: 'Стабильные никнеймы',
      text:
        'Ники теперь работают только на латинице, чтобы публичные ссылки были предсказуемыми. Старые ники сервер автоматически переводит в транслит, а новым пользователям выдается формат Collector-XXXXXXXX.',
    },
    {
      key: 'infra',
      title: 'Инфраструктура',
      text: 'Подготовили базовую инициализацию проекта под Amvera для дальнейшего деплоя.',
    },
  ],
} as const;
