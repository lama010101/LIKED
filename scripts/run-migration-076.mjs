/**
 * Run migration 076 via Supabase REST API.
 * Creates "Unsorted" folder for each user with unassigned nodes,
 * then backfills all unassigned nodes into that folder.
 */

const SUPABASE_URL = "https://lzkzfqshnjvlzosnntfx.supabase.co";
const SERVICE_KEY = "sb_secret_c9c26MCCVj-8hLbQT-fsNg_V5QgnBni";
const HEADERS = {
  "apikey": SERVICE_KEY,
  "Authorization": `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function api(path, options = {}) {
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...rest,
    headers: { ...HEADERS, ...optHeaders },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  // 1. Get all active nodes
  const { data: allNodes } = await api("/nodes?select=id,owner_id&deleted_at=is.null");
  console.log(`Total active nodes: ${allNodes.length}`);

  // 2. Get all folder_edges (node_id -> folder_id mappings)
  const { data: allEdges } = await api("/folder_edges?select=node_id,folder_id");
  console.log(`Total folder_edges: ${allEdges.length}`);

  // 3. Find unassigned nodes (not in any folder_edge)
  const folderedNodeIds = new Set(allEdges.map(e => e.node_id));
  const unassignedNodes = allNodes.filter(n => !folderedNodeIds.has(n.id));
  console.log(`Unassigned nodes: ${unassignedNodes.length}`);

  // 4. Group by owner
  const byOwner = {};
  for (const n of unassignedNodes) {
    if (!byOwner[n.owner_id]) byOwner[n.owner_id] = [];
    byOwner[n.owner_id].push(n.id);
  }
  console.log(`Users with unassigned nodes: ${Object.keys(byOwner).length}`);

  // 5. Get existing folders to check for "Unsorted"
  const { data: existingFolders } = await api("/folders?select=id,name,owner_id&deleted_at=is.null");
  const unsortedByOwner = {};
  for (const f of existingFolders) {
    if (f.name === "Unsorted") {
      unsortedByOwner[f.owner_id] = f.id;
    }
  }

  // 6. For each user: create "Unsorted" folder if needed, then backfill
  for (const [ownerId, nodeIds] of Object.entries(byOwner)) {
    let folderId = unsortedByOwner[ownerId];

    // Create "Unsorted" folder if it doesn't exist
    if (!folderId) {
      const { status, data } = await api("/folders", {
        method: "POST",
        headers: { "Prefer": "return=representation" },
        body: JSON.stringify({
          name: "Unsorted",
          owner_id: ownerId,
          parent_folder_id: null,
          is_project: true,
          color_hex: "#6b7280",
        }),
      });
      if (status !== 201) {
        console.error(`Failed to create Unsorted folder for ${ownerId}:`, data);
        continue;
      }
      folderId = data[0].id;
      console.log(`Created Unsorted folder for user ${ownerId}: ${folderId}`);

      // Insert folder_tree self-reference
      const treeRes = await api("/folder_tree", {
        method: "POST",
        body: JSON.stringify({
          folder_id: folderId,
          ancestor_id: folderId,
          depth: 0,
        }),
      });
      if (treeRes.status !== 201) {
        console.error(`Failed to insert folder_tree for ${folderId}:`, treeRes.data);
      }
    } else {
      console.log(`User ${ownerId} already has Unsorted folder: ${folderId}`);
    }

    // Batch insert folder_edges for all unassigned nodes
    const edges = nodeIds.map(nid => ({ node_id: nid, folder_id: folderId }));
    const { status: edgeStatus, data: edgeData } = await api("/folder_edges", {
      method: "POST",
      headers: { "Prefer": "return=representation,resolution=ignore-duplicates" },
      body: JSON.stringify(edges),
    });
    if (edgeStatus >= 400) {
      console.error(`Failed to insert folder_edges for user ${ownerId}:`, edgeData);
    } else {
      console.log(`  Linked ${nodeIds.length} nodes to Unsorted folder`);
    }
  }

  // 7. Verify: check for any remaining unassigned nodes
  const { data: finalNodes } = await api("/nodes?select=id,owner_id&deleted_at=is.null");
  const { data: finalEdges } = await api("/folder_edges?select=node_id");
  const finalFoldered = new Set(finalEdges.map(e => e.node_id));
  const stillUnassigned = finalNodes.filter(n => !finalFoldered.has(n.id));
  console.log(`\nVerification: ${stillUnassigned.length} nodes still unassigned`);
  if (stillUnassigned.length > 0) {
    console.log("Still unassigned:", stillUnassigned.slice(0, 5));
  } else {
    console.log("SUCCESS: All active nodes are now in at least one folder.");
  }
}

main().catch(console.error);
