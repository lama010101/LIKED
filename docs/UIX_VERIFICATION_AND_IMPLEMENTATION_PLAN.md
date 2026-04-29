# LIKED — UIX Verification & Implementation Plan

**Date:** 2026-04-29  
**Purpose:** Verify current UIX against prototypes and detail implementation gaps  
**Prototypes Referenced:**
- Desktop: `docs/UI (for reference only)/LIKED - desktop/liked_desktop_v4.html`
- Mobile: `docs/UI (for reference only)/LIKED - mobile/Liked - mobile.html`

---

## EXECUTIVE SUMMARY

**Current Status:** The implementation follows PRD v27.2 but has notable deviations from both HTML prototypes. The mobile implementation is closer to the mobile prototype, while the desktop implementation follows a simplified version of the desktop prototype.

**Key Finding:** The HTML prototypes appear to be earlier iterations (v4 desktop, mobile) that predate PRD v27.2. The current implementation correctly follows PRD v27.2, which supersedes the prototypes on all UI/UX matters per PRD §0.6.

**Recommendation:** Continue following PRD v27.2 as the authoritative specification. Prototype gaps should only be addressed if they align with PRD v27.2 requirements.

---

## DETAILED COMPARISON

### DESKTOP PROTOTYPE vs CURRENT IMPLEMENTATION

#### Desktop Prototype Features (liked_desktop_v4.html)

**Sidebar (left, 220px):**
- Logo `liked.` at top
- Search bar (stub)
- Navigation: Feed (active), Folders, Trash
- Friends section with avatar circles + new activity dots
- Groups section with rounded squares + member micro-avatars
- **Folders section with nested hierarchy, color dots, item counts**
- **Tags chips row (horizontal scroll)**
- Me avatar at bottom with settings icon

**Main Content:**
- Toolbar with feed tabs (All/Mine/Received)
- Search trigger with keyboard shortcut
- Sort button (Newest/Oldest/Top rated/A-Z/Sent)
- **Filter button (sliders icon)**
- View switcher (5 icons: cols/grid/list/rows/canvas)
- Notification bell with badge
- Masonry grid feed (4 columns, responsive)
- Cards with hover overlay + quick actions
- FAB at bottom-right with speed-dial (Tag/Folder/Card)

**Modals:**
- Card detail panel (right side)
- Add card modal
- Filter panel (friends/tags/rating)
- Notifications panel
- Folders view (grid of folder tiles)

#### Current Desktop Implementation

**DesktopSidebar.tsx:**
- ✅ Logo `liked.`
- ✅ Search bar stub
- ✅ Navigation: Feed (active), Folders, Trash
- ✅ Friends section with avatar circles
- ✅ Groups section with rounded squares
- ❌ **MISSING: Folders section with nested hierarchy**
- ❌ **MISSING: Tags chips row**
- ✅ Me avatar at bottom

**Layout (app/(app)/layout.tsx):**
- ✅ DesktopSidebar visible on lg+ screens
- ✅ DesktopToolbar (unified toolbar replacing separate top bar)
- ✅ Feed tabs integrated in DesktopToolbar
- ✅ Sort/view controls in DesktopToolbar
- ✅ Notification bell
- ✅ ContextStrip (mobile only, hidden on desktop)
- ✅ FabSpeedDial with Tag/Folder/Card/Template
- ✅ FolderPathBar (mobile only)

**Gaps Identified:**
1. Desktop sidebar missing Folders section (nested hierarchy with color dots)
2. Desktop sidebar missing Tags chips row
3. No desktop Filter panel (PRD v27.2 removed Filter Feed bottom sheet)
4. No desktop Folders view (grid of folder tiles)

---

### MOBILE PROTOTYPE vs CURRENT IMPLEMENTATION

#### Mobile Prototype Features (Liked - mobile.html)

**Top Bar:**
- Logo `liked.` (or folder view header)
- Tags icon with badge
- Search icon (expandable input)
- Bell icon with badge
- Profile avatar

**Tags Strip (collapsible):**
- Search input for tags
- Horizontally scrollable tag chips
- Multi-select with checkmarks
- Selected chips pinned left

**Feed Tabs:**
- All / Mine / Received (3 tabs)
- Mine sub-tabs: All Mine / Not shared / Shared

**Context Strip:**
- Active filter pills (friend, tag, folder, search)
- Clear all button

**Sort/View Controls:**
- Sort button with dropdown
- View toggle (5 icons)
- Column stepper for icon grid

**Feed:**
- Icon grid (default, 5 cols adjustable)
- Cards with badges (direction, rating, tags)
- Note cards (sticky-note style)

