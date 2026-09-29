import { importYouTubeActivity } from "@/app/lib/actions/youtubeImport";

/** Pulls every liked YouTube video via /api/youtube/likes pages and imports
 *  each through the atomic import_url RPC. Client-side orchestration only —
 *  the per-video write (cause + edges) stays inside the RPC transaction.
 *  Returns the number of videos processed. */
export async function runYouTubeImport(onCount?: (n: number) => void): Promise<number> {
  let pageToken: string | undefined;
  let count = 0;
  do {
    const res = await fetch(`/api/youtube/likes${pageToken ? `?pageToken=${pageToken}` : ""}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `likes fetch failed (${res.status})`);
    for (const v of body.videos ?? []) {
      await importYouTubeActivity({
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.title ?? "",
        description: v.description ?? "",
        channelTitle: v.channelTitle ?? "",
        categoryId: v.categoryId ?? "",
        thumbnailUrl: v.thumbnail ?? null,
      }).catch(() => {});
      count += 1;
      onCount?.(count);
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return count;
}
