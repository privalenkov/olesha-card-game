export const RELEASE_NOTES_STORAGE_KEY = 'olesha.release-notes.seen-version';

// Bump this on each public update to show the modal once again for every user.
export const RELEASE_NOTES_VERSION = '2026-03-19-public-showcase';

export const RELEASE_NOTES = {
  version: RELEASE_NOTES_VERSION,
  versionLabel: 'Обновление 2026.03.19',
  title: 'Что нового',
  summary: 'Мы обновили витрину и профильные ссылки, чтобы ими было проще делиться.',
  items: [
    'У витрин появились публичные ссылки. Теперь можно просто открыть профиль игрока по прямому адресу.',
    'Ссылки на витрины стали чище и больше не используют # в адресной строке.',
    'Ники теперь работают только на английском, чтобы публичные ссылки были стабильными.',
    'Старые ники сервер автоматически переводит на транслит, а новым пользователям выдается ник формата Collector-XXXXXXXX.',
  ],
} as const;
