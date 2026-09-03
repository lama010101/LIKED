// Behavioral RLS test for migration 087 on the LIKED remote DB.
// Signs in as the demo user with the ANON key (so RLS applies) and checks:
//   - users table: should see only self + friends (scoped) vs all users (old USING(true))
//   - folder_edges: should see only own/shared folders (scoped) vs all (old USING(true))
//   - group_members: should see only own groups (scoped) vs all (old USING(true))
//
// Read-only: only SELECT queries. No writes.
//
// Usage: node scripts/verify-rls-087-behavioral.mjs

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
const LIKED_REF = "lzkzfqshnjvlzosnntfx";

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or SUPABASE_SECRET_KEY");
  process.exit(1);
}
if (!SUPABASE_URL.includes(LIKED_REF)) {
  console.error(`ABORT: URL does not match LIKED project (${LIKED_REF}). Got: ${SUPABASE_URL}`);
  process.exit(3);
}

// Service client (bypasses RLS) — used to get ground truth counts.
const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client (RLS applies) — used to test what a real user sees.
const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_EMAIL = "demo-curator@liked.app";
const DEMO_PASSWORD = "DemoCurator2024!";

async function main() {
  console.log(`OK: Target is LIKED project (${LIKED_REF}).\n`);

  // 1. Get ground truth: total user count (service role).
  const { count: totalUsers } = await serviceClient
    .from("users")
    .select("*", { count: "exact", head: true });
  console.log(`Ground truth: ${totalUsers} total users in DB.\n`);

  // 2. Sign in as demo user with anon key.
  const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });

  if (authError || !authData.user) {
    console.error("Failed to sign in as demo user:", authError?.message);
    console.error("Make sure the demo user is seeded (npm run seed:demo).");
    process.exit(2);
  }

  const userId = authData.user.id;
  console.log(`Signed in as demo user: ${userId}\n`);

  // 3. Test: users table SELECT via anon client (RLS applies).
  console.log("=== RLS Test: users table ===");
  const { data: visibleUsers, error: usersError } = await anonClient
    .from("users")
    .select("id, display_name");

  if (usersError) {
    console.log(`  Error: ${usersError.message}`);
    console.log("  (If RLS blocks all access, this may indicate a policy issue.)");
  } else {
    console.log(`  Demo user can see ${visibleUsers.length} of ${totalUsers} total users.`);
    if (visibleUsers.length === totalUsers && totalUsers > 1) {
      console.log("  ⚠ WARNING: Demo user sees ALL users — old USING(true) policy may still be active (087 NOT applied).");
    } else if (visibleUsers.length <= 1) {
      console.log("  ✓ Demo user sees only self (or self + friends) — scoped policy appears active (087 likely applied).");
    } else {
      console.log(`  Demo user sees ${visibleUsers.length} users — likely self + friends with edges (scoped policy active).`);
    }
    // Show which users are visible.
    for (const u of visibleUsers.slice(0, 10)) {
      const isSelf = u.id === userId ? " (self)" : "";
      console.log(`    - ${u.display_name}${isSelf}`);
    }
    if (visibleUsers.length > 10) console.log(`    ... and ${visibleUsers.length - 10} more`);
  }
  console.log("");

  // 4. Test: folder_edges table SELECT via anon client.
  console.log("=== RLS Test: folder_edges table ===");
  const { count: totalFolderEdges } = await serviceClient
    .from("folder_edges")
    .select("*", { count: "exact", head: true });

  const { data: visibleFolderEdges, error: folderEdgesError } = await anonClient
    .from("folder_edges")
    .select("folder_id, node_id");

  if (folderEdgesError) {
    console.log(`  Error: ${folderEdgesError.message}`);
  } else {
    console.log(`  Ground truth: ${totalFolderEdges} total folder_edges.`);
    console.log(`  Demo user can see ${visibleFolderEdges.length} folder_edges.`);
    if (visibleFolderEdges.length === totalFolderEdges && totalFolderEdges > 0) {
      console.log("  ⚠ WARNING: Demo user sees ALL folder_edges — old USING(true) policy may still be active (087 NOT applied).");
    } else {
      console.log("  ✓ Scoped — demo user sees only own/shared folder_edges (087 likely applied).");
    }
  }
  console.log("");

  // 5. Test: group_members table SELECT via anon client.
  console.log("=== RLS Test: group_members table ===");
  const { count: totalGroupMembers } = await serviceClient
    .from("group_members")
    .select("*", { count: "exact", head: true });

  const { data: visibleGroupMembers, error: groupMembersError } = await anonClient
    .from("group_members")
    .select("group_id, user_id");

  if (groupMembersError) {
    console.log(`  Error: ${groupMembersError.message}`);
  } else {
    console.log(`  Ground truth: ${totalGroupMembers} total group_members.`);
    console.log(`  Demo user can see ${visibleGroupMembers.length} group_members.`);
    if (visibleGroupMembers.length === totalGroupMembers && totalGroupMembers > 0) {
      console.log("  ⚠ WARNING: Demo user sees ALL group_members — old USING(true) policy may still be active (087 NOT applied).");
    } else {
      console.log("  ✓ Scoped — demo user sees only own group memberships (087 likely applied).");
    }
  }
  console.log("");

  // 6. Summary.
  console.log("=== SUMMARY ===");
  const usersLeak = visibleUsers && visibleUsers.length === totalUsers && totalUsers > 1;
  const folderEdgesLeak = visibleFolderEdges && visibleFolderEdges.length === totalFolderEdges && totalFolderEdges > 0;
  const groupMembersLeak = visibleGroupMembers && visibleGroupMembers.length === totalGroupMembers && totalGroupMembers > 0;

  if (usersLeak || folderEdgesLeak || groupMembersLeak) {
    console.log("RESULT: RLS scoping (087) appears NOT fully applied — some tables still expose all rows.");
    if (usersLeak) console.log("  - users: leaks all rows");
    if (folderEdgesLeak) console.log("  - folder_edges: leaks all rows");
    if (groupMembersLeak) console.log("  - group_members: leaks all rows");
    process.exit(1);
  } else {
    console.log("RESULT: RLS scoping (087) appears applied — all tested tables show scoped results.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
