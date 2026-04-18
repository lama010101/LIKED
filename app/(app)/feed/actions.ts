"use server";

// TEMP: replaced by FAB in P5

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createNode, DuplicateNodeError } from "@/lib/db/nodes";

export interface AddNodeState {
  error: string | null;
  success: boolean;
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function addNode(
  _prevState: AddNodeState,
  formData: FormData
): Promise<AddNodeState> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated", success: false };
  }

  const raw = (formData.get("content") as string | null)?.trim() ?? "";

  if (!raw) {
    return { error: "Please enter a URL or text.", success: false };
  }

  try {
    if (isUrl(raw)) {
      await createNode(user.id, { url: raw });
    } else {
      await createNode(user.id, { textContent: raw });
    }
  } catch (err) {
    if (err instanceof DuplicateNodeError) {
      return { error: "This URL already exists in your feed.", success: false };
    }
    const message = err instanceof Error ? err.message : "Failed to create node.";
    return { error: message, success: false };
  }

  revalidatePath("/feed");
  return { error: null, success: true };
}
