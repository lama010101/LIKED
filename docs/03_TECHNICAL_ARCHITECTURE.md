# LIKED — Technical Architecture Document

**Version: 1.0**  
**Status: AUTHORITATIVE**  
**Companion to: 01_PRD.md v26.0 · 02_BUILD_PLAN.md v1.0**  
**Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS v3 · Supabase (Postgres + Auth + Storage + Edge Functions + Realtime)**

---

## PURPOSE

This document tells Cascade **how** to build LIKED — the specific patterns, constraints, and conventions that must be consistent across every session and every file. Every architectural decision here is made once and followed everywhere. Cascade must read this document before starting any task that touches routing, data fetching, state, authentication, or database writes.

---

## 1. PROJECT DIRECTORY STRUCTURE

```
liked/
├── app/
│   ├── (auth)/                     # Unauthenticated routes
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── signup/
│   │   │   └── page.tsx
│   │   └── callback/
│   │       └── route.ts            # OAuth callback handler
│   ├── (app)/                      # Authenticated routes (middleware-protected)
│   │   ├── layout.tsx              # App shell: top bar + bars + FAB
│   │   ├── feed/
│   │   │   └── page.tsx            # Main feed (Server Component)
│   │   └── trash/
│   │       └── page.tsx
│   ├── api/                        # Next.js API routes (server-side only)
│   │   ├── nodes/
│   │   │   └── route.ts
│   │   ├── share/
│   │   │   └── route.ts
│   │   └── ratings/
│   │       └── route.ts
│   ├── layout.tsx                  # Root layout (fonts, theme provider)
│   └── globals.css
├── components/
│   ├── ui/                         # Primitive, stateless UI components
│   │   ├── Avatar.tsx
│   │   ├── Slider.tsx
│   │   ├── Modal.tsx
│   │   ├── BottomSheet.tsx
│   │   ├── SideDrawer.tsx
│   │   ├── Toast.tsx
│   │   └── Chip.tsx
│   ├── feed/                       # Feed-specific components
│   │   ├── FeedContainer.tsx       # Client Component — owns feed state
│   │   ├── NodeCard.tsx
│   │   ├── MasonryGrid.tsx
│   │   ├── IconGrid.tsx
│   │   ├── ListView.tsx
│   │   ├── HorizontalRows.tsx
│   │   └── InfiniteCanvas.tsx
│   ├── bars/                       # Top bar + bottom bars
│   │   ├── TopBar.tsx
│   │   ├── FoldersBar.tsx
│   │   ├── UnifiedBar.tsx          # Friends + Groups combined bar
│   │   └── BreadcrumbNav.tsx
│   ├── modals/
│   │   ├── CardDetailModal.tsx
│   │   ├── CreateModal.tsx         # FAB modal (New Card + New Friend)
│   │   ├── ProfileModal.tsx
│   │   ├── TrashModal.tsx
│   │   └── SharePickerModal.tsx
│   └── dnd/                        # Drag-and-drop wrappers
│       ├── DndProvider.tsx
│       ├── DraggableCard.tsx
│       └── DroppableTarget.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # Browser Supabase client (singleton)
│   │   ├── server.ts               # Server Supabase client (cookies)
│   │   └── middleware.ts           # Session refresh helper
│   ├── db/                         # All database operations (server-side only)
│   │   ├── nodes.ts
│   │   ├── visibility.ts           # THE visibility query — canonical
│   │   ├── sharing.ts              # directShare, groupShare, unshare
│   │   ├── folders.ts
│   │   ├── friends.ts              # getFriendBar, sendFriendInvite, backfillFriendInvites
│   │   ├── tags.ts
│   │   ├── ratings.ts
│   │   └── users.ts
│   ├── hooks/                      # Client-side React hooks
│   │   ├── useFeed.ts
│   │   ├── useRealtime.ts
│   │   ├── useDragDrop.ts
│   │   └── useMultiSelect.ts
│   ├── store/                      # Client-side state (Zustand)
│   │   ├── feedStore.ts
│   │   ├── filterStore.ts
│   │   └── uiStore.ts
│   ├── types/
│   │   ├── database.ts             # Generated from Supabase schema
│   │   └── app.ts                  # App-level types
│   ├── utils/
│   │   ├── avatar.ts               # Deterministic avatar generator
│   │   ├── normalize.ts            # NFKC normalize, tag normalization
│   │   └── tagColors.ts            # 20-color palette + assignment logic
│   └── constants.ts                # Shared constants (rate limits, max depths, etc.)
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls.sql
│   │   └── 003_rls_policies.sql
│   ├── functions/
│   │   └── extract-node-metadata/
│   │       └── index.ts
│   └── seed.sql
├── middleware.ts                   # Next.js middleware (session refresh + auth guard)
├── tailwind.config.ts
├── tsconfig.json
└── .env.local
```

