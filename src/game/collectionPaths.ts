export function buildCollectionPath(playerSlug: string, searchParams?: URLSearchParams) {
  const query = searchParams?.toString();
  return `/collection/${encodeURIComponent(playerSlug)}${query ? `?${query}` : ''}`;
}

export function buildCollectionCardPath(playerSlug: string, cardInstanceId: string) {
  const searchParams = new URLSearchParams({
    card: cardInstanceId,
  });

  return buildCollectionPath(playerSlug, searchParams);
}

export function buildCollectionCardShareUrl(
  origin: string,
  playerSlug: string,
  cardInstanceId: string,
) {
  return new URL(buildCollectionCardPath(playerSlug, cardInstanceId), origin).toString();
}