**Bottom Dock:**
- **Folders path strip** (handle + breadcrumb navigation)
- **Friends & Groups strip** (3-state: hidden/strip/expanded)
- FAB centered 20px above strip

**FAB Speed-Dial:**
- Tag (bottom)
- Folder
- Card
- Template (top)

#### Current Mobile Implementation

**TopBar.tsx:**
- ✅ Logo `liked.` (or folder view header)
- ✅ Tags icon with badge
- ✅ Search icon (expandable input with debounce)
- ✅ Bell icon with badge
- ✅ Profile avatar
- ✅ Trash icon with count badge (P7-T04 addition)

**TagsStrip.tsx:**
- ✅ Search input for tags
- ✅ Horizontally scrollable tag chips
- ✅ Multi-select with checkmarks
- ⚠️ **Uses stub tags instead of getVisibleTags RPC** (AUDIT-01 / H12)

**Feed Tabs:**
- ✅ All / Mine / Received (3 tabs)
- ✅ Mine sub-tabs: All Mine / Not shared / Shared

**ContextStrip:**
- ✅ Active filter pills (friend, tag, folder, search)
- ✅ Clear all button
- ✅ Integrated in layout (mobile only)

**Sort/View Controls:**
- ✅ Sort button with dropdown (SortViewRow)
- ✅ View toggle (5 icons)
- ✅ Column stepper for icon grid

**Feed:**
- ✅ Icon grid (default, 5 cols adjustable)
- ✅ Cards with badges (direction, rating, tags)
- ✅ Note cards (sticky-note style)

**Bottom Dock (layout.tsx):**
- ✅ FolderPathBar (handle + breadcrumb navigation)
- ✅ BottomBar with friends strip (3-state: hidden/strip/expanded)
- ✅ FAB centered 20px above strip

**FAB Speed-Dial:**
- ✅ Tag / Folder / Card / Template
- ✅ Scrim overlay
- ✅ Radial arc pattern

**Gaps Identified:**
1. TagsStrip uses stub tags instead of real data from getVisibleTags RPC
2. Groups section missing from BottomBar (only friends shown)

---

## PRD v27.2 vs PROTOTYPE DISCREPANCIES

The HTML prototypes appear to be earlier iterations that differ from PRD v27.2 in several key areas:

### Removed in PRD v27.2 (present in prototypes):

1. **Filter Feed bottom sheet** (§11.3e removed) — Desktop prototype has filter panel
2. **Sliders icon in top bar** (replaced by Tags icon) — Desktop prototype has sliders icon
3. **Sent tab** (replaced by Mine sub-tabs) — Both prototypes have separate Sent tab
4. **Folders Bar** (replaced by breadcrumb/drag panel) — Desktop prototype has Folders section in sidebar

### Added in PRD v27.2 (not in prototypes):

1. **Tags Strip** (§11.3f) — Mobile prototype has it, desktop doesn't
2. **Context Strip** (§11.3g) — Mobile prototype has it, desktop doesn't
3. **FAB Speed-Dial** (§11.3 with 4 actions) — Prototypes have 3 actions
4. **Folder View Header** (§11.5a) — Not in prototypes
5. **Mine sub-tabs** (All Mine / Not shared / Shared) — Not in prototypes

### Current Implementation Alignment:

**Correctly follows PRD v27.2:**
- ✅ Top bar has Tags icon (not Sliders)
- ✅ Feed tabs are All/Mine/Received (no Sent tab)
- ✅ Mine has sub-tabs
- ✅ Tags Strip implemented
- ✅ Context Strip implemented
- ✅ FAB Speed-Dial with 4 actions
- ✅ Folder View Header when in folder context
- ✅ No Filter Feed bottom sheet

**Deviates from PRD v27.2 (follows prototype instead):**
- ⚠️ Desktop sidebar missing Folders section (PRD §11.5 says folders accessed via breadcrumb or drag panel, not sidebar)
- ⚠️ Desktop sidebar missing Tags chips (PRD §11.3f says Tags Strip is between top bar and feed tabs, not in sidebar)

---

## IMPLEMENTATION PLAN

### PRIORITY 1: CRITICAL DATA GAPS

#### UX-001: Wire getVisibleTags RPC to TagsStrip ✅ COMPLETED
**Status:** COMPLETED  
**Date:** 2026-04-29  
**Impact:** Tags filtering is now functional  
**Effort:** Low  
**Dependencies:** P6-T01 (Tag creation) complete