---

## 2. ROUTING ARCHITECTURE

### 2.1 Route Groups

| Route Group | Purpose | Auth Required |
|---|---|---|
| `(auth)` | Login, signup, OAuth callback | No |
| `(app)` | All authenticated surfaces | Yes — middleware redirects to /login |

### 2.2 Route Design Rules

- **No page-level navigation for content.** Cards, modals, folders, and groups open as overlays/modals on top of the feed page. No separate `/nodes/[id]` page.
- **Feed is the only content page.** All contexts (folder, friend, group, personal) are filter states on the feed, not separate routes.
- **URL reflects active context** via query params for shareability: `?folder=<id>`, `?friend=<id>`, `?tag=<id>`. The page component reads these params and passes them to the feed query.

### 2.3 Middleware

`middleware.ts` at project root handles two things in order:
1. **Session refresh**: call `supabase.auth.getUser()` on every request to keep the session alive.
2. **Auth guard**: if no session and route matches `/(app)/.*`, redirect to `/login`.

```typescript
// middleware.ts — structure (not full implementation)
export async function middleware(request: NextRequest) {
  const { supabase, response } = createSupabaseMiddlewareClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  
  const isAppRoute = request.nextUrl.pathname.startsWith('/feed') 
    || request.nextUrl.pathname.startsWith('/trash')
  
  if (isAppRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return response
}
```

---

## 3. SUPABASE CLIENT PATTERN

### 3.1 Two client types — never mix them

| Client | File | Used in | Cookie access |
|---|---|---|---|
| Browser client | `lib/supabase/client.ts` | Client Components, hooks | Yes |
| Server client | `lib/supabase/server.ts` | Server Components, API routes, `lib/db/*` | Yes (via Next.js cookies()) |

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/types/database'

export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
```

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/types/database'

export const createServerSupabaseClient = () => {
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
}
```

### 3.2 Service role client (write operations only)

For all write operations in `lib/db/*` that bypass RLS (cause + edge writes), use the service role client — server-side only, never exposed to the browser.

```typescript
// lib/supabase/service.ts — NEVER import in client components
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

export const createServiceClient = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!  // server-only env var, no NEXT_PUBLIC_ prefix
  )
```

**Rule: `SUPABASE_SERVICE_ROLE_KEY` must NEVER appear in any file that could be bundled for the browser.** Only use `createServiceClient()` inside `lib/db/*`, `app/api/*`, and Supabase Edge Functions.

---

## 4. DATA FETCHING PATTERN

### 4.1 Server Components fetch, Client Components display

```
Server Component (page.tsx)
  → calls lib/db/visibility.ts (server-side, service client)
  → passes data as props to Client Component (FeedContainer.tsx)
  → Client Component owns interactivity, state, real-time updates
```

**Feed page pattern:**
```typescript
// app/(app)/feed/page.tsx — Server Component
import { getVisibleNodes } from '@/lib/db/visibility'
import { getCurrentUser } from '@/lib/db/users'
import FeedContainer from '@/components/feed/FeedContainer'

export default async function FeedPage({ searchParams }) {
  const user = await getCurrentUser()
  const nodes = await getVisibleNodes(user.id, {
    folderId: searchParams.folder,
    friendId: searchParams.friend,
    tagIds: searchParams.tags?.split(','),
    sort: searchParams.sort ?? 'newest',
    view: searchParams.view ?? 'all'  // all | received | sent
  })
  
  return <FeedContainer initialNodes={nodes} currentUser={user} />
}
```

### 4.2 API Routes for mutations

All writes go through `app/api/` routes, not directly from the client to Supabase. This ensures:
- Service role key never reaches the browser
- All atomic transactions execute server-side
- Consistent error handling and logging

```typescript
// app/api/share/route.ts
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  
  const { nodeId, targetUserId } = await request.json()
  await directShare(user.id, nodeId, targetUserId)  // lib/db/sharing.ts
  return Response.json({ success: true })
}
```

### 4.3 No direct Supabase writes from client components

Client components must call `fetch('/api/...')` for all mutations. They must NOT call `supabase.from('edges').insert(...)` directly. The only Supabase calls allowed in client components are:
- `supabase.auth.*` (login, logout, getUser)
- `supabase.channel()` (realtime subscriptions — read only)
- `supabase.storage.from().getPublicUrl()` (reading public URLs)

