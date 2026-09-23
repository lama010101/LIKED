# SPEC V8 — Semantic / AI Search (incl. chat-box NL queries)

**Status:** spec proposal — no implementation. (§41.6 explicit deferral;
no pgvector extension, no embedding columns exist today.)

## Scope

Two surfaces share one retrieval core:

1. **Search box** — semantic search over "my library + friend-shared"
   content beyond keyword match.
2. **Chat-box NL queries** — free text such as *"show me everything I
   liked about Thailand"* or *"recipes Sara sent me"*.

## Non-negotiable visibility rule

Retrieval candidates = **edge-visible node_ids computed in SQL only**.
Concretely: the candidate CTE is `nodes n` where `n.deleted_at IS NULL
AND (n.owner_id = auth.uid() OR EXISTS (edges e ON e.node_id = n.id AND
e.user_id = auth.uid()))` plus the blocks exclusion — identical to
`get_feed`'s `visible_nodes`. Embeddings index the same set; a
similarity hit on a node the caller has no edge to must be impossible
**by construction** (the index rows carry the node set only; the query
joins candidates through the visible-set predicate inside the RPC).
No post-filtering in TypeScript. Friend-shared content already arrives
as edge rows, so it is in scope automatically.

## Retrieval + answer format (chat box)

Recommended answer shape — **structured result list, not generated prose**:

- Answer = list of card results (same VideoCard grid/row as feed),
  each rendered from the real node row.
- Optional short generated *summary line* above the grid ("24 cards
  mention Thailand") — text is generated, cards are cited.
- **Citation:** every claimable item is a node card; if a generated
  sentence references a card it links to it (`node_id` → card detail).
  No citations to non-edge-visible nodes can exist (see rule above).
- Folder results: when ≥N hits share a folder, a "folder chip" row may
  lead the answer — still just node_ids grouped by existing
  `folder_edges` membership (HORIZ-001 pattern), never a synthesized
  folder entity.

Open product question (owner): is a conversational multi-turn thread
required, or single-shot Q→results? Spec assumes single-shot.

## Provider options

### Option A — Supabase pgvector + edge function embeddings (recommended)

- `pgvector` extension on the existing Postgres; `node_embeddings`
  table (`node_id uuid PK, embedding vector(1536), updated_at`) written
  inside `import_url`/`create_node` transaction or by a deferred trigger.
- Embedding model via OpenRouter (key already wired) or a HF endpoint.
- Retrieval: one SECURITY DEFINER RPC `search_nodes_semantic(p_query_vec,
  p_limit)` = visible-set CTE ⨝ `embedding <=> query` — auth.uid() inside,
  no p_user_id (G-1 pattern from COMPLETE-APP-002).
- Cost: pgvector free; embedding = per-token API cost at write time only
  (queries embed the query string, ~$0.0001/query).

### Option B — external vector store (Pinecone/Weaviate/etc.)

- More moving parts: out-of-sync risk with edges (revocation must purge
  index), extra vendor + egress. Only justified if pgvector proves too
  slow at >1M nodes — not v1.

## Write-path trigger options

1. **Import-time (recommended):** embed `title + description + tags`
   inside the same write transaction (async task off the RPC — embedding
   latency must not block the write; write `pending` → worker fills).
2. **Batch backfill:** nightly job for rows missing embeddings; required
   anyway for existing corpus.

## Open questions for owner

- Chat answer: cards-only vs cards+generated summary (above).
- Query surface placement: header search box expands vs separate chat
  affordance.
- Whether friend-shared-only queries ("from Sara") are v1 or v1.1.
