/**
 * Tag system database operations
 * P6-T01 implementation placeholder
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { Tag } from "@/lib/types/app";

export async function createTag(
  colorHex: string,
  translations: { languageCode: string; label: string }[]
): Promise<Tag> {
  const supabase = getSupabaseServiceClient();
  
  // TODO: Implement per P6-T01
  // 1. INSERT into tags (color_hex)
  // 2. INSERT into tag_translations for each language
  
  throw new Error("Not implemented - P6-T01");
}

export async function assignTagToNode(
  tagId: string,
  nodeId: string,
  requestingUserId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  
  // TODO: INSERT into tag_edges
  // Organizational only - no edge side-effects per PRD §6.6
  
  throw new Error("Not implemented");
}

export async function removeTagFromNode(
  tagId: string,
  nodeId: string,
  requestingUserId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  
  // TODO: DELETE from tag_edges
  
  throw new Error("Not implemented");
}

export async function getTagsForUser(userId: string): Promise<Tag[]> {
  const supabase = getSupabaseServiceClient();
  
  // TODO: Return all tags available to user with translations
  
  throw new Error("Not implemented");
}