---

## 5. STATE MANAGEMENT

### 5.1 Three layers of state

| Layer | Tool | Purpose |
|---|---|---|
| Server state | Next.js Server Components + fetch | Initial data load, SEO-relevant data |
| Client UI state | Zustand | Feed filters, selected items, modal open states, view mode |
| Real-time state | Supabase Realtime + Zustand | Live updates pushed from server |

### 5.2 Zustand store structure

Three stores — keep them separate, never merge.

**`feedStore.ts`** — nodes and feed data:
```typescript
interface FeedStore {
  nodes: Node[]
  setNodes: (nodes: Node[]) => void
  updateNode: (nodeId: string, updates: Partial<Node>) => void
  addNode: (node: Node) => void
  removeNode: (nodeId: string) => void
  
  sort: SortOption          // 'newest' | 'oldest' | 'most_shared' | 'highest_rated' | 'custom'
  setSort: (sort: SortOption) => void
  
  viewMode: ViewMode        // 'masonry' | 'icons' | 'list' | 'horizontal' | 'canvas'
  setViewMode: (mode: ViewMode) => void
}
```

**`filterStore.ts`** — active filter selections:
```typescript
interface FilterStore {
  activeFriendIds: string[]
  activeFolderIds: string[]
  activeTagIds: string[]
  feedView: 'all' | 'mine' | 'received'
  
  toggleFriend: (id: string) => void
  toggleFolder: (id: string) => void
  toggleTag: (id: string) => void
  setFeedView: (view: 'all' | 'mine' | 'received') => void
  clearAll: () => void
  hasActiveFilters: () => boolean
}
```

**`uiStore.ts`** — modal and panel states:
```typescript
interface UIStore {
  openCardId: string | null        // which card detail modal is open
  isCreateModalOpen: boolean
  isProfileModalOpen: boolean
  isTrashOpen: boolean
  multiSelectActive: boolean
  selectedItemIds: string[]
  
  openCard: (id: string) => void
  closeCard: () => void
  toggleMultiSelect: () => void
  toggleItemSelection: (id: string) => void
  clearSelection: () => void
}
```

### 5.3 No Context API for shared state

Do not use React Context for any state that multiple components need. Use Zustand. Context is permitted only for tightly scoped, local component trees (e.g., a drag-and-drop context wrapping only the feed grid).

---

## 6. REAL-TIME ARCHITECTURE

### 6.1 Single subscription manager

All Supabase Realtime subscriptions live in one hook: `lib/hooks/useRealtime.ts`. This hook is mounted once in `app/(app)/layout.tsx` (Client Component wrapper around the layout). It is never mounted in individual cards or list items.

```typescript
// lib/hooks/useRealtime.ts (structure)
export function useRealtime(userId: string) {
  const { addNode, updateNode } = useFeedStore()
  
  useEffect(() => {
    const channel = supabase
      .channel('app-realtime')
      
      // New share received
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'edges',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        // fetch the full node and add to feed store
        fetchNodeAndAddToFeed(payload.new.node_id)
      })
      
      // Rating updated on visible node
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'ratings'
      }, (payload) => {
        updateNodeRating(payload.new.node_id)
      })
      
      // Profile change (name/avatar)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'users'
      }, (payload) => {
        updateUserInFeed(payload.new)
      })
      
      .subscribe()
      
    return () => { supabase.removeChannel(channel) }
  }, [userId])
}
```

### 6.2 Realtime rules

- **One channel per app session.** Do not create per-component channels.
- **Always clean up.** Every `useEffect` that creates a channel must return a cleanup that removes it.
- **Never mutate DB from realtime handlers.** Realtime callbacks only update Zustand store.
- **Optimistic updates first.** On user action, update Zustand immediately, then call the API route. On API failure, roll back Zustand.

---

## 7. ATOMIC TRANSACTION PATTERN

All writes in `lib/db/*` that involve multiple tables MUST use a Postgres function (RPC) or explicit transaction block via the service role client. Do not chain multiple `.insert()` calls — they are not atomic.

### 7.1 Pattern: Supabase RPC for complex writes

For operations like `directShare` (3 inserts across 2 tables), create a Postgres function:

