import { importYouTubeActivity } from "@/app/lib/actions/youtubeImport";

/** Pulls every liked YouTube video via /api/youtube/likes pages and imports
 *  each through the atomic import_url RPC. Client-side orchestration only —
 *  the per-video write (cause + edges) stays inside the RPC transaction.
 *  Returns the number of videos processed plus the created node ids
 *  (used by the caller to batch classification for grouped search). */
export async function runYouTubeImport(
  onCount?: (n: number) => void,
  shouldStop?: () => boolean
): Promise<{ count: number; nodeIds: string[] }> {
  let pageToken: string | undefined;
  let count = 0;
  const nodeIds: string[] = [];
  do {
    const res = await fetch(`/api/youtube/likes${pageToken ? `?pageToken=${pageToken}` : ""}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `likes fetch failed (${res.status})`);
    for (const v of body.videos ?? []) {
      if (shouldStop?.()) return { count, nodeIds };
      const imported = await importYouTubeActivity({
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.title ?? "",
        description: v.description ?? "",
        channelTitle: v.channelTitle ?? "",
        categoryId: v.categoryId ?? "",
        thumbnailUrl: v.thumbnail ?? null,
      }).catch(() => null);
      if (imported?.ok) nodeIds.push(imported.nodeId);
      count += 1;
      onCount?.(count);
    }
    pageToken = body.nextPageToken;
  } while (pageToken && !shouldStop?.());
  return { count, nodeIds };
}
