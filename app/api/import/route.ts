import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseClientFromBearer,
  extensionCorsHeaders,
  unauthenticatedResponse,
  optionsResponse,
} from "@/lib/supabase/bearer";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  importUrl,
  DuplicateNodeError,
  type ImportUrlInput,
} from "@/lib/db/nodes";
import { getOrCreateUnsortedFolder, addNodeToFolder } from "@/lib/db/folders";
import { extractNodeMetadata } from "@/lib/edge/extract-metadata";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/import — Chrome extension save orchestrator.
 *
 * Body (ImportRequest, see docs/06 §20):
 *   url: string                      (required, http/https)
 *   title?: string                   (advanced: override auto-extracted title)
 *   description?: string             (advanced: persisted to translations.description)
 *   note?: string                    (advanced: personal note, persisted to node_notes)
 *   folderId?: string                (advanced: assign to a collection)
 *   tagIds?: string[]                (advanced: existing tag IDs to attach)
 *   newTagLabels?: string[]          (advanced: new tag labels — created by RPC)
 *   clientMetadata?: { pageTitle?, pageDescription?, faviconUrl? }
 *
 * Response:
 *   { success: true, nodeId: string, alreadyExists: boolean }
 *   { success: false, code: 'unauthenticated'|'invalid'|'server', message: string }
 *
 * Metadata resolution (PRD §4 — "metadata captured automatically"):
 *   1. Call extract-node-metadata Edge Function for auto title/thumbnail/tags.
 *   2. If the user supplied a title in the Advanced form, it overrides the
 *      auto-extracted title.
 *   3. If the Edge Function fails, fall back to clientMetadata.pageTitle
 *      (sent by the extension from the active tab), then to the raw URL.
 *   4. New tag labels from the user are MERGED with Edge Function suggested
 *      tags (deduped) so both auto-suggested and user-added tags are applied.
 *
 * Write strategy (Rule 9 compliant — atomic):
 *   ALL writes go through the import_url RPC in a single Postgres transaction:
 *   node + sort_cache + cause + edge + new tag edges + existing tag edges +
 *   folder edge + node_notes + translations. No partial writes.
 */

interface ImportRequest {
  url: string;
  title?: string | null;
  description?: string | null;
  note?: string | null;
  folderId?: string | null;
  tagIds?: string[];
  newTagLabels?: string[];
  clientMetadata?: {
    pageTitle?: string;
    pageDescription?: string;
    faviconUrl?: string;
  };
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Coerce an unknown value to a string[] (or null if not an array of strings). */
function toStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string");
}

export async function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function POST(req: NextRequest) {
  const authed = await getSupabaseClientFromBearer(req);
  if (!authed) return unauthenticatedResponse(req);
  const { user, accessToken } = authed;
  const cors = extensionCorsHeaders(req);

  let body: ImportRequest;
  try {
    body = (await req.json()) as ImportRequest;
  } catch {
    return NextResponse.json(
      { success: false, code: "invalid", message: "Invalid JSON body." },
      { status: 400, headers: cors }
    );
  }

  const url = body.url?.trim() || "";
  if (!url) {
    return NextResponse.json(
      { success: false, code: "invalid", message: "URL is required." },
      { status: 400, headers: cors }
    );
  }
  if (!isValidUrl(url)) {
    return NextResponse.json(
      { success: false, code: "invalid", message: "This page cannot be saved." },
      { status: 400, headers: cors }
    );
  }

  // Validate array params (defensive — don't iterate strings char-by-char).
  const existingTagIds = toStringArray(body.tagIds) ?? [];
  const newTagLabels = (toStringArray(body.newTagLabels) ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  // Resolve user's preferred language for tag/description i18n.
  let languageCode = "en";
  try {
    const db = getSupabaseServiceClient();
    const { data: userRow } = await db
      .from("users")
      .select("language_code")
      .eq("id", user.id)
      .single();
    if (userRow?.language_code) {
      languageCode = userRow.language_code.slice(0, 8);
    }
  } catch {
    // Fall back to 'en' — non-fatal.
  }

  // 1. Call Edge Function for auto-extracted metadata (title, thumbnail, tags).
  //    Never throws — returns undefined on failure.
  const edgeMetadata = await extractNodeMetadata({
    url,
    languageCode,
    accessToken,
  });

  // 2. Merge metadata: user title overrides Edge Function title;
  //    user new tags are merged with Edge Function suggested tags (deduped);
  //    clientMetadata.pageTitle is the last-resort title fallback.
  const userTitle = body.title?.trim() || null;
  const clientTitle = body.clientMetadata?.pageTitle?.trim() || null;

  const mergedTitle = userTitle ?? edgeMetadata?.title ?? clientTitle;
  const edgeTags = edgeMetadata?.suggestedTags ?? [];
  const allNewTags = Array.from(new Set([...edgeTags, ...newTagLabels]));

  // 3. Build atomic import input.
  const importInput: ImportUrlInput = {
    url,
    title: mergedTitle,
    thumbnailKey: edgeMetadata?.thumbnailKey ?? null,
    languageCode: edgeMetadata?.languageCode ?? languageCode,
    description: body.description?.trim() || edgeMetadata?.description || null,
    newTagLabels: allNewTags,
    existingTagIds,
    folderId: body.folderId ?? null,
    note: body.note?.trim() || null,
  };

  // 4. Atomic write via import_url RPC (single transaction, no partial writes).
  let nodeId: string;
  try {
    const node = await importUrl(user.id, importInput);
    nodeId = node.id;
  } catch (err) {
    if (err instanceof DuplicateNodeError) {
      // Look up the existing active node for this (url, owner).
      try {
        const db = getSupabaseServiceClient();
        const { data: existing } = await db
          .from("nodes")
          .select("id")
          .eq("url", url)
          .eq("owner_id", user.id)
          .is("deleted_at", null)
          .maybeSingle();
        if (existing?.id) {
          return NextResponse.json(
            { success: true, nodeId: existing.id, alreadyExists: true },
            { status: 200, headers: cors }
          );
        }
      } catch {
        // Fall through to generic error.
      }
      return NextResponse.json(
        { success: false, code: "invalid", message: "Already saved." },
        { status: 409, headers: cors }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to save.";
    return NextResponse.json(
      { success: false, code: "server", message },
      { status: 500, headers: cors }
    );
  }

  // 5. If no folderId was provided, auto-assign to "Unsorted" folder
  //    so that no node is ever without a folder (home page shows only folders).
  if (!importInput.folderId) {
    try {
      const unsortedFolderId = await getOrCreateUnsortedFolder(user.id);
      await addNodeToFolder(nodeId, unsortedFolderId, user.id);
    } catch (folderErr) {
      // Non-fatal: node is created even if folder assignment fails.
      logger.error("Failed to auto-assign imported node to Unsorted folder:", folderErr);
    }
  }

  return NextResponse.json(
    { success: true, nodeId, alreadyExists: false },
    { status: 200, headers: cors }
  );
}