```sql
-- In a migration file
CREATE OR REPLACE FUNCTION direct_share(
  p_sharer_id UUID,
  p_node_id UUID,
  p_target_user_id UUID,
  p_depth INTEGER
) RETURNS void AS $$
DECLARE
  v_cause_id UUID;
BEGIN
  -- 1. Insert cause
  INSERT INTO causes (cause_type, created_by, metadata)
  VALUES (
    'direct_share',
    p_sharer_id,
    jsonb_build_object('node_id', p_node_id, 'target_user_id', p_target_user_id)
  )
  RETURNING id INTO v_cause_id;
  
  -- 2. Insert received edge
  INSERT INTO edges (node_id, user_id, cause_id, sender_id, direction, depth)
  VALUES (p_node_id, p_target_user_id, v_cause_id, p_sharer_id, 'received', p_depth);
  
  -- 3. Insert sent edge
  INSERT INTO edges (node_id, user_id, cause_id, sender_id, direction, depth)
  VALUES (p_node_id, p_sharer_id, v_cause_id, p_sharer_id, 'sent', p_depth);
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Then call from `lib/db/sharing.ts`:
```typescript
await serviceClient.rpc('direct_share', {
  p_sharer_id: sharerId,
  p_node_id: nodeId,
  p_target_user_id: targetUserId,
  p_depth: 1
})
```

### 7.2 All complex write operations → Postgres functions

| Operation | Postgres function name |
|---|---|
| Direct share | `direct_share(sharer_id, node_id, target_id, depth)` |
| Group share | `group_share(sharer_id, node_id, group_id)` |
| Group unshare | `group_unshare(sharer_id, node_id, group_id)` |
| Folder share | `folder_share(sharer_id, folder_id, target_user_ids, op_id)` |
| Folder unshare | `folder_unshare(op_id, requester_id)` |
| Create node + cache | `create_node(owner_id, url, text_content, title, thumbnail_key, language_code)` |
| Upsert rating + cache | `upsert_rating(user_id, node_id, score)` |

All these functions must be created in `supabase/migrations/004_write_functions.sql`.

### 7.3 Rollback guarantee

Postgres functions using `LANGUAGE plpgsql` are automatically transactional. Any error inside the function rolls back all statements in that call. No manual `BEGIN/COMMIT` needed when using RPC.

## 8. WRITE AUTHORITY RULE

Every write to the database must have an explicit authority level.

| Authority | Scope | Rule |
|---|---|---|
| **TypeScript (temporary)** | Single-table inserts with no side effects | Allowed now; must be migrated to RPC before the phase is complete |
| **SQL RPC (mandatory)** | Multiple tables, future expansion, permissions, sharing, tag auto-creation, cache updates | Required. No exceptions. |

**Decision tree:**

```
Does the write touch more than one table?
  → YES → RPC
Does the write have a side effect (cache update, permission change, edge creation)?
  → YES → RPC
Is this operation expected to grow (batching, bulk import, future permission checks)?
  → YES → RPC
Otherwise:
  → TypeScript allowed (flag for RPC migration in task notes)
```

**Consequence:** Mixing RPC and TypeScript for the same logical write path is forbidden. If a table is written from both sources, either merge them into one RPC or document the exception with a migration task ID.

---

## 9. ROW-LEVEL SECURITY (RLS) DESIGN

### 9.1 Philosophy

- RLS is a **safety net**, not the primary access control mechanism. The primary control is the server-side `lib/db/visibility.ts` query.
- All writes go through the service role (bypasses RLS) — this is intentional. Application logic enforces write rules.
- RLS on SELECT prevents direct client queries from bypassing visibility.

### 9.2 Policy table

| Table | SELECT policy | INSERT/UPDATE/DELETE |
|---|---|---|
| `nodes` | `owner_id = auth.uid() OR EXISTS(edge for user)` | Service role only |
| `edges` | `user_id = auth.uid() OR sender_id = auth.uid()` | Service role only |
| `causes` | `created_by = auth.uid()` | Service role only |
| `users` | Authenticated users can see all users | UPDATE: `id = auth.uid()` only |
| `ratings` | Authenticated | Service role for writes |
| `nodes_sort_cache` | Authenticated | Service role only |
| `folders` | `owner_id = auth.uid() OR EXISTS(folder access via edges)` | Service role only |
| `groups` | Member of group | Service role only |
| `notifications` | `user_id = auth.uid()` | Service role only |
| `activity_log` | `user_id = auth.uid()` | Service role only |
| `blocks` | `blocker_id = auth.uid()` | `blocker_id = auth.uid()` |
| `tags`, `tag_translations`, `tag_edges` | Authenticated | Service role only |
| `translations` | Authenticated | Service role only |

### 9.3 Critical RLS rule

**The `nodes` SELECT policy must mirror the visibility model exactly:**

```sql
CREATE POLICY "nodes_select" ON nodes
FOR SELECT USING (
  deleted_at IS NULL
  AND (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM edges e
      WHERE e.node_id = nodes.id
        AND e.user_id = auth.uid()
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = auth.uid() AND b.blocked_id = nodes.owner_id)
       OR (b.blocker_id = nodes.owner_id AND b.blocked_id = auth.uid())
  )
);
```

This policy must be **identical** to the query in `lib/db/visibility.ts`. If one changes, the other must change.

---

## 10. TYPESCRIPT TYPE SYSTEM

### 10.1 Database types — generated, never hand-written

Run `supabase gen types typescript --project-id <id> > lib/types/database.ts` after every schema migration. Never manually write types that mirror the database schema.

### 10.2 App types

`lib/types/app.ts` contains derived types used in components. They extend database types but add computed/joined fields:

```typescript
// lib/types/app.ts

