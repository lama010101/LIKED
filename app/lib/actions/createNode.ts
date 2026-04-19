"use server";

/**
 * Server action for node creation (P8-T02, PRD §15.1 + §22).
 *
 * Flow:
 *   1. Authenticate the caller.
 *   2. Invoke the `extract-node-metadata` Edge Function using the user's
 *      JWT-scoped server client so the function can identify the caller
 *      for rate-limit + activity_log purposes (§15.1 #4).
 *   3. Pass the metadata into `createNode`, which fires the
 *      `create_node_with_metadata` RPC — a single Postgres transaction
 *      that inserts the node, sort cache, and tag edges.
 *   4. On Edge Function failure (timeout, network, 5xx), fall back to
 *      defaults: title = url or first 120 chars of text, no tags,
 *      no thumbnail.
 */

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  createNode,
  DuplicateNodeError,
  type NodeMetadata,
} from "@/lib/db/nodes";

export type CreateNodeResult =
  | { ok: true; nodeId: string }
  | { ok: false; error: string; code?: "duplicate" | "invalid" | "unknown" };

export interface CreateNodeInput {
  url?: string | null;
  textContent?: string | null;
  languageCode?: string | null;
}

const EDGE_FUNCTION_NAME = "extract-node-metadata";
const EDGE_FUNCTION_TIMEOUT_MS = 10_000;

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function createNodeAction(
  input: CreateNodeInput
): Promise<CreateNodeResult> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated", code: "invalid" };
  }

  const url = input.url?.trim() || null;
  const text = input.textContent?.trim() || null;
  if (!url && !text) {
    return { ok: false, error: "Please enter a URL or text.", code: "invalid" };
  }
  if (url && !isValidUrl(url)) {
    return { ok: false, error: "Invalid URL.", code: "invalid" };
  }

  // Resolve user's preferred language — fall back to 'en' for now since the
  // profile language preference isn't exposed in the user row yet.
  const userLang = (input.languageCode ?? "en").slice(0, 8);

  // 2. Invoke Edge Function (never throws — wrap in try/catch + timeout).
  let metadata: NodeMetadata | undefined;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT_MS);
    try {
      const { data, error } = await supabase.functions.invoke(
        EDGE_FUNCTION_NAME,
        {
          body: {
            url,
            text_content: text,
            user_language_code: userLang,
          },
        }
      );
      if (!error && data && typeof data === "object") {
        // Edge Function contract (§15.1):
        //   { title, thumbnail_key?, language_code, suggested_tags[], ... }
        const d = data as Record<string, unknown>;
        metadata = {
          title: typeof d.title === "string" ? d.title : null,
          thumbnailKey:
            typeof d.thumbnail_key === "string" ? d.thumbnail_key : null,
          languageCode:
            typeof d.language_code === "string" ? d.language_code : userLang,
          suggestedTags: Array.isArray(d.suggested_tags)
            ? (d.suggested_tags as unknown[]).filter(
                (t): t is string => typeof t === "string"
              )
            : [],
        };
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Edge Function failure → fall through with metadata undefined so
    // createNode applies defaults (PRD §15.1 #3).
    metadata = undefined;
  }

  // 3. Persist — single transaction via RPC.
  try {
    const node = await createNode(
      user.id,
      { url: url ?? undefined, textContent: text ?? undefined },
      metadata
    );
    revalidatePath("/feed");
    return { ok: true, nodeId: node.id };
  } catch (err) {
    if (err instanceof DuplicateNodeError) {
      return {
        ok: false,
        error: "This URL already exists in your feed.",
        code: "duplicate",
      };
    }
    const message = err instanceof Error ? err.message : "Failed to create node.";
    return { ok: false, error: message, code: "unknown" };
  }
}