**Steps completed:**
1. ✅ Created migration 037_get_visible_tags.sql with RPC
2. ✅ Added getVisibleTags function to lib/db/tags.ts
3. ✅ Updated TagsStrip.tsx to call RPC instead of using stubTags
4. ✅ Removed stubTags constant
5. ✅ Updated layout.tsx to pass userId and languageCode to TagsStrip
6. ✅ Applied migration 037 successfully

**Files modified:**
- `supabase/migrations/037_get_visible_tags.sql` (created)
- `scripts/apply-migration-037.js` (created)
- `lib/db/tags.ts` (added getVisibleTags function)
- `components/bars/TagsStrip.tsx` (updated to use real data)
- `app/(app)/layout.tsx` (updated to pass props)

---

#### UX-003: Card Overlay Style (Match Prototype) ✅ COMPLETED
**Status:** COMPLETED  
**Date:** 2026-04-29  
**Impact:** Cards now display title + tag chips overlaid on thumbnail with gradient + menu button, matching prototype  
**Effort:** Low

**Steps completed:**
1. ✅ Refactored `NodeCard.tsx` to square aspect ratio (1:1)
2. ✅ Full-bleed thumbnail (image or fallback)
3. ✅ Bottom gradient overlay with white title (truncated)
4. ✅ Tag chips rendered from `node.tags` array (max 3, color-coded)
5. ✅ ⋮ menu button top-right (semi-transparent black w/ blur)
6. ✅ Direction dot moved into card overlay (bottom-right with white border)
7. ✅ Preserved DnD, selection, long-press behavior

**Files modified:**
- `app/(app)/feed/_components/NodeCard.tsx`

---

#### UX-002: Add Groups to BottomBar ✅ COMPLETED
**Status:** COMPLETED  
**Date:** 2026-04-29  
**Impact:** Can now access group context on mobile  
**Effort:** Low  
**Dependencies:** P3-T04 (Group share) complete

**Steps completed:**
1. ✅ Added GroupBarEntry interface to lib/db/friends.ts
2. ✅ Created getGroupBar function in lib/db/friends.ts
3. ✅ Added getGroupBarAction to app/lib/actions/session.ts
4. ✅ Updated friendBarToBottomBarItems in layout.tsx to include groups
5. ✅ Updated BottomBarAvatar.tsx to show group member count badge
6. ✅ Updated BottomBar.tsx to handle group items
7. ✅ Added language_code to SessionUser interface

**Files modified:**
- `lib/db/friends.ts` (added GroupBarEntry interface and getGroupBar function)
- `app/lib/actions/session.ts` (added getGroupBarAction and language_code)
- `app/(app)/layout.tsx` (updated to load and display groups)
- `components/bars/BottomBarAvatar.tsx` (added group member count badge)
- `components/bars/BottomBar.tsx` (added memberCount to interface)

---

#### UX-004: FAB Position Above Bottom Bars ✅ COMPLETED
**Status:** COMPLETED  
**Date:** 2026-04-29  
**Impact:** FAB now floats above bottom bars and moves with them when expanded  
**Effort:** Low

**Steps completed:**
1. ✅ Changed `.fab` from `position: fixed` to `position: absolute` within `.bottom-area`
2. ✅ Changed `.speed-dial` from `position: fixed` to `position: absolute`
3. ✅ Used `bottom: calc(100% + 12px)` and `bottom: calc(100% + 48px)` to place elements above `.bottom-area`
4. ✅ Updated desktop media queries to use same positioning logic

**Files modified:**
- `app/globals.css`

---

#### UX-005: BottomBar Fullscreen Expand Button ✅ COMPLETED
**Status:** COMPLETED  
**Date:** 2026-04-29  
**Impact:** Users can now open the Friends & Groups expanded panel via fullscreen button  
**Effort:** Low

**Steps completed:**
1. ✅ Added 4-corners fullscreen SVG icon button to friends handle right side
2. ✅ Button calls `onStateChange('expanded')` to open the panel
3. ✅ Styled to match prototype: 26x26, surface-3 background, border
4. ✅ `stopPropagation` prevents handle toggle when clicking expand

**Files modified:**
- `components/bars/BottomBar.tsx`

---

#### UX-006: FolderPathBar Home Crumb + Counts ✅ COMPLETED
**Status:** COMPLETED  
**Date:** 2026-04-29  
**Impact:** Folder path now matches prototype: Home icon first, folder color grids, count badges  
**Effort:** Low

