#!/usr/bin/env node
/**
 * Seed script — creates a fake "Demo Curator" test user with sample
 * cards and folders, then shares all cards with every existing user
 * so they appear in everyone's feed.
 *
 * Run: npm run seed:demo
 *
 * Idempotent: if the demo user already exists, it skips creation and
 * only shares any new cards with users who don't have edges yet.
 *
 * Requires: SUPABASE_SECRET_KEY in .env.local
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

import { config } from "dotenv";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Load .env.local
config({ path: join(root, ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Demo user config ───────────────────────────────────────────

const DEMO_EMAIL = "demo-curator@liked.app";
const DEMO_DISPLAY_NAME = "Demo Curator";
const DEMO_PASSWORD = "DemoCurator2024!";

// ── Sample cards ───────────────────────────────────────────────

const SAMPLE_CARDS = [
  {
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Rick Astley - Never Gonna Give You Up",
    description: "The official video for Never Gonna Give You Up by Rick Astley.",
    tags: ["YouTube", "Music", "Demo"],
  },
  {
    url: "https://github.com/vercel/next.js",
    title: "vercel/next.js: The React Framework for the Web",
    description: "Next.js enables you to create full-stack web applications by extending the latest React features.",
    tags: ["GitHub", "Programming", "Demo"],
  },
  {
    url: "https://www.figma.com/community/file/1234567890",
    title: "Figma Design System Template",
    description: "A comprehensive design system template for modern web apps.",
    tags: ["Figma", "Design", "Demo"],
  },
  {
    url: "https://stripe.com/docs/api",
    title: "Stripe API Reference",
    description: "The Stripe API is organized around REST. Accept payments and manage subscriptions online.",
    tags: ["Stripe", "API", "Demo"],
  },
  {
    url: "https://www.notion.so/help/guides",
    title: "Notion Guides — Build your workspace",
    description: "Learn how to build a workspace that fits your needs.",
    tags: ["Notion", "Productivity", "Demo"],
  },
  {
    url: "https://openai.com/blog/gpt-4",
    title: "GPT-4 — OpenAI",
    description: "GPT-4 is the latest milestone in OpenAI's effort in scaling up deep learning.",
    tags: ["OpenAI", "AI", "Demo"],
  },
  {
    url: "https://www.behance.net/gallery/123456789/Brand-Identity",
    title: "Brand Identity Design — Behance",
    description: "A complete brand identity project showcasing logo design, typography, and color systems.",
    tags: ["Behance", "Design", "Branding", "Demo"],
  },
  {
    url: "https://medium.com/@author/how-to-build-a-startup",
    title: "How to Build a Startup from Scratch",
    description: "A practical guide to building a startup, from idea to product-market fit.",
    tags: ["Medium", "Startup", "Business", "Demo"],
  },
];

// ── Sample folders ─────────────────────────────────────────────

const SAMPLE_FOLDERS = [
  { name: "Design Inspiration", color: "#ff6b6b", cardIndices: [2, 6] },
  { name: "Developer Resources", color: "#4ecdc4", cardIndices: [1, 3] },
  { name: "AI & Tech", color: "#a29bfe", cardIndices: [5, 7] },
  { name: "Music & Fun", color: "#fd79a8", cardIndices: [0] },
  { name: "Productivity Tools", color: "#00cec9", cardIndices: [4] },
];

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding demo curator user...\n");

  // 1. Create or find demo auth user
  let demoUserId;
  const { data: existingAuth } = await supabase.auth.admin.listUsers();
  const existing = existingAuth?.users?.find((u) => u.email === DEMO_EMAIL);

  if (existing) {
    demoUserId = existing.id;
    console.log(`  ✓ Demo user already exists: ${demoUserId}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: DEMO_DISPLAY_NAME },
    });

    if (error) {
      console.error("  ✗ Failed to create auth user:", error.message);
      process.exit(1);
    }

    demoUserId = data.user.id;
    console.log(`  ✓ Created auth user: ${demoUserId}`);
  }

  // 2. Ensure users table entry exists
  const { data: existingProfile } = await supabase
    .from("users")
    .select("id")
    .eq("id", demoUserId)
    .maybeSingle();

  if (!existingProfile) {
    const { error: profileError } = await supabase.from("users").insert({
      id: demoUserId,
      display_name: DEMO_DISPLAY_NAME,
      normalized_display_name: DEMO_DISPLAY_NAME.toLowerCase().replace(/\s+/g, "_"),
      language_code: "en",
    });

    if (profileError) {
      console.error("  ✗ Failed to create user profile:", profileError.message);
      process.exit(1);
    }
    console.log(`  ✓ Created user profile`);

    // Fix display name via RPC (trigger may have overridden it from email)
    await supabase.rpc("update_display_name", {
      p_user_id: demoUserId,
      p_display_name: DEMO_DISPLAY_NAME,
    });
  } else {
    // Ensure display name is correct (in case trigger overrode it)
    if (existingProfile.display_name !== DEMO_DISPLAY_NAME) {
      await supabase.rpc("update_display_name", {
        p_user_id: demoUserId,
        p_display_name: DEMO_DISPLAY_NAME,
      });
    }
    console.log(`  ✓ User profile already exists`);
  }

  // 3. Create folders
  console.log("\n📁 Creating folders...");
  const folderIds = {};

  for (const folder of SAMPLE_FOLDERS) {
    const { data: existingFolder } = await supabase
      .from("folders")
      .select("id")
      .eq("owner_id", demoUserId)
      .eq("name", folder.name)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingFolder) {
      folderIds[folder.name] = existingFolder.id;
      console.log(`  ✓ Folder already exists: ${folder.name}`);
    } else {
      const { data: newFolder, error } = await supabase
        .from("folders")
        .insert({
          name: folder.name,
          owner_id: demoUserId,
          parent_folder_id: null,
          is_project: false,
          color_hex: folder.color,
        })
        .select("id")
        .single();

      if (error) {
        console.error(`  ✗ Failed to create folder "${folder.name}":`, error.message);
        continue;
      }

      folderIds[folder.name] = newFolder.id;

      // Insert folder_tree self-reference
      await supabase
        .from("folder_tree")
        .insert({ folder_id: newFolder.id, ancestor_id: newFolder.id, depth: 0 });

      console.log(`  ✓ Created folder: ${folder.name}`);
    }
  }

  // 4. Create cards (nodes) via import_url RPC
  console.log("\n🎴 Creating cards...");
  const nodeIds = [];

  for (let i = 0; i < SAMPLE_CARDS.length; i++) {
    const card = SAMPLE_CARDS[i];

    // Check if node already exists (by URL + owner)
    const { data: existingNode } = await supabase
      .from("nodes")
      .select("id")
      .eq("url", card.url)
      .eq("owner_id", demoUserId)
      .is("deleted_at", null)
      .maybeSingle();

    if (existingNode) {
      nodeIds[i] = existingNode.id;
      console.log(`  ✓ Card already exists: ${card.title}`);
      continue;
    }

    const { data, error } = await supabase.rpc("import_url", {
      p_owner_id: demoUserId,
      p_url: card.url,
      p_title: card.title,
      p_thumbnail_key: null,
      p_language_code: "en",
      p_description: card.description,
      p_new_tag_labels: card.tags,
      p_existing_tag_ids: null,
      p_folder_id: null,
      p_note: null,
    });

    if (error) {
      console.error(`  ✗ Failed to create card "${card.title}":`, error.message);
      continue;
    }

    const nodeId = data?.[0]?.id;
    if (!nodeId) {
      console.error(`  ✗ No node ID returned for "${card.title}"`);
      continue;
    }

    nodeIds[i] = nodeId;
    console.log(`  ✓ Created card: ${card.title}`);
  }

  // 5. Add cards to folders
  console.log("\n📂 Adding cards to folders...");
  for (const folder of SAMPLE_FOLDERS) {
    const folderId = folderIds[folder.name];
    if (!folderId) continue;

    for (const idx of folder.cardIndices) {
      const nodeId = nodeIds[idx];
      if (!nodeId) continue;

      // Check if already in folder
      const { data: existingEdge } = await supabase
        .from("folder_edges")
        .select("folder_id")
        .eq("folder_id", folderId)
        .eq("node_id", nodeId)
        .maybeSingle();

      if (existingEdge) {
        console.log(`  ✓ Already in folder: ${SAMPLE_CARDS[idx].title} → ${folder.name}`);
        continue;
      }

      const { error } = await supabase.from("folder_edges").insert({
        folder_id: folderId,
        node_id: nodeId,
      });

      if (error) {
        console.error(`  ✗ Failed to add to folder: ${error.message}`);
      } else {
        console.log(`  ✓ Added: ${SAMPLE_CARDS[idx].title} → ${folder.name}`);
      }
    }
  }

  // 6. Share all cards with ALL existing users
  console.log("\n🔗 Sharing cards with all users...");

  const { data: allUsers } = await supabase
    .from("users")
    .select("id, display_name")
    .neq("id", demoUserId);

  if (!allUsers || allUsers.length === 0) {
    console.log("  ℹ No other users found to share with");
  } else {
    console.log(`  Found ${allUsers.length} other users`);

    for (let i = 0; i < nodeIds.length; i++) {
      const nodeId = nodeIds[i];
      if (!nodeId) continue;

      for (const user of allUsers) {
        // Check if edge already exists
        const { data: existingEdge } = await supabase
          .from("edges")
          .select("id")
          .eq("node_id", nodeId)
          .eq("user_id", user.id)
          .limit(1);

        if (existingEdge && existingEdge.length > 0) {
          continue; // already shared
        }

        // Share via direct_share RPC
        const { error } = await supabase.rpc("direct_share", {
          p_sharer_id: demoUserId,
          p_node_id: nodeId,
          p_target_user_id: user.id,
          p_permission: "view",
        });

        if (error) {
          console.error(`  ✗ Failed to share "${SAMPLE_CARDS[i].title}" with ${user.display_name}: ${error.message}`);
        }
      }

      console.log(`  ✓ Shared: ${SAMPLE_CARDS[i].title} → ${allUsers.length} users`);
    }
  }

  // 7. Summary
  console.log("\n" + "═".repeat(50));
  console.log("✅ Seed complete!\n");
  console.log(`   Demo user:    ${DEMO_DISPLAY_NAME} (${DEMO_EMAIL})`);
  console.log(`   User ID:      ${demoUserId}`);
  console.log(`   Cards:        ${nodeIds.filter(Boolean).length}`);
  console.log(`   Folders:      ${Object.keys(folderIds).length}`);
  console.log(`   Shared with:  ${allUsers?.length ?? 0} users`);
  console.log(`\n   All users will see these cards in their feed.`);
  console.log("═".repeat(50));
}

main().catch((err) => {
  console.error("\n💥 Seed failed:", err.message);
  process.exit(1);
});