import type { Database } from './database'

type NodeRow = Database['public']['Tables']['nodes']['Row']
type UserRow = Database['public']['Tables']['users']['Row']

// Node as returned by the visibility query — includes joined data
export interface VisibleNode extends NodeRow {
  avg_rating: number | null
  view_count: number
  share_count: number
  tags: TagWithLabel[]
  direction: 'sent' | 'received' | 'own'  // derived from edges
  sender: Pick<UserRow, 'id' | 'display_name' | 'avatar_key'> | null
}

export interface TagWithLabel {
  tag_id: string
  color_hex: string
  label: string  // resolved for user's language_code via fallback chain
}

export type SortOption = 'newest' | 'oldest' | 'most_shared' | 'highest_rated' | 'custom'
export type ViewMode = 'masonry' | 'icons' | 'list' | 'horizontal' | 'canvas'
export type FeedView = 'all' | 'mine' | 'received'
```

### 10.3 Never use `any`

TypeScript strict mode is on. `any` is banned. Use `unknown` + type narrowing where needed.

---

## 11. COMPONENT PATTERNS

### 11.1 Server vs Client Component decision tree

```
Does the component need:
  - onClick, onChange, useState, useEffect, drag events → Client Component ('use client')
  - Data from DB fetched at request time → Server Component (no directive)
  - Both → Server Component wraps Client Component, passes data as props
```

**Never add `'use client'` to a file that imports from `lib/db/*` or `lib/supabase/server.ts`.**

### 11.2 Modal pattern

All modals use a single `Modal` primitive from `components/ui/Modal.tsx`. They are rendered in a portal at the root layout level, never inside the component that triggers them. State controlling modal open/close lives in `uiStore.ts`.

```typescript
// components/ui/Modal.tsx
'use client'
import { createPortal } from 'react-dom'

export function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl">
        {children}
      </div>
    </div>,
    document.body
  )
}
```

### 11.3 Bottom sheet vs side drawer

Per PRD §14, context menus are Bottom-sheet on mobile, Side drawer on desktop. Use Tailwind breakpoints to swap:

```typescript
// components/ui/ContextMenu.tsx
'use client'
export function ContextMenu({ isOpen, onClose, children }) {
  return (
    <>
      {/* Mobile: bottom sheet */}
      <div className={`md:hidden fixed inset-x-0 bottom-0 z-50 transition-transform
        ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        {children}
      </div>
      {/* Desktop: side drawer */}
      <div className={`hidden md:block fixed right-0 top-0 h-full w-80 z-50 transition-transform
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {children}
      </div>
    </>
  )
}
```

### 11.4 Minimum tap target enforcement

All interactive elements must be at minimum 44×44px. Use this Tailwind utility class combination consistently:

```
className="min-h-[44px] min-w-[44px] flex items-center justify-center"
```

Apply this to every button, icon button, avatar, chip, and toggle.

---

## 12. DRAG-AND-DROP ARCHITECTURE

### 12.1 Library choice: @dnd-kit/core

Use `@dnd-kit/core` with `@dnd-kit/sortable`. It supports touch events natively, works in Next.js App Router, and does not require a DOM-based collision detection setup.

### 12.2 DnD provider placement

`DndProvider.tsx` wraps `FeedContainer.tsx` and the bars. It must NOT wrap the entire app layout — only the content area where drags originate and land.

### 12.3 Drag item types

Every draggable item has a `type` in its drag data:

```typescript
type DragData =
  | { type: 'node'; nodeId: string }
  | { type: 'friend'; userId: string }
  | { type: 'group'; groupId: string }
  | { type: 'tag'; tagId: string }