**Steps completed:**
1. ✅ Added `colors?: string[]` to path item interface
2. ✅ Replaced separate Back button + Feed root with Home crumb as first item
3. ✅ Home crumb shows house SVG icon + "Home" label + total count badge
4. ✅ Folder crumbs show 4-color mini grid icon (matching prototype's color swatches)
5. ✅ Each crumb shows vertical name + count badge
6. ✅ Added `›` separators between crumbs
7. ✅ Updated layout.tsx mock data to pass folder colors

**Files modified:**
- `components/bars/FolderPathBar.tsx`
- `app/(app)/layout.tsx`

---

#### UX-007: AddCardSheet Match Prototype ✅ COMPLETED
**Status:** COMPLETED  
**Date:** 2026-04-29  
**Impact:** Add card sheet now matches prototype UIX exactly  
**Effort:** Low

**Steps completed:**
1. ✅ Added type chip strip (Auto, Link, Image, Note) with icons
2. ✅ Changed title from "Save a link" to "Add Card"
3. ✅ Changed subtitle to "Paste a link or jot a thought"
4. ✅ Replaced separate URL input + note textarea with single auto-growing textarea
5. ✅ Added proper preview section with empty state, link preview (thumbnail + title + domain), and note preview (sticky note style)
6. ✅ Updated placeholder text to "Paste a URL, drop a thought, or share a note…"
7. ✅ Changed tag section to horizontal chip rail with Tag icon label
8. ✅ Changed share section to horizontal friend rail with Share icon label and count badge
9. ✅ Changed save button text to "Save Card"

**Files modified:**
- `components/sheets/AddCardSheet.tsx`

---

#### UX-008: AddCardSheet Folder Selection UI ✅ COMPLETED
**Status:** COMPLETED  
**Date:** 2026-04-29  
**Impact:** Users can visually select a folder to save the card to (UIX only, not wired to backend)  
**Effort:** Low

**Steps completed:**
1. ✅ Added STUB_FOLDERS data with 6 folders (Work, Personal, Recipes, Travel, Books, Design)
2. ✅ Added selectedFolder state and toggleFolder function
3. ✅ Added folder selection section with folder icon label
4. ✅ Implemented 3-column folder grid matching prototype pattern
5. ✅ Each folder displays 2x2 color collage
6. ✅ Selection state shows accent border + checkmark badge
7. ✅ Folder name highlights in accent color when selected
8. ✅ Reset selectedFolder when sheet opens

**Files modified:**
- `components/sheets/AddCardSheet.tsx`

**Note:** UIX only - folder selection not wired to save action yet

---

### PRIORITY 2: DESKTOP SIDEBAR ENHANCEMENTS

#### UX-003: Add Folders Section to DesktopSidebar
**Status:** Desktop sidebar missing folders section from prototype  
**Impact:** Desktop users cannot browse folders via sidebar  
**Effort:** Medium  
**Dependencies:** P4-T01 (Folder CRUD) complete, FOLDER-004 (getUserFolders) complete

**Note:** PRD v27.2 §11.5 states folders are accessed via breadcrumb or drag panel, NOT via sidebar. Adding this would deviate from PRD but align with desktop prototype.

**Decision:** **DEFER** — Follow PRD v27.2 as authoritative. Folders accessed via FolderPathBar and drag panel.

---

#### UX-004: Add Tags Chips to DesktopSidebar
**Status:** Desktop sidebar missing tags chips from prototype  
**Impact:** Desktop users cannot quick-filter tags via sidebar  
**Effort:** Low  
**Dependencies:** UX-001 (getVisibleTags RPC)

**Note:** PRD v27.2 §11.3f places Tags Strip between top bar and feed tabs, not in sidebar. Adding this would deviate from PRD but align with desktop prototype.

**Decision:** **DEFER** — Follow PRD v27.2 as authoritative. Tags accessed via TagsStrip (already implemented).

---

### PRIORITY 3: MISSING FEATURES FROM PROTOTYPES

#### UX-005: Desktop Filter Panel
**Status:** Desktop prototype has filter panel, current implementation doesn't  
**Impact:** Desktop users cannot filter by friends/tags/rating via panel  
**Effort:** Medium  
**Dependencies:** None

**Note:** PRD v27.2 §11.3e REMOVED Filter Feed bottom sheet. Filtering is via:
- Tags Strip (tags)
- Friends & Groups strip (friends/groups)
- Context Strip (active filters)
- Sort dropdown (rating)

**Decision:** **DO NOT IMPLEMENT** — Follow PRD v27.2 removal.

---

#### UX-006: Desktop Folders View
**Status:** Desktop prototype has folders view grid, current implementation doesn't  
**Impact:** Desktop users cannot browse folders in grid view  
**Effort:** Medium  
**Dependencies:** P4-T01 (Folder CRUD) complete

**Note:** PRD v27.2 doesn't specify a dedicated folders view. Folders accessed via:
- FolderPathBar (breadcrumb navigation)
- Drag panel (drag cards to folders)
- Context filtering by folder

**Decision:** **DEFER** — Evaluate if needed based on user feedback. Current folder access via FolderPathBar may be sufficient.

---

#### UX-007: Desktop Notifications Panel
**Status:** Desktop prototype has notifications panel, current implementation has bell only  
**Impact:** Cannot view notification history on desktop  
**Effort:** Medium  
**Dependencies:** P10 (Realtime & Notifications) — not started

**Note:** PRD v27.2 doesn't specify notifications panel UI. Bell icon exists but panel not specified.

**Decision:** **DEFER to P10** — Implement as part of Realtime & Notifications phase.

---

## SUMMARY TABLE

| Feature | Desktop Prototype | Mobile Prototype | Current Desktop | Current Mobile | PRD v27.2 | Action |
|---------|------------------|-----------------|-----------------|----------------|-----------|--------|
| Top bar with logo | ✅ | ✅ | ✅ (in sidebar) | ✅ | ✅ | — |
| Tags icon in top bar | ❌ | ✅ | ✅ (in toolbar) | ✅ | ✅ | — |
| Search icon | ✅ | ✅ | ✅ (in sidebar) | ✅ | ✅ | — |
| Bell with badge | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Profile avatar | ✅ | ✅ | ✅ (in sidebar) | ✅ | ✅ | — |
| Tags Strip | ❌ | ✅ | ❌ | ✅ (stub data) | ✅ | Wire RPC (UX-001) |
| Feed tabs (All/Mine/Received) | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Mine sub-tabs | ❌ | ✅ | ✅ | ✅ | ✅ | — |
| Context Strip | ❌ | ✅ | ❌ (mobile only) | ✅ | ✅ | — |
| Sort/view controls | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Friends section | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Groups section | ✅ | ✅ | ✅ | ❌ | ✅ | Add to BottomBar (UX-002) |
| Folders section in sidebar | ✅ | ❌ | ❌ | N/A | ❌ | Defer (PRD removes) |
| Tags chips in sidebar | ✅ | ❌ | ❌ | N/A | ❌ | Defer (PRD removes) |
| Filter panel | ✅ | ❌ | ❌ | N/A | ❌ | Do not implement (PRD removes) |
| Folders view grid | ✅ | N/A | ❌ | N/A | ❌ | Defer (PRD doesn't specify) |
| Notifications panel | ✅ | ❌ | ❌ | N/A | ❌ | Defer to P10 |
| FAB Speed-Dial | ✅ (3 actions) | ✅ (4 actions) | ✅ (4 actions) | ✅ (4 actions) | ✅ (4 actions) | — |
| Folder path strip | ❌ | ✅ | ❌ | ✅ | ✅ | — |
| Friends strip (3-state) | N/A | ✅ | N/A | ✅ | ✅ | — |

---

## RECOMMENDATIONS

### Immediate Actions (P9 completion):

1. **UX-001:** Wire getVisibleTags RPC to TagsStrip (critical for tag filtering)
2. **UX-002:** Add groups to BottomBar (critical for group access on mobile)

### Deferred Actions (future phases):

3. **UX-003/004:** Desktop sidebar folders/tags — Defer (PRD v27.2 removes these)
4. **UX-005:** Desktop filter panel — Do not implement (PRD v27.2 removes)
5. **UX-006:** Desktop folders view — Defer (evaluate based on user feedback)
6. **UX-007:** Desktop notifications panel — Defer to P10

### Architectural Decision:

**Follow PRD v27.2 as authoritative specification.** The HTML prototypes are earlier iterations that predate PRD v27.2. Per PRD §0.6, PRD v27.2 supersedes the prototypes on all UI/UX matters.

Current implementation correctly follows PRD v27.2. Prototype gaps should only be addressed if they align with PRD v27.2 requirements.

---

## CONCLUSION

The current UIX implementation is **largely aligned with PRD v27.2**, which is the authoritative specification. The HTML prototypes show an earlier design direction that has since been updated in the PRD.

**Critical gaps to address:**
1. TagsStrip using stub data (needs RPC wiring)
2. Groups missing from mobile BottomBar

**Non-critical gaps (deferred per PRD):**
- Desktop sidebar folders/tags sections
- Desktop filter panel
- Desktop folders view
- Desktop notifications panel

**Overall assessment:** The implementation is on track. Priority should be on completing P9 (Search & Filters) by addressing the two critical gaps above. Other gaps should be evaluated against PRD v27.2 requirements before implementation.
