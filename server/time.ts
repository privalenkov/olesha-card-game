export function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

export function getDayKey(date: Date, timeZone: string): string {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(
    2,
    '0',
  )}`;
}

export function getNextResetAt(date: Date, timeZone: string): Date {
  const parts = getZonedParts(date, timeZone);
  const secondsSinceMidnight = parts.hour * 3600 + parts.minute * 60 + parts.second;
  const millisecondsUntilMidnight =
    (24 * 3600 - secondsSinceMidnight) * 1000 - date.getMilliseconds();

  return new Date(date.getTime() + Math.max(millisecondsUntilMidnight, 1000));
}