```

Drop handlers check `dragData.type` to decide what action to fire. This avoids ambiguous drop behavior.

### 12.4 Auto-expand on drag-pause

When a drag item hovers over a collapsed bar for >500ms, the bar auto-expands. Implement this with a `useRef` timer in the droppable bar component:

```typescript
const expandTimer = useRef<NodeJS.Timeout>()

const handleDragOver = () => {
  if (!isExpanded) {
    expandTimer.current = setTimeout(() => setIsExpanded(true), 500)
  }
}

const handleDragLeave = () => {
  clearTimeout(expandTimer.current)
}
```

### 12.5 Mobile touch events

`@dnd-kit` handles pointer events, which unifies mouse and touch. Do NOT add separate `onTouchStart`/`onTouchMove` handlers. Add the `TouchBackend` sensor configuration:

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 }  // prevent accidental drags on tap
  })
)
```

---

## 13. TAILWIND CONFIGURATION

### 13.1 Custom tokens (`tailwind.config.ts`)

```typescript
theme: {
  extend: {
    colors: {
      brand: {
        primary:      '#F5A623',   // --color-accent (amber)
        primaryHover: '#E09415',   // --color-accent-hover
      },
      surface: {
        barLight:  '#F8F9FA',    // Friends & Groups strip background, light
        barDark:   '#1C1C1E',    // Friends & Groups strip background, dark
        feedLight: '#FFFFFF',    // feed background, light
        feedDark:  '#0A0A0A',    // feed background, dark
        barSep:    '#E5E7EB',    // bar separator, light
        cardDark:  '#1C1C1E',    // card background, dark
      },
      // Feed filter tab + card direction badge tokens (PRD §11.2a)
      // Reference via CSS custom properties (--color-mine / --color-received).
      // Never hardcode these hex values in components — always use the CSS token.
      filtered: {
        all:      '#8E8E93',   // --color-all: neutral grey (All tab)
        mine:     '#F5A623',   // --color-mine: amber (Mine tab + own card badge)
        received: '#3B82F6',   // --color-received: blue (Received tab + received badge)
      },
    },
    zIndex: {
      bars:    '10',  // --z-bars:    Friends strip + bars
      topBar:  '20',  // --z-top-bar: top navigation bar
      fab:     '30',  // --z-fab:     floating action button
      modal:   '40',  // --z-modal:   card detail modal
      sheet:   '50',  // --z-sheet:   bottom sheets
      toast:   '60',  // --z-toast:   undo toasts
      overlay: '70',  // --z-overlay: drag overlay
    },
    animation: {
      wobble: 'wobble 0.3s ease-in-out infinite',
    },
    keyframes: {
      wobble: {
        '0%, 100%': { transform: 'rotate(-2deg)' },
        '50%':      { transform: 'rotate(2deg)' },
      },
    },
  },
}
```

### 13.2 CSS custom properties (`app/globals.css`)

All design tokens are also defined as CSS custom properties so they can be used in non-Tailwind contexts (e.g., inline styles, SVG, Canvas):

```css
:root {
  --color-feed:           #ffffff;
  --color-bar:            #F8F9FA;
  --color-bar-sep:        #E5E7EB;
  --color-card:           #ffffff;
  --color-accent:         #F5A623;
  --color-accent-hover:   #E09415;
  --color-accent-shadow:  rgba(245, 166, 35, 0.4);
  --color-all:            #8E8E93;
  --color-mine:           #F5A623;   /* same as --color-accent */
  --color-received:       #3B82F6;
  --z-bars:    10;
  --z-top-bar: 20;
  --z-fab:     30;
  --z-modal:   40;
  --z-sheet:   50;
  --z-toast:   60;
  --z-overlay: 70;
}
.dark {
  --color-feed: #0A0A0A;
  --color-bar:  #1C1C1E;
  --color-bar-sep: #3A3A3C;
  --color-card: #1C1C1E;
}
```

**Critical:** `--color-mine` and `--color-received` are defined ONCE and used for BOTH feed filter tabs AND card direction badges. Never hardcode these hex values in component code.

### 13.3 Dark mode

Use `class` strategy (not `media`):
```typescript
darkMode: 'class'
```

Theme toggle in Profile Modal adds/removes `dark` class on `<html>`. Persisted to `localStorage`.

### 13.4 Tailwind class discipline

