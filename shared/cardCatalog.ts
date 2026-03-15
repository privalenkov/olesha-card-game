import type { CardDefinition } from '../src/game/types.js';

const DEFAULT_CARD_IMAGE_URL = 'https://i.redd.it/jdwr5cmggbgg1.png';

const rawCards: Array<Omit<CardDefinition, 'id' | 'urlImage'>> = [
  {
    title: 'Подруб по расписанию',
    rarity: 'common',
    description: 'Включает эфир — и делает вид, что так было задумано. [TG]',
    stats: { power: 71, cringe: 5, fame: 44, rarityScore: 30, humor: 76 },
  },
  {
    title: 'Тёплое интро',
    rarity: 'common',
    description:
      'Десять минут разгона — чтобы вы успели заварить чай и морально приготовиться. [TG]',
    stats: { power: 63, cringe: 6, fame: 20, rarityScore: 33, humor: 78 },
  },
  {
    title: 'Чат-комментарии',
    rarity: 'common',
    description: 'Нужен, чтобы под постами было «о чём-то поговорить». [2IP]',
    stats: { power: 56, cringe: 9, fame: 48, rarityScore: 34, humor: 65 },
  },
  {
    title: 'Одноразовая игра',
    rarity: 'common',
    description: 'Прошёл, обсудил, забыл — следующая уже в очереди. [YT]',
    stats: { power: 59, cringe: 22, fame: 21, rarityScore: 34, humor: 56 },
  },
  {
    title: 'Хоррор-рулетка',
    rarity: 'common',
    description: 'Если страшно — значит, контент работает. [MEM]',
    stats: { power: 57, cringe: 16, fame: 42, rarityScore: 31, humor: 62 },
  },
  {
    title: 'Амбассадор сваги',
    rarity: 'common',
    description: 'Свага официально подтверждена сторонними наблюдателями. [TT]',
    stats: { power: 63, cringe: 12, fame: 50, rarityScore: 34, humor: 64 },
  },
  {
    title: 'Партнёр Twitch',
    rarity: 'common',
    description: 'Знак качества: партнёрский статус без попыток казаться «скромным». [TT]',
    stats: { power: 62, cringe: 14, fame: 62, rarityScore: 34, humor: 60 },
  },
  {
    title: 'Акаунты по списку',
    rarity: 'common',
    description: 'Twitch, YouTube, Telegram — святой триптих присутствует. [Fandom]',
    stats: { power: 61, cringe: 9, fame: 41, rarityScore: 30, humor: 68 },
  },
  {
    title: 'Сговор с Совергоном',
    rarity: 'common',
    description: 'Коллабы в списке есть — значит, история случалась. [Fandom]',
    stats: { power: 59, cringe: 14, fame: 54, rarityScore: 33, humor: 57 },
  },
  {
    title: 'Рэнделл-полка',
    rarity: 'common',
    description: 'Часть совместных видео лежит «у Рэнделла». [Fandom]',
    stats: { power: 58, cringe: 19, fame: 40, rarityScore: 34, humor: 54 },
  },
  {
    title: 'Канал 2011',
    rarity: 'common',
    description: 'Дата создания канала — как отметка “ветеран интернета”. [SB]',
    stats: { power: 61, cringe: 7, fame: 43, rarityScore: 31, humor: 70 },
  },
  {
    title: 'Русский язык эфира',
    rarity: 'common',
    description: 'Когда смысл важнее субтитров. [TT]',
    stats: { power: 58, cringe: 17, fame: 37, rarityScore: 34, humor: 55 },
  },
  {
    title: 'ЭТО Я, ЛЁХА!',
    rarity: 'common',
    description: 'Сигнал в эфир: «я здесь, вы тоже здесь». [TG]',
    stats: { power: 62, cringe: 11, fame: 33, rarityScore: 32, humor: 70 },
  },
  {
    title: 'Застрял в сети Интернет',
    rarity: 'common',
    description: 'Классический сюжет: герой против Wi-Fi (и побеждает… иногда). [TG]',
    stats: { power: 60, cringe: 14, fame: 59, rarityScore: 34, humor: 57 },
  },
  {
    title: 'Саб-день',
    rarity: 'common',
    description: 'Отмечает «ан(саб-день)» как будто это государственный праздник. [TG]',
    stats: { power: 60, cringe: 16, fame: 48, rarityScore: 33, humor: 57 },
  },
  {
    title: 'Новинки года',
    rarity: 'common',
    description: '«Первый в году, единственный и неповторимый» — по версии ведущего. [TG]',
    stats: { power: 53, cringe: 23, fame: 35, rarityScore: 34, humor: 46 },
  },
  {
    title: 'Среда — пора вливаться',
    rarity: 'common',
    description: 'В середине недели включается инфо-развлекательный режим. [TG]',
    stats: { power: 59, cringe: 18, fame: 34, rarityScore: 34, humor: 56 },
  },
  {
    title: 'Погода в Питере',
    rarity: 'common',
    description: 'Упоминается как фактор, влияющий на настроение и интро. [TG]',
    stats: { power: 61, cringe: 7, fame: 65, rarityScore: 34, humor: 57 },
  },
  {
    title: 'Хтоническая дрянь',
    rarity: 'common',
    description: 'Ищем странное — потому что обычного вокруг слишком много. [TG]',
    stats: { power: 55, cringe: 22, fame: 31, rarityScore: 34, humor: 52 },
  },
  {
    title: 'Вопросик на обсуждение',
    rarity: 'common',
    description: 'Коллеги, выведите вопросик — и дальше всё как по маслу. [TG]',
    stats: { power: 62, cringe: 9, fame: 42, rarityScore: 31, humor: 67 },
  },
  {
    title: 'Опрос: финальные результаты',
    rarity: 'common',
    description: 'Голосование решает судьбу реальности (ну, почти). [TG]',
    stats: { power: 62, cringe: 7, fame: 45, rarityScore: 31, humor: 71 },
  },
  {
    title: 'Выселяем?',
    rarity: 'common',
    description: 'Одна из культурных опций в голосовании. [TG]',
    stats: { power: 59, cringe: 16, fame: 41, rarityScore: 34, humor: 56 },
  },
  {
    title: 'Скручиваем унитаз',
    rarity: 'common',
    description: 'Вариант наказания, достойный абсурдиста. [TG]',
    stats: { power: 57, cringe: 22, fame: 35, rarityScore: 34, humor: 53 },
  },
  {
    title: 'Лоботомия 17:00',
    rarity: 'common',
    description: 'Ежегодная профилактика мозга — по расписанию. [TG]',
    stats: { power: 61, cringe: 6, fame: 49, rarityScore: 33, humor: 70 },
  },
  {
    title: 'Olesha Trauma Team',
    rarity: 'common',
    description: 'Если есть команда травмы — значит, будет повод. [TG]',
    stats: { power: 54, cringe: 23, fame: 31, rarityScore: 34, humor: 51 },
  },
  {
    title: 'Жизнь после бана',
    rarity: 'common',
    description: 'Небольшой апокалипсис, поданный как ситком. [TG]',
    stats: { power: 63, cringe: 10, fame: 51, rarityScore: 34, humor: 63 },
  },
  {
    title: 'Справедливость восстановлена',
    rarity: 'common',
    description: 'Три слова, после которых чат обычно верит в чудеса. [TG]',
    stats: { power: 58, cringe: 21, fame: 57, rarityScore: 34, humor: 43 },
  },
  {
    title: 'Рынок стабилизирован',
    rarity: 'common',
    description: 'Глобальная экономическая победа — в одном предложении. [TG]',
    stats: { power: 63, cringe: 9, fame: 61, rarityScore: 34, humor: 60 },
  },
  {
    title: 'Протокол «Баззилион»',
    rarity: 'common',
    description: 'Когда цифры должны звучать страшно, но это всё ещё клоунада. [TG]',
    stats: { power: 56, cringe: 25, fame: 58, rarityScore: 34, humor: 31 },
  },
  {
    title: 'Совет директоров',
    rarity: 'common',
    description: 'Корпоративный лор, который появляется из воздуха. [TG]',
    stats: { power: 57, cringe: 22, fame: 37, rarityScore: 34, humor: 44 },
  },
  {
    title: 'Анти-кризисный комитет',
    rarity: 'common',
    description: 'Любая мелочь превращается в “кризис”, чтобы было веселей. [TG]',
    stats: { power: 55, cringe: 19, fame: 39, rarityScore: 34, humor: 57 },
  },
  {
    title: 'Важные Люди',
    rarity: 'common',
    description: 'После звонка вопросики решаются «на высшем уровне». [TG]',
    stats: { power: 56, cringe: 19, fame: 57, rarityScore: 34, humor: 43 },
  },
  {
    title: 'Шах и мат',
    rarity: 'common',
    description: 'Фраза-пломба: закрывает дискуссию одним щелчком. [TG]',
    stats: { power: 61, cringe: 16, fame: 54, rarityScore: 34, humor: 52 },
  },
  {
    title: 'Политика в пятницу',
    rarity: 'common',
    description: 'Отдельный формат: “политика в пятницу” без лишних иллюзий. [TG]',
    stats: { power: 63, cringe: 6, fame: 44, rarityScore: 34, humor: 73 },
  },
  {
    title: 'Пятница 13-е',
    rarity: 'common',
    description: 'Когда даже календарь подыгрывает драме. [TG]',
    stats: { power: 61, cringe: 14, fame: 44, rarityScore: 34, humor: 58 },
  },
  {
    title: 'Теперь это девчачий стрим',
    rarity: 'common',
    description: 'Смена вывески без смены настроения. [TG]',
    stats: { power: 62, cringe: 9, fame: 52, rarityScore: 33, humor: 66 },
  },
  {
    title: 'Пост-предложка',
    rarity: 'common',
    description: 'Сообщество приносит контент, ведущий делает вид, что удивлён. [TG]',
    stats: { power: 50, cringe: 26, fame: 52, rarityScore: 34, humor: 26 },
  },
  {
    title: 'Набережные Челны: точка спавна',
    rarity: 'common',
    description: 'По фан-вики, стартовая локация героя — Набережные Челны. [Fandom]',
    stats: { power: 54, cringe: 22, fame: 22, rarityScore: 34, humor: 60 },
  },
  {
    title: '1997-й: год выпуска',
    rarity: 'common',
    description: 'Год указан в фан-вики; в комплекте — блогер/стример. [Fandom]',
    stats: { power: 59, cringe: 8, fame: 46, rarityScore: 34, humor: 78 },
  },
  {
    title: 'Однояйцевый близнец',
    rarity: 'common',
    description:
      'Фан-вики упоминает близнеца — идеальный повод для “двойного” мема. [2IP]',
    stats: { power: 54, cringe: 20, fame: 62, rarityScore: 34, humor: 40 },
  },
  {
    title: 'Питомец Утер',
    rarity: 'common',
    description: 'Фан-вики называет питомца Утером — лор пополнен. [2IP]',
    stats: { power: 61, cringe: 9, fame: 65, rarityScore: 34, humor: 55 },
  },
  {
    title: 'Краска стынет',
    rarity: 'common',
    description: 'Ну чё, чат — пока не застыло. [RD]',
    stats: { power: 59, cringe: 9, fame: 55, rarityScore: 34, humor: 61 },
  },
  {
    title: 'Воришки',
    rarity: 'common',
    description: 'Коротко. Ласково. Осуждающе. [RD]',
    stats: { power: 62, cringe: 12, fame: 55, rarityScore: 34, humor: 61 },
  },
  {
    title: 'Внимание, пУтер',
    rarity: 'common',
    description: 'Тревога уровня “домашний питомец в кадре”. [RD]',
    stats: { power: 60, cringe: 12, fame: 39, rarityScore: 33, humor: 68 },
  },
  {
    title: 'Без комментариев',
    rarity: 'common',
    description: 'Лучший комментарий — его отсутствие (и мем живёт). [RD]',
    stats: { power: 63, cringe: 7, fame: 49, rarityScore: 33, humor: 69 },
  },
  {
    title: 'Вот неудача!',
    rarity: 'common',
    description: 'Когда реальность не сотрудничает — обвиняем судьбу. [RD]',
    stats: { power: 62, cringe: 12, fame: 43, rarityScore: 34, humor: 64 },
  },
  {
    title: 'Как они это ртом говорят',
    rarity: 'common',
    description: 'Риторический вопрос, который сам по себе уже шутка. [RD]',
    stats: { power: 55, cringe: 21, fame: 54, rarityScore: 34, humor: 39 },
  },
  {
    title: 'ЧЗХ??! Это реально??',
    rarity: 'common',
    description: 'Проверка реальности: если сомневаешься — ты уже в теме. [RD]',
    stats: { power: 55, cringe: 20, fame: 37, rarityScore: 34, humor: 53 },
  },
  {
    title: 'Ава поменялась',
    rarity: 'common',
    description: 'Если изменилось фото — значит, изменилась эпоха. [RD]',
    stats: { power: 61, cringe: 7, fame: 56, rarityScore: 34, humor: 63 },
  },
  {
    title: 'Скромный фанарт',
    rarity: 'common',
    description: 'Классика: “скромно” ровно настолько, насколько позволяет гордость. [RD]',
    stats: { power: 52, cringe: 25, fame: 35, rarityScore: 34, humor: 48 },
  },
  {
    title: 'Крайне сомнительные вещи',
    rarity: 'uncommon',
    description: 'Название говорит само за себя — и это тревожный комплимент. [Fandom]',
    stats: { power: 57, cringe: 41, fame: 43, rarityScore: 47, humor: 52 },
  },
  {
    title: 'Самая циничная игра',
    rarity: 'uncommon',
    description: 'Когда цинизм — не недостаток, а жанровая настройка. [Fandom]',
    stats: { power: 54, cringe: 38, fame: 65, rarityScore: 49, humor: 55 },
  },
  {
    title: 'Это видео стоило бы удалить',
    rarity: 'uncommon',
    description: 'Если автор сам так называет — возможно, там правда стыдно. [Fandom]',
    stats: { power: 50, cringe: 45, fame: 66, rarityScore: 49, humor: 43 },
  },
  {
    title: 'Почта России в карантин',
    rarity: 'uncommon',
    description: 'Коллаб-хроника доставки “как в кино, но хуже”. [Fandom]',
    stats: { power: 55, cringe: 42, fame: 55, rarityScore: 49, humor: 46 },
  },
  {
    title: 'Как не стоит доставлять',
    rarity: 'uncommon',
    description: 'Инструкция-предупреждение, которую всё равно игнорируют. [Fandom]',
    stats: { power: 57, cringe: 35, fame: 54, rarityScore: 49, humor: 67 },
  },
  {
    title: 'Jack Box: шутки свои',
    rarity: 'uncommon',
    description: 'Игра, где стыд делится на всех — равномерно. [Fandom]',
    stats: { power: 55, cringe: 43, fame: 42, rarityScore: 46, humor: 46 },
  },
  {
    title: 'Лоботомия: спасибо, чат',
    rarity: 'uncommon',
    description: 'Когда зрители великодушны и выбирают “помягче”. [TG]',
    stats: { power: 56, cringe: 42, fame: 57, rarityScore: 49, humor: 45 },
  },
  {
    title: '30-часовая лоботомия',
    rarity: 'uncommon',
    description: 'Опция из опроса, после которой хочется выйти из интернета. [TG]',
    stats: { power: 59, cringe: 33, fame: 70, rarityScore: 49, humor: 65 },
  },
  {
    title: 'Унитаз-экстракция',
    rarity: 'uncommon',
    description: 'Скрутить и унести — звучит как квест из плохого сна. [TG]',
    stats: { power: 56, cringe: 38, fame: 64, rarityScore: 47, humor: 55 },
  },
  {
    title: 'Квартирный трибунал',
    rarity: 'uncommon',
    description: 'Выселение обсуждают как будто это патч-ноут. [TG]',
    stats: { power: 57, cringe: 33, fame: 71, rarityScore: 49, humor: 63 },
  },
  {
    title: 'Ничего не случилось',
    rarity: 'uncommon',
    description: 'Официальная формула отрицания: “4 марта 2026 ничего не было”. [TG]',
    stats: { power: 52, cringe: 48, fame: 58, rarityScore: 49, humor: 31 },
  },
  {
    title: 'Саб-день: выпуск №34',
    rarity: 'uncommon',
    description: 'Когда счётчик важнее смысла — чистая традиция. [TG]',
    stats: { power: 56, cringe: 44, fame: 51, rarityScore: 49, humor: 40 },
  },
  {
    title: 'Интро-разговоры',
    rarity: 'uncommon',
    description: 'Сюжет “докатились до жизни такой” как постоянная рубрика. [TG]',
    stats: { power: 54, cringe: 41, fame: 73, rarityScore: 49, humor: 40 },
  },
  {
    title: 'Баззилион процентов',
    rarity: 'uncommon',
    description: 'Угроза тарифами — гипербола уровня “мультивселенная”. [TG]',
    stats: { power: 57, cringe: 33, fame: 60, rarityScore: 48, humor: 70 },
  },
  {
    title: 'Разбан за минуту',
    rarity: 'uncommon',
    description: 'История, рассказанная так, будто мир спасли. [TG]',
    stats: { power: 55, cringe: 38, fame: 47, rarityScore: 46, humor: 62 },
  },
  {
    title: 'Куплинов-пародия',
    rarity: 'uncommon',
    description: 'Включает чужой стиль так уверенно, что вы начинаете сомневаться. [TG]',
    stats: { power: 57, cringe: 35, fame: 50, rarityScore: 45, humor: 70 },
  },
  {
    title: 'Оlesha Entertainment™',
    rarity: 'uncommon',
    description: 'Когда бренд звучит серьезно, но вспоминаешь, что это мем. [TG]',
    stats: { power: 56, cringe: 39, fame: 48, rarityScore: 47, humor: 58 },
  },
  {
    title: 'Лучший адвокат бренда',
    rarity: 'uncommon',
    description: 'Фанатская юриспруденция: защищает, даже если не просили. [RD]',
    stats: { power: 59, cringe: 31, fame: 69, rarityScore: 49, humor: 67 },
  },
  {
    title: 'Цире (псевдоним?)',
    rarity: 'uncommon',
    description: 'Слово-призрак: вроде понятно, а вроде и нет. [RD][MEM]',
    stats: { power: 55, cringe: 37, fame: 32, rarityScore: 45, humor: 71 },
  },
  {
    title: 'Цири в Mewgenics',
    rarity: 'uncommon',
    description: 'Кроссовер, который никто не заказывал, но все обсуждают. [RD][MEM]',
    stats: { power: 56, cringe: 35, fame: 44, rarityScore: 46, humor: 72 },
  },
  {
    title: 'CAIRN ИМБА',
    rarity: 'uncommon',
    description: 'Если игра “имба”, значит, будет спор на 40 минут. [RD]',
    stats: { power: 59, cringe: 33, fame: 70, rarityScore: 49, humor: 63 },
  },
  {
    title: 'Эх… лёха.',
    rarity: 'uncommon',
    description: 'Три точки — как эмоциональный отчёт о всём стриме. [RD]',
    stats: { power: 55, cringe: 45, fame: 52, rarityScore: 49, humor: 43 },
  },
  {
    title: 'Грибочек и побег от Патрика',
    rarity: 'uncommon',
    description: 'Сюрреализм: два Алексея, один Патрик, ноль контекста. [RD][MEM]',
    stats: { power: 52, cringe: 46, fame: 57, rarityScore: 49, humor: 35 },
  },
  {
    title: 'Правило: без спекуляций',
    rarity: 'uncommon',
    description: 'Сообщество само просит: не тащите “без контекста”. [RD]',
    stats: { power: 56, cringe: 33, fame: 68, rarityScore: 49, humor: 64 },
  },
  {
    title: 'Правило: границы',
    rarity: 'uncommon',
    description: 'Не лезь в личное — обсуждай контент. Банально, но полезно. [RD]',
    stats: { power: 55, cringe: 42, fame: 36, rarityScore: 45, humor: 60 },
  },
  {
    title: 'Коллеги, выводим вопросик',
    rarity: 'rare',
    description: 'Когда слово “коллеги” звучит, как предвестник странного решения. [TG]',
    stats: { power: 50, cringe: 67, fame: 48, rarityScore: 69, humor: 31 },
  },
  {
    title: 'Звонок важным людям',
    rarity: 'rare',
    description: 'Телефонный ритуал: пару гудков — и вселенная соглашается. [TG]',
    stats: { power: 49, cringe: 70, fame: 41, rarityScore: 69, humor: 27 },
  },
  {
    title: 'Директорский протокол',
    rarity: 'rare',
    description: 'Совет директоров собирается, чтобы решать… мемы. [TG]',
    stats: { power: 48, cringe: 72, fame: 31, rarityScore: 69, humor: 25 },
  },
  {
    title: 'Рынок стабилизирован: пресс-релиз',
    rarity: 'rare',
    description: 'Пишет как новость, ощущается как стендап. [TG]',
    stats: { power: 48, cringe: 74, fame: 38, rarityScore: 69, humor: 16 },
  },
  {
    title: 'Шах и мат, дискуссия',
    rarity: 'rare',
    description: 'Фраза-ловушка: спор окончен, потому что так сказали. [TG][MEM]',
    stats: { power: 49, cringe: 71, fame: 57, rarityScore: 69, humor: 19 },
  },
  {
    title: 'Жизнь после бана: сезон 2',
    rarity: 'rare',
    description: 'Если “бан” стал сериалом — значит, уровень кринжа вырос. [TG]',
    stats: { power: 47, cringe: 75, fame: 45, rarityScore: 69, humor: 10 },
  },
  {
    title: 'Скрутить унитаз и исчезнуть',
    rarity: 'rare',
    description: 'Награда за активность: бытовой сюр вместо доната. [TG]',
    stats: { power: 45, cringe: 75, fame: 71, rarityScore: 69, humor: 8 },
  },
  {
    title: 'Унитазный квест-лог',
    rarity: 'rare',
    description: 'Задание: “унеси предмет, который нельзя унести”. [TG][MEM]',
    stats: { power: 46, cringe: 73, fame: 62, rarityScore: 69, humor: 11 },
  },
  {
    title: 'Лоботомия: расширенная версия',
    rarity: 'rare',
    description: 'Профилактика мозга превращается в DLC. [TG]',
    stats: { power: 46, cringe: 74, fame: 54, rarityScore: 69, humor: 10 },
  },
  {
    title: '30 часов. Без наркоза. Шутка.',
    rarity: 'rare',
    description: 'Да, это мем. Нет, повторять не надо. [TG]',
    stats: { power: 48, cringe: 70, fame: 72, rarityScore: 69, humor: 11 },
  },
  {
    title: 'Куплиновская инфильтрация',
    rarity: 'rare',
    description: 'Пародия настолько точная, что становится неловко. [TG]',
    stats: { power: 47, cringe: 73, fame: 66, rarityScore: 69, humor: 7 },
  },
  {
    title: 'Цири когда стрим не вовремя',
    rarity: 'rare',
    description: 'Когда эфир включили ровно в тот момент, когда нельзя. [RD]',
    stats: { power: 46, cringe: 74, fame: 52, rarityScore: 69, humor: 10 },
  },
  {
    title: 'Цири когда дверь закрыта',
    rarity: 'rare',
    description: 'Состояние: “дверь закрыта, но тревога открыта”. [RD][MEM]',
    stats: { power: 46, cringe: 75, fame: 60, rarityScore: 69, humor: 2 },
  },
  {
    title: 'Цири когда клипот 4 уровня',
    rarity: 'rare',
    description: 'Термины летят быстрее, чем смысл успевает догнать. [RD]',
    stats: { power: 48, cringe: 71, fame: 64, rarityScore: 69, humor: 10 },
  },
  {
    title: 'Без комментариев (реж. стыд)',
    rarity: 'rare',
    description: 'Молчание как самый громкий крик. [RD]',
    stats: { power: 44, cringe: 75, fame: 68, rarityScore: 69, humor: 0 },
  },
  {
    title: 'Официальная лоботомия: бюрократия',
    rarity: 'epic',
    description:
      'Когда медицинский мем оформлен как госуслуга. Испанский стыд гарантирован. [TG]',
    stats: { power: 33, cringe: 90, fame: 79, rarityScore: 84, humor: 12 },
  },
  {
    title: 'Унитаз унесён в неизвестном направлении',
    rarity: 'epic',
    description: 'Предмет пропал, совесть тоже. Кринж-детектив. [TG]',
    stats: { power: 34, cringe: 89, fame: 86, rarityScore: 84, humor: 11 },
  },
  {
    title: 'Пятница 13-е: полит-слот',
    rarity: 'epic',
    description: 'Жанр “поговорим о серьёзном” в самый несерьёзный день. [TG]',
    stats: { power: 37, cringe: 86, fame: 78, rarityScore: 84, humor: 22 },
  },
  {
    title: 'Olesha Entertainment™: корпоративный ад',
    rarity: 'epic',
    description:
      'Совет директоров, протоколы и ноль реального бизнеса — чистая трагикомедия. [TG]',
    stats: { power: 33, cringe: 90, fame: 62, rarityScore: 84, humor: 21 },
  },
  {
    title: 'Крайне сомнительные вещи: ремастер',
    rarity: 'epic',
    description: 'Если сомнительно, зачем ремастер? Вот именно. [Fandom][MEM]',
    stats: { power: 27, cringe: 89, fame: 88, rarityScore: 84, humor: 7 },
  },
  {
    title: 'Это видео стоило бы удалить: реакция',
    rarity: 'epic',
    description: 'Смотришь — и чувствуешь, как архив стыда пополняется. [Fandom]',
    stats: { power: 37, cringe: 90, fame: 57, rarityScore: 84, humor: 30 },
  },
  {
    title: 'Cursed-эстетика: проклятые кадры',
    rarity: 'epic',
    description:
      'Сцена выглядит как “cursed image”: смешно и тревожно одновременно. [KYM][WP]',
    stats: { power: 30, cringe: 89, fame: 83, rarityScore: 84, humor: 12 },
  },
  {
    title: 'Blursed-момент',
    rarity: 'epic',
    description:
      'И смешно, и стыдно, и почему-то не закрывается вкладка. [KYM][WP][MEM]',
    stats: { power: 36, cringe: 85, fame: 83, rarityScore: 84, humor: 32 },
  },
  {
    title: 'ПРОКЛЯТО: Лоботомия Director’s Cut',
    rarity: 'veryrare',
    description:
      'Тот самый “cursed” контент: слишком странно, чтобы быть выдумкой, и слишком стыдно, чтобы пересматривать. [TG][KYM][WP]',
    stats: { power: 21, cringe: 99, fame: 62, rarityScore: 85, humor: 34 },
  },
  {
    title: 'ПРОКЛЯТО: Унитазный Лутбокс',
    rarity: 'veryrare',
    description:
      'Открываешь — и выпадает стыд. Момент “проклято” по определению. [TG][MEM]',
    stats: { power: 22, cringe: 100, fame: 76, rarityScore: 87, humor: 33 },
  },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export const cardPool: CardDefinition[] = rawCards.map((card, index) => ({
  id: `${slugify(card.title)}-${index + 1}`,
  urlImage: DEFAULT_CARD_IMAGE_URL,
  ...card,
}));

export const cardsByRarity = cardPool.reduce(
  (acc, card) => {
    acc[card.rarity].push(card);
    return acc;
  },
  {
    common: [] as CardDefinition[],
    uncommon: [] as CardDefinition[],
    rare: [] as CardDefinition[],
    epic: [] as CardDefinition[],
    veryrare: [] as CardDefinition[],
  },
);