- Never use arbitrary values (`w-[347px]`) for layout dimensions — use the spacing scale.
- Arbitrary values are allowed only for brand-specific measurements explicitly stated in the PRD (e.g., `bottom-[24px]` for FAB positioning).
- All animations are defined in `tailwind.config.ts`, not inline `style` props.
- Z-index values must use Tailwind classes (`z-fab`, `z-modal`, etc.) or `var(--z-*)` tokens — never raw integers.

---

## 14. SUPABASE STORAGE CONVENTIONS

### 14.1 Buckets

| Bucket | Contents | Access |
|---|---|---|
| `avatars` | User profile pictures | Public (readable without auth) |
| `thumbnails` | Node thumbnail images | Public |

Both buckets are public-readable. Write access is service-role only.

### 14.2 Key naming conventions

```
avatars/{userId}/{timestamp}.{ext}          # user avatars
thumbnails/{nodeId}/{timestamp}.{ext}       # node thumbnails
```

### 14.3 URL construction

Never store full public URLs. Store only the path key. Construct URLs at display time:

```typescript
// lib/utils/avatar.ts
export function getStorageUrl(bucket: 'avatars' | 'thumbnails', key: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${key}`
}
```

---

## 15. EDGE FUNCTION CONVENTIONS

### 15.1 Function: `extract-node-metadata`

Located at `supabase/functions/extract-node-metadata/index.ts`.

**Environment variables available inside Edge Functions:**
- `SUPABASE_URL` (auto-injected)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-injected)
- `SUPABASE_ANON_KEY` (auto-injected)

**Pattern: Edge Function must NOT write to DB.** It returns data to the calling server route, which writes everything in one transaction. This is non-negotiable — the function is a pure data extractor.

### 15.2 Calling Edge Functions from API routes

```typescript
// app/api/nodes/route.ts (inside POST handler)
const { data, error } = await serviceClient.functions.invoke('extract-node-metadata', {
  body: { url, text_content, user_language_code: user.language_code }
})

if (error) {
  // Degrade gracefully — create node with defaults
  metadata = { title: url ?? text_content?.slice(0, 120), suggested_tags: [] }
} else {
  metadata = data
}

// Now do all DB writes atomically
await serviceClient.rpc('create_node_with_metadata', { ...metadata, owner_id: user.id })
```

---

## 16. ERROR HANDLING CONVENTIONS

### 16.1 API route errors

All API routes return consistent JSON error shapes:

```typescript
// Success
Response.json({ success: true, data: result })

// Client error (bad input, unauthorized)
Response.json({ success: false, error: 'DUPLICATE_NODE' }, { status: 400 })

// Server error
Response.json({ success: false, error: 'INTERNAL_ERROR' }, { status: 500 })
```

### 16.2 Error codes (canonical list)

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Valid session, insufficient permissions |
| `DUPLICATE_NODE` | 400 | Same URL already owned by this user |
| `RATE_LIMITED` | 429 | Username or avatar change rate limit hit |
| `INVALID_SCORE` | 400 | Rating score outside 0–10 step 0.5 |
| `CYCLE_DETECTED` | 400 | Folder parent would create a cycle |
| `NOT_FOUND` | 404 | Resource doesn't exist or isn't visible |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### 16.3 Client-side error handling

Client components that call API routes use a consistent pattern:

```typescript
const result = await fetch('/api/share', { method: 'POST', body: JSON.stringify(payload) })
const data = await result.json()

if (!data.success) {
  if (data.error === 'DUPLICATE_NODE') {
    // show inline error
  } else {
    // show toast with generic message
  }
  // rollback optimistic update in Zustand
  return
}
```

---

## 17. PERFORMANCE CONVENTIONS

### 17.1 Feed pagination

The feed uses **cursor-based pagination** (not offset). The cursor is the `created_at` timestamp of the last visible node. Initial load: 30 nodes. Each subsequent page: 20 nodes. Implementation detail deferred to Feed SQL Spec (`04_FEED_SQL_SPEC.md`).

### 17.2 Image optimization

All thumbnails and avatars rendered via Next.js `<Image>` component with explicit `width`, `height`, and `priority={false}` (except the first 6 cards in the feed which get `priority={true}`).

### 17.3 No N+1 queries

The visibility query in `lib/db/visibility.ts` must JOIN all necessary data in one query: nodes, sort cache, tags (with translated labels), sender info, direction. Do not make separate queries per card to fetch tags or sender data.

### 17.4 Memoization

Card components (`NodeCard.tsx`) must be wrapped in `React.memo`. The equality check should compare `nodeId` + `updated_at` only — not deep equality.

---

## 18. ENVIRONMENT VARIABLES

```bash
# .env.local — required variables

# Supabase (public — safe for browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# Supabase (private — server only, NEVER prefix with NEXT_PUBLIC_)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Rule:** Any variable containing a secret (service role key, any API key) must NOT have the `NEXT_PUBLIC_` prefix. Next.js will refuse to bundle it in client code, which is the desired behavior.

---

## 19. CONSTANTS FILE

```typescript
// lib/constants.ts

export const RATE_LIMITS = {
  USERNAME_CHANGE_HOURS: 24,
  AVATAR_CHANGES_PER_DAY: 5,
  METADATA_CALLS_PER_MINUTE: 30,
} as const

export const PAGINATION = {
  FEED_INITIAL_LOAD: 30,
  FEED_PAGE_SIZE: 20,
} as const

export const FOLDER = {
  MAX_DEPTH: 5,
  MAX_EXPANSION_NODES: 500,    // max nodes in a folder share expansion
  MAX_EXPANSION_USERS: 100,
} as const

export const DISPLAY = {
  MAX_TAG_CHIPS_ON_CARD: 3,
  MAX_ACCESS_AVATARS: 3,
  BAR_AUTO_EXPAND_DELAY_MS: 500,
  DRAG_ANIMATION_MS: 200,
  UNDO_TOAST_DURATION_MS: 5000,
  SEARCH_DEBOUNCE_MS: 300,
} as const

export const TAG_COLOR_PALETTE = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6',
  '#3B82F6', '#8B5CF6', '#EC4899', '#F43F5E', '#06B6D4',
  '#84CC16', '#A855F7', '#FB923C', '#34D399', '#60A5FA',
  '#F472B6', '#FBBF24', '#4ADE80', '#818CF8', '#FB7185',
] as const  // exactly 20 colors
```

---

## 20. TESTING STRATEGY

### 20.1 What to test

| Test type | Tool | What |
|---|---|---|
| Unit | Vitest | `lib/utils/*`, normalization, avatar generation, tag color assignment |
| Integration | Vitest + Supabase local | `lib/db/*` functions against local Supabase |
| E2E | Playwright | Critical paths: login, create node, share, unshare, feed visibility |

### 20.2 Critical invariant tests

The following must be automated before Phase 3 is considered complete:

```
test: "shared node is visible to recipient after directShare"
test: "node becomes invisible after cause deletion"
test: "sharing same node twice creates 2 independent cause+edge sets"
test: "soft delete does not remove causes or edges"
test: "restore makes node visible again via existing edges"
test: "group unshare cascades to all member edges"
```

---

## 21. DEPLOYMENT

### 21.1 Target platform

Vercel (primary). The app is a standard Next.js 15 app with no special deployment requirements.

### 21.2 Supabase project

One Supabase project per environment:
- `liked-dev` — local development (`supabase start`)
- `liked-prod` — production

### 21.3 Deploy checklist

Before every production deploy:
- [ ] `supabase db push` — migrations applied
- [ ] `supabase functions deploy extract-node-metadata` — Edge Function updated
- [ ] `supabase gen types typescript` — types regenerated
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in Vercel environment variables (not `NEXT_PUBLIC_`)
- [ ] RLS policies verified — run the invariant SQL tests from §9.3

---

## 22. DECISIONS LOG

These decisions are final. Do not re-litigate them in Cascade sessions.

| Decision | Rationale |
|---|---|
| Service role for all writes | Ensures atomic transactions via Postgres RPC; keeps write logic server-side |
| Zustand over Redux/Context | Minimal boilerplate, works outside React tree (useful for realtime callbacks) |
| @dnd-kit over react-beautiful-dnd | react-beautiful-dnd is unmaintained; @dnd-kit supports touch and is App Router compatible |
| CSS columns for masonry | No heavy JS masonry library needed; native CSS is fast and reflow-free |
| Cursor pagination over offset | Offset pagination breaks with realtime inserts; cursor is stable |
| Postgres functions for transactions | Supabase JS client cannot span a transaction across multiple await calls |
| No friends table; use friend_invites | PRD §9 is explicit: friendships are derived from friend_invites (invite model). No separate friends table = no sync bugs |
| No tag name field | PRD §19.1 is explicit: tags are concept-only. Labels are in tag_translations only |
| No external avatar URLs | PRD §32.4 is explicit. All avatars stored internally or generated deterministically |

---

*End of LIKED Technical Architecture Document v1.0*
