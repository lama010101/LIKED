// src/app.jsx — root App, state orchestration, drag, reorder, resize

const { useState, useEffect, useRef, useMemo, useCallback } = React;

function useLocal(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s !== null ? JSON.parse(s) : initial;
    } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

const ACCENT_OPTIONS = [
  { name: 'Amber',  hex: '#f5a623', ink: '#000' },
  { name: 'Coral',  hex: '#ff6b6b', ink: '#fff' },
  { name: 'Lime',   hex: '#a0d53a', ink: '#1a1a1a' },
  { name: 'Sky',    hex: '#60c5f1', ink: '#0a1a28' },
  { name: 'Violet', hex: '#a78bfa', ink: '#1a0d40' },
  { name: 'Forest', hex: '#2a8a4a', ink: '#fff' },
];

function App() {
  /* ── Settings (now inside the phone, not Tweaks) ── */
  const [theme,  setTheme]  = useLocal('liked.theme', 'dark');
  const [accent, setAccent] = useLocal('liked.accent', 0);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const a = ACCENT_OPTIONS[accent];
    document.documentElement.style.setProperty('--accent', a.hex);
    document.documentElement.style.setProperty('--accent-ink', a.ink);
  }, [theme, accent]);

  /* ── Tweaks (remaining) ── */
  const [fabStyle, setFabStyle]  = useLocal('liked.fabStyle', 'circle');
  const [bottom,   setBottom]    = useLocal('liked.bottom', 'friends');

  /* ── App state ── */
  const [navTab, setNavTab]  = useState('home');
  const [tab,    setTab]     = useState('all');
  const [view,   setView]    = useLocal('liked.view', 'col');     // col | mason | list | free
  const [zoom,   setZoom]    = useLocal('liked.zoom', 3);         // column count for col view
  const [folderMode, setFolderMode] = useLocal('liked.folderMode', 'grid'); // grid | list inside folder

  const [filter, setFilter] = useState({
    friends: new Set(), tags: new Set(), folders: new Set(), sort: 'newest',
  });
  const filterCount = filter.friends.size + filter.tags.size + filter.folders.size;

  const [folderPath, setFolderPath] = useState([]);
  const currentFolder = folderPath.length ? FOLDERS.find(f=>f.id===folderPath[folderPath.length-1]) : null;

  /* ── Overlays ── */
  const [openAdd,      setOpenAdd]      = useState(false);
  const [openFilter,   setOpenFilter]   = useState(false);
  const [openShare,    setOpenShare]    = useState(false);
  const [openMove,     setOpenMove]     = useState(false);
  const [openFriends,  setOpenFriends]  = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [detailCard,   setDetailCard]   = useState(null);
  const [actionCard,   setActionCard]   = useState(null);
  const [toasts, setToasts]             = useState([]);

  const showToast = (msg) => {
    const id = Math.random();
    setToasts(t => [...t, {id, msg}]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2200);
  };

  /* ── Cards (stateful) ── */
  const [cards, setCards] = useState(CARDS);

  /* ──────────────────────────────────────────
     SINGLE SOURCE OF TRUTH FOR LAYOUT:
       - order[scope]       = array of item ids, defining rank across ALL views
       - sizes[scope][id]   = {w, h} grid-units (cols only)
       - freePos[scope][id] = {x, y, w, h} px (free view only)
     scope = 'root' | folderId
     ──────────────────────────────────────── */
  const [order,   setOrder]   = useLocal('liked.order',   {});
  const [sizes,   setSizes]   = useLocal('liked.sizes',   {});
  const [freePos, setFreePos] = useLocal('liked.freePos', {});

  const scopeKey = currentFolder ? currentFolder.id : 'root';

  // All items (folders + cards) in the current scope, matched by the active filter for cards.
  const scopeItems = useMemo(() => {
    const folderItems = (currentFolder
      ? FOLDERS.filter(f => f.parent === currentFolder.id)
      : FOLDERS.filter(f => f.parent === null)
    ).map(f => ({ id: f.id, kind: 'folder', data: f }));

    let cs = [...cards];
    if (tab === 'mine')     cs = cs.filter(c => c.dir === 'mine');
    if (tab === 'received') cs = cs.filter(c => c.dir === 'received');
    if (currentFolder)      cs = cs.filter(c => c.folderId === currentFolder.id);
    else                    cs = cs.filter(c => !c.folderId);
    if (filter.friends.size) {
      cs = cs.filter(c => {
        if (filter.friends.has(c.from)) return true;
        for (const gId of filter.friends) {
          const g = GROUPS.find(x=>x.id===gId);
          if (g && g.members.includes(c.from)) return true;
        }
        return false;
      });
    }
    if (filter.tags.size)    cs = cs.filter(c => filter.tags.has(c.tag));
    if (filter.folders.size) cs = cs.filter(c => filter.folders.has(c.folderId));

    const cardItems = cs.map(c => ({ id: c.id, kind: 'card', data: c }));
    const all = [...folderItems, ...cardItems];

    // apply saved order (stable), unknown new items appended at top (newest-first)
    const ord = order[scopeKey] || [];
    const idx = new Map(ord.map((id, i) => [id, i]));
    all.sort((a, b) => {
      const ai = idx.has(a.id) ? idx.get(a.id) : -1;
      const bi = idx.has(b.id) ? idx.get(b.id) : -1;
      if (ai === -1 && bi === -1) {
        // both new, folders first then newest-saved
        if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
        return 0;
      }
      if (ai === -1) return -1;
      if (bi === -1) return 1;
      return ai - bi;
    });

    // Sort override (only for newest/oldest sort — preserves manual order for 'random')
    if (filter.sort === 'oldest') {
      all.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
        if (a.kind === 'card') return (b.data.createdDaysAgo || 0) - (a.data.createdDaysAgo || 0);
        return 0;
      });
    }
    return all;
  }, [cards, tab, filter, currentFolder, order, scopeKey]);

  // Ensure order contains all ids
  useEffect(() => {
    const ids = scopeItems.map(it => it.id);
    const cur = order[scopeKey] || [];
    const missing = ids.filter(id => !cur.includes(id));
    if (missing.length > 0) {
      const next = [...missing, ...cur];
      setOrder({ ...order, [scopeKey]: next });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeItems.length, scopeKey]);

  /* ── Handlers ── */
  const openFolder = (folderId) => {
    let cur = FOLDERS.find(f => f.id === folderId);
    const chain = [];
    while (cur) { chain.unshift(cur.id); cur = FOLDERS.find(f => f.id === cur.parent); }
    setFolderPath(chain);
  };
  const breadcrumbGoTo = (idx) => setFolderPath(folderPath.slice(0, idx+1));
  const goBack = () => setFolderPath(folderPath.slice(0, -1));

  const setItemSize = (id, w, h) => {
    const scoped = sizes[scopeKey] || {};
    setSizes({ ...sizes, [scopeKey]: { ...scoped, [id]: {w, h} } });
  };
  const getItemSize = (id) => (sizes[scopeKey] || {})[id] || {w:1, h:1};

  const setFreePosForScope = (updater) => {
    setFreePos(prev => {
      const cur = prev[scopeKey] || {};
      const next = typeof updater === 'function' ? updater(cur) : updater;
      return { ...prev, [scopeKey]: next };
    });
  };

  // Seed free positions when entering free view and scope is empty
  useEffect(() => {
    if (view !== 'free') return;
    const cur = freePos[scopeKey] || {};
    const missing = scopeItems.filter(it => !cur[it.id]);
    if (missing.length === 0) return;
    const next = {...cur};
    // simple flow layout: 3 columns of 100px boxes
    const existing = Object.values(cur);
    let x = 8, y = 8;
    const W = 100, H = 100, GAP = 8, COLS = 3;
    // start from bottom of existing
    let startIdx = existing.length;
    for (const it of missing) {
      const col = startIdx % COLS;
      const row = Math.floor(startIdx / COLS);
      x = 8 + col * (W + GAP);
      y = 8 + row * (H + GAP);
      next[it.id] = { x, y, w: W, h: H };
      startIdx++;
    }
    setFreePos({ ...freePos, [scopeKey]: next });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, scopeKey, scopeItems.length]);

  const handleAdd = ({ url, note, tag, sharedWith }) => {
    const newCard = {
      id: 'c-new-' + Date.now(),
      title: note || new URL(url.includes('://') ? url : 'https://'+url).hostname,
      tag, dir: 'mine', from: 'me',
      sentTo: sharedWith || [],
      folderId: currentFolder ? currentFolder.id : null,
      art: ART[Math.floor(Math.random()*ART.length)],
      type: 'link',
      source: new URL(url.includes('://') ? url : 'https://'+url).hostname,
      createdDaysAgo: 0,
      rating: 0,
    };
    setCards(cs => [newCard, ...cs]);
    // prepend to the scope's order so it shows up first across all views
    const cur = order[scopeKey] || [];
    setOrder({ ...order, [scopeKey]: [newCard.id, ...cur] });
    showToast(sharedWith?.length ? `Saved and shared with ${sharedWith.length}` : 'Saved');
  };

  const handleShare = (ids) => {
    if (!actionCard) return;
    setCards(cs => cs.map(c => c.id === actionCard.id
      ? {...c, sentTo: Array.from(new Set([...(c.sentTo||[]), ...ids]))}
      : c));
    showToast(`Shared with ${ids.length}`);
  };
  const handleMove = (folderId) => {
    if (!actionCard) return;
    setCards(cs => cs.map(c => c.id === actionCard.id ? {...c, folderId} : c));
    const f = FOLDERS.find(x => x.id === folderId);
    showToast(`Moved to ${f?.name}`);
  };
  const handleDelete = () => {
    if (!detailCard) return;
    setCards(cs => cs.filter(c => c.id !== detailCard.id));
    showToast('Deleted');
    setDetailCard(null);
  };
  const handleRate = (rating) => {
    if (!detailCard) return;
    setCards(cs => cs.map(c => c.id === detailCard.id ? {...c, rating} : c));
    setDetailCard(dc => dc ? {...dc, rating} : dc);
  };

  /* ── Drag (share + reorder) ── */
  const [drag, setDrag] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [reorderGhost, setReorderGhost] = useState(null); // {beforeId}

  const beginItemPointer = (item, e) => {
    if (e.button && e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let started = false;
    let mode = null; // 'share' | 'reorder'

    const onMove = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      const dist = Math.hypot(dx, dy);
      if (!started && dist > 8) {
        started = true;
        setDrag({ id: item.id, kind: item.kind, x: ev.clientX, y: ev.clientY,
                  art: item.kind === 'card' ? item.data.art : null,
                  color: item.kind === 'folder' ? item.data.color : null,
                  title: item.kind === 'folder' ? item.data.name : item.data.title });
      }
      if (!started) return;
      setDrag(d => d ? {...d, x: ev.clientX, y: ev.clientY} : d);

      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const friendDrop = el?.closest('[data-drop-id]');
      if (friendDrop && item.kind === 'card') {
        mode = 'share';
        setDragTarget(friendDrop.getAttribute('data-drop-id'));
        setReorderGhost(null);
        return;
      }
      setDragTarget(null);

      // reorder hit-test: look for another tile
      const hitTile = el?.closest('[data-card-id], [data-folder-id]');
      if (hitTile) {
        const hitId = hitTile.getAttribute('data-card-id') || hitTile.getAttribute('data-folder-id');
        if (hitId && hitId !== item.id) {
          mode = 'reorder';
          // insert before or after based on pointer position relative to tile center
          const r = hitTile.getBoundingClientRect();
          const before = (ev.clientX - r.left) < r.width / 2;
          setReorderGhost({ targetId: hitId, before });
          return;
        }
      }
      setReorderGhost(null);
    };

    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const dist = Math.hypot(ev.clientX - sx, ev.clientY - sy);

      if (!started || dist < 6) {
        // TAP
        if (item.kind === 'card') setDetailCard(item.data);
        else openFolder(item.data.id);
      } else if (mode === 'share') {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const drop = el?.closest('[data-drop-id]');
        if (drop) {
          const id = drop.getAttribute('data-drop-id');
          const friend = FRIENDS.find(f => f.id === id) || GROUPS.find(g => g.id === id);
          if (friend && item.kind === 'card') {
            setCards(cs => cs.map(c => c.id === item.data.id
              ? {...c, sentTo: Array.from(new Set([...(c.sentTo||[]), id]))}
              : c));
            showToast(`Shared with ${friend.name}`);
          }
        }
      } else if (mode === 'reorder' && reorderGhost) {
        const cur = order[scopeKey] || scopeItems.map(it=>it.id);
        const withoutSelf = cur.filter(id => id !== item.id);
        const targetIdx = withoutSelf.indexOf(reorderGhost.targetId);
        const insertAt = reorderGhost.before ? targetIdx : targetIdx + 1;
        const next = [...withoutSelf.slice(0, insertAt), item.id, ...withoutSelf.slice(insertAt)];
        setOrder({ ...order, [scopeKey]: next });
      }
      setDrag(null);
      setDragTarget(null);
      setReorderGhost(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /* ── Resize (col view) ── */
  const beginResize = (item, e) => {
    if (e.button && e.button !== 0) return;
    const tile = e.currentTarget.closest('[data-card-id], [data-folder-id]');
    if (!tile) return;
    const rect = tile.getBoundingClientRect();
    const startW = rect.width, startH = rect.height;
    const cols = zoom;
    const parentRect = tile.parentElement.getBoundingClientRect();
    const colW = parentRect.width / cols;
    const sx = e.clientX, sy = e.clientY;

    const onMove = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      const wUnits = Math.max(1, Math.min(cols, Math.round((startW + dx) / colW)));
      // Height units use same colW so the tile looks proportionate
      const hUnits = Math.max(1, Math.min(4, Math.round((startH + dy) / colW)));
      setItemSize(item.id, wUnits, hUnits);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /* ── Derived UI ── */
  const topFolders = FOLDERS.filter(f => f.parent === null);

  /* ── Render ── */
  const renderTopBar = () => currentFolder ? (
    <div className="folder-header">
      <div className="folder-head-title">
        <div className="folder-head-color" style={{background: currentFolder.color}}/>
        {currentFolder.name}
      </div>
      <div className="topbar-actions">
        <FolderContentToggle mode={folderMode} setMode={setFolderMode}/>
        <div className={`icon-btn ${filterCount>0?'active':''}`} onClick={()=>setOpenFilter(true)}>
          <IconSliders size={16}/>
          {filterCount > 0 && <span className="badge accent">{filterCount}</span>}
        </div>
      </div>
    </div>
  ) : (
    <TopBar filterCount={filterCount}
      onOpenFilter={()=>setOpenFilter(true)}
      onOpenSettings={()=>setOpenSettings(true)}/>
  );

  const renderBreadcrumb = () => {
    if (!currentFolder) return null;
    const path = folderPath.map(id => FOLDERS.find(f=>f.id===id));
    return (
      <div className="breadcrumb">
        <div className="back" onClick={goBack}><IconChevL size={12}/></div>
        <span className="crumb" onClick={()=>setFolderPath([])} style={{color:'var(--text-3)'}}>Feed</span>
        {path.slice(0,-1).map((f,i) => (
          <React.Fragment key={f.id}>
            <span className="sep">›</span>
            <span className="crumb" onClick={()=>breadcrumbGoTo(i)}>{f.name}</span>
          </React.Fragment>
        ))}
        <span className="sep">›</span>
        <span className="cur">{currentFolder.name}</span>
      </div>
    );
  };

  const showFeedTabs = !currentFolder && (bottom === 'friends' || navTab === 'home');
  const showFolderStartScreen = bottom === 'nav' && navTab === 'folders' && !currentFolder;
  const showFriendsScreen = bottom === 'nav' && navTab === 'friends';

  // Choose effective view inside a folder (folder content toggle overrides when browsing a folder).
  const effectiveView = currentFolder
    ? (folderMode === 'list' ? 'list' : 'col')
    : view;
  const effectiveZoom = currentFolder ? 2 : zoom;

  const ReorderMarker = ({id, before}) => {
    if (!reorderGhost || reorderGhost.targetId !== id) return null;
    return <div className={`reorder-marker ${before?'before':'after'}`}/>;
  };

  const renderFeedContent = () => {
    if (showFolderStartScreen) {
      return (
        <div className="grid" style={{gridTemplateColumns:'1fr 1fr', gap: 8}}>
          {topFolders.map(f => (
            <FolderTile key={f.id} folder={f} size={{w:1,h:1}}
              onClick={()=>openFolder(f.id)}
              onPointerDown={(e)=>beginItemPointer({id:f.id,kind:'folder',data:f}, e)}
              onResizeStart={()=>{}}/>
          ))}
        </div>
      );
    }

    if (effectiveView === 'mason') {
      return (
        <div>
          {scopeItems.filter(it => it.kind === 'folder').length > 0 && (
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 6, marginBottom: 8}}>
              {scopeItems.filter(it => it.kind === 'folder').map(it => (
                <FolderTile key={it.id} folder={it.data} size={{w:1,h:1}}
                  onClick={()=>openFolder(it.data.id)}
                  onPointerDown={(e)=>beginItemPointer(it, e)}
                  onResizeStart={()=>{}}/>
              ))}
            </div>
          )}
          <div className="masonry">
            {scopeItems.filter(it => it.kind === 'card').map(it => (
              <MasonryCard key={it.id} card={it.data}
                onClick={()=>{}}
                onPointerDown={(e)=>beginItemPointer(it, e)}/>
            ))}
          </div>
        </div>
      );
    }

    if (effectiveView === 'list') {
      return (
        <div className="list-wrap">
          {scopeItems.map(it => (
            <div key={it.id} style={{position:'relative'}}>
              <ReorderMarker id={it.id} before={true}/>
              {it.kind === 'folder'
                ? <FolderListRow folder={it.data} onClick={()=>openFolder(it.data.id)}/>
                : <ListRow card={it.data}
                    onClick={()=>{}}
                    onPointerDown={(e)=>beginItemPointer(it, e)}/>}
              <ReorderMarker id={it.id} before={false}/>
            </div>
          ))}
          {scopeItems.length === 0 && (
            <div style={{textAlign:'center', padding:'48px 12px', color:'var(--text-3)', fontSize:12}}>
              Nothing matches these filters.
            </div>
          )}
        </div>
      );
    }

    if (effectiveView === 'free') {
      return (
        <FreeCanvas
          items={scopeItems}
          positions={freePos[scopeKey] || {}}
          setPositions={setFreePosForScope}
          onItemClick={(c)=>setDetailCard(c)}
          openFolder={openFolder}/>
      );
    }

    // COL view (default) — supports resize + reorder
    const gridCols = `repeat(${effectiveZoom}, 1fr)`;
    const rowSize = `minmax(0, calc((380px - 12px) / ${effectiveZoom}))`;
    return (
      <div className="col-grid" style={{gridTemplateColumns: gridCols, gridAutoRows: rowSize}}>
        {scopeItems.map(it => {
          const sz = getItemSize(it.id);
          const clampW = Math.min(sz.w, effectiveZoom);
          return (
            <div key={it.id} className="col-grid-cell" style={{
              gridColumn: `span ${clampW}`, gridRow: `span ${sz.h}`,
              position:'relative',
            }}>
              <ReorderMarker id={it.id} before={true}/>
              {it.kind === 'folder'
                ? <FolderTile folder={it.data} size={{w:clampW, h:sz.h}}
                    onClick={()=>openFolder(it.data.id)}
                    onPointerDown={(e)=>beginItemPointer(it, e)}
                    onResizeStart={(e)=>beginResize(it, e)}/>
                : <CardTile card={it.data} size={{w:clampW, h:sz.h}}
                    onClick={()=>{}}
                    onPointerDown={(e)=>beginItemPointer(it, e)}
                    onResizeStart={(e)=>beginResize(it, e)}/>}
            </div>
          );
        })}
        {scopeItems.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            textAlign:'center', padding: '48px 12px',
            color: 'var(--text-3)', fontSize: 12,
          }}>
            Nothing here yet.
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="stage">
      {/* LEFT — phone */}
      <div className="stage-left">
        <div className="stage-wordmark">
          <span className="font-serif" style={{fontSize: 24, fontWeight:700}}>liked</span>
          <span className="dot font-serif" style={{fontSize: 24, fontWeight:700}}>.</span>
          <span style={{
            fontSize: 11, letterSpacing:'0.14em', textTransform:'uppercase',
            color:'var(--text-3)', marginLeft: 2,
          }}>interactive prototype</span>
        </div>
        <div className="stage-caption">Tap · drag a card onto a friend · drag to reorder · resize from corners</div>

        <div className="phone-scaler">
        <div className="phone">
          {/* status bar */}
          <div className="status-bar">
            <span>9:41</span>
            <div className="icons" style={{gap: 4}}>
              <span style={{fontSize: 11, letterSpacing: 0.5}}>●●●●●</span>
              <span style={{fontSize: 11, marginLeft: 4, opacity: 0.7}}>100%</span>
            </div>
          </div>
          <div className="home-indicator"/>

          {/* screen */}
          <div className="screen">
            {showFriendsScreen ? (
              <FriendsFullScreen filter={filter} setFilter={setFilter}/>
            ) : (
              <>
                {renderTopBar()}
                {!currentFolder && !showFolderStartScreen && showFeedTabs && (
                  <FeedTabs tab={tab} setTab={setTab}/>
                )}
                {currentFolder && renderBreadcrumb()}
                <ContextChips filter={filter} setFilter={setFilter}/>
                {!showFolderStartScreen && !currentFolder && (
                  <UtilBar view={view} setView={setView} sort={filter.sort}
                    zoom={zoom} setZoom={setZoom}
                    onOpenFilter={()=>setOpenFilter(true)}/>
                )}

                <div className={`feed ${effectiveView==='free'?'feed-free':''}`}>
                  {renderFeedContent()}
                </div>
              </>
            )}

            {/* Bottom area */}
            {bottom === 'friends' ? (
              <div className="bottom-area">
                <div className={`fab ${fabStyle==='pill'?'pill':''}`} onClick={()=>setOpenAdd(true)}>
                  <IconPlus size={fabStyle==='pill'?16:20}/>
                  {fabStyle === 'pill' && <span>Save link</span>}
                </div>
                <FriendsStrip filter={filter} setFilter={setFilter}
                  onExpand={()=>setOpenFriends(true)}
                  dragTarget={dragTarget}/>
              </div>
            ) : (
              <div className="bottom-area no-pad">
                <div className={`fab ${fabStyle==='pill'?'pill':''}`} onClick={()=>setOpenAdd(true)}>
                  <IconPlus size={fabStyle==='pill'?16:20}/>
                  {fabStyle === 'pill' && <span>Save</span>}
                </div>
                <BottomNav current={navTab} setCurrent={(id) => {
                  setNavTab(id);
                  if (id === 'home') setFolderPath([]);
                }}/>
              </div>
            )}
          </div>

          {/* Overlays */}
          <div className="overlay-root" style={{pointerEvents: (openAdd||openFilter||openShare||openMove||openFriends||openSettings||detailCard)?'auto':'none'}}>
            <OverlayBackdrop show={openAdd||openFilter||openShare||openMove||openFriends||openSettings||!!detailCard}
              onClick={()=>{
                setOpenAdd(false); setOpenFilter(false);
                setOpenShare(false); setOpenMove(false);
                setOpenFriends(false); setOpenSettings(false);
                setDetailCard(null);
              }}/>
            <AddSheet open={openAdd} onClose={()=>setOpenAdd(false)} onAdd={handleAdd}/>
            <FilterSheet open={openFilter} onClose={()=>setOpenFilter(false)}
              filter={filter} setFilter={setFilter}/>
            <FriendsPanelSheet open={openFriends} onClose={()=>setOpenFriends(false)}
              filter={filter} setFilter={setFilter}/>
            <CardDetailSheet open={!!detailCard} card={detailCard}
              onClose={()=>setDetailCard(null)}
              onDelete={handleDelete}
              onRate={handleRate}
              onShare={()=>{ setActionCard(detailCard); setDetailCard(null); setOpenShare(true); }}/>
            <ShareSheet open={openShare} onClose={()=>setOpenShare(false)}
              onConfirm={handleShare} card={actionCard}/>
            <MoveSheet open={openMove} onClose={()=>setOpenMove(false)}
              onConfirm={handleMove} card={actionCard}/>
            <SettingsSheet open={openSettings} onClose={()=>setOpenSettings(false)}
              theme={theme} setTheme={setTheme}
              accent={accent} setAccent={setAccent}
              accentOptions={ACCENT_OPTIONS}/>
          </div>

          {/* Toasts */}
          <div className="toast-root">
            {toasts.map(t => <div key={t.id} className="toast">{t.msg}</div>)}
          </div>

          {/* Drag ghost */}
          {drag && (
            <div className="drag-ghost" style={{
              left: drag.x - 190, top: drag.y - 40,
              background: drag.art || drag.color || 'var(--surface-4)',
            }}>
              {drag.kind === 'folder' && (
                <div style={{
                  position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#fff', fontSize: 11, fontWeight:700, textShadow:'0 1px 3px rgba(0,0,0,0.6)',
                  padding: 6, textAlign:'center', lineHeight: 1.2,
                }}>{drag.title}</div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* RIGHT — Tweaks inspector (theme+accent moved out; they're in Settings now) */}
      <div className="stage-right">
        <div className="inspector-title">Tweaks</div>
        <div className="inspector-sub">Live prototype controls. Theme &amp; accent live inside the app now — tap the avatar in the top-right to change them.</div>

        <div className="insp-section">
          <h5>FAB style</h5>
          <div className="seg">
            <button className={fabStyle==='circle'?'on':''} onClick={()=>setFabStyle('circle')}>Floating circle</button>
            <button className={fabStyle==='pill'?'on':''} onClick={()=>setFabStyle('pill')}>Docked pill</button>
          </div>
        </div>

        <div className="insp-section">
          <h5>Bottom area</h5>
          <div className="seg">
            <button className={bottom==='friends'?'on':''} onClick={()=>{setBottom('friends'); setFolderPath([]);}}>Friends strip</button>
            <button className={bottom==='nav'?'on':''} onClick={()=>setBottom('nav')}>Bottom nav</button>
          </div>
        </div>

        <div className="insp-section">
          <h5>Feed view</h5>
          <div className="seg">
            <button className={view==='col'?'on':''}   onClick={()=>setView('col')}>Col</button>
            <button className={view==='mason'?'on':''} onClick={()=>setView('mason')}>Masonry</button>
            <button className={view==='list'?'on':''}  onClick={()=>setView('list')}>List</button>
            <button className={view==='free'?'on':''}  onClick={()=>setView('free')}>Free</button>
          </div>
          {view === 'col' && (
            <div style={{marginTop: 8}}>
              <div style={{display:'flex', alignItems:'center', gap: 8, fontSize: 11, color:'var(--text-2)'}}>
                <IconZoomOut size={13}/>
                <input type="range" min="2" max="6" value={zoom} onChange={e=>setZoom(Number(e.target.value))}
                  style={{flex:1, accentColor:'var(--accent)'}}/>
                <IconZoomIn size={13}/>
                <span style={{minWidth: 28, textAlign:'right', fontWeight:700, color:'var(--text-1)'}}>{zoom}</span>
              </div>
            </div>
          )}
        </div>

        <div className="insp-section">
          <h5>Try it out</h5>
          <div className="quick-links">
            <div className="quick-link" onClick={()=>setOpenAdd(true)}>
              <IconPlus size={14}/> Save a link<span className="kbd">FAB</span>
            </div>
            <div className="quick-link" onClick={()=>setOpenSettings(true)}>
              <IconGear size={14}/> Open Settings<span className="kbd">avatar</span>
            </div>
            <div className="quick-link" onClick={()=>setOpenFilter(true)}>
              <IconSliders size={14}/> Filter feed<span className="kbd">sliders</span>
            </div>
            <div className="quick-link" onClick={()=>setOpenFriends(true)}>
              <IconChevU size={14}/> Expand friends<span className="kbd">drag up</span>
            </div>
            <div className="quick-link" onClick={()=>{
              if (bottom === 'nav') setNavTab('folders');
              else openFolder('f-fav');
            }}>
              <IconFolder size={14}/> Browse folders<span className="kbd">nav</span>
            </div>
            <div className="quick-link" onClick={()=>{
              const c = cards.find(x => x.type === 'video') || cards[0];
              if (c) setDetailCard(c);
            }}>
              <IconStar size={14}/> Open card + rate<span className="kbd">tap</span>
            </div>
            <div className="quick-link" onClick={()=>{ setView('free'); setFolderPath([]); }}>
              <IconMove size={14}/> Switch to Free view<span className="kbd">view</span>
            </div>
            <div className="quick-link" onClick={()=>{
              setOrder({}); setSizes({}); setFreePos({});
              showToast('Layout reset');
            }}>
              <IconTrash size={14}/> Reset layout<span className="kbd">undo</span>
            </div>
          </div>
        </div>

        <div className="insp-section">
          <h5>Tip</h5>
          <div style={{
            padding: '12px', background:'var(--surface-3)', border:'1px solid var(--border-1)',
            borderRadius: 10, fontSize:11, color:'var(--text-2)', lineHeight:1.55,
          }}>
            <b style={{color:'var(--accent)'}}>Long-drag</b> a tile onto another to reorder, or onto a friend avatar to share. Grab the <b>corner</b> to resize. Your layout is kept per view.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Expanded friends panel (from chevron) ── */
function FriendsPanelSheet({ open, onClose, filter, setFilter }) {
  const [query, setQuery] = React.useState('');
  const q = query.toLowerCase();
  const toggle = (id) => {
    const n = new Set(filter.friends);
    n.has(id) ? n.delete(id) : n.add(id);
    setFilter({ ...filter, friends: n });
  };
  const friends = FRIENDS.filter(f => !f.you && f.name.toLowerCase().includes(q));
  const groups = GROUPS.filter(g => g.name.toLowerCase().includes(q));
  return (
    <Sheet open={open} onClose={onClose} title="Friends & groups"
      subtitle={filter.friends.size ? `${filter.friends.size} selected` : 'Tap to filter · long press to manage'}>
      <div className="sheet-section">
        <div className="search-field">
          <IconSearch size={14}/>
          <input placeholder="Search…" value={query} onChange={e=>setQuery(e.target.value)}/>
        </div>
      </div>
      {friends.length > 0 && <>
        <div className="sheet-section"><div className="sheet-section-label">Friends · {friends.length}</div></div>
        <div className="select-grid">
          {friends.map(f => (
            <div key={f.id} className="select-grid-item" onClick={()=>toggle(f.id)}>
              <div className={`select-avatar ${filter.friends.has(f.id)?'on':''}`} style={{background:f.bg}}>
                {f.initial}
                {f.new && <span className="new-dot" style={{
                  position:'absolute', bottom:-1, right:-1,
                  width:10, height:10, borderRadius:'50%', background:'var(--accent)',
                  border:'2px solid var(--surface-2)',
                }}/>}
              </div>
              <div className="select-label">{f.name}</div>
            </div>
          ))}
        </div>
      </>}
      {groups.length > 0 && <>
        <div className="sheet-section"><div className="sheet-section-label">Groups · {groups.length}</div></div>
        <div className="select-grid">
          {groups.map(g => (
            <div key={g.id} className="select-grid-item" onClick={()=>toggle(g.id)}>
              <div className={`select-avatar group ${filter.friends.has(g.id)?'on':''}`} style={{background:g.bg}}>
                {g.initial}
              </div>
              <div className="select-label">{g.name}</div>
            </div>
          ))}
        </div>
      </>}
      <button className="btn-primary" onClick={onClose}>Done</button>
    </Sheet>
  );
}

function FriendsFullScreen({ filter, setFilter }) {
  return (
    <div style={{flex:1, overflowY:'auto', padding:'16px', background: 'var(--surface-1)'}}>
      <div style={{
        fontFamily:'Fraunces, Georgia, serif',
        fontSize: 26, fontWeight:700, letterSpacing:'-0.02em', marginBottom: 4,
      }}>Friends</div>
      <div style={{fontSize: 12, color:'var(--text-3)', marginBottom: 18}}>
        {FRIENDS.length-1} friends · {GROUPS.length} groups
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--text-3)', marginBottom: 10,
      }}>Groups</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8, marginBottom: 18}}>
        {GROUPS.map(g => (
          <div key={g.id} style={{
            padding: 12, background: 'var(--surface-2)', border:'1px solid var(--border-1)',
            borderRadius: 14, display:'flex', alignItems:'center', gap: 10, cursor:'pointer',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, background: g.bg,
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'#fff', fontWeight: 700, fontSize: 14,
            }}>{g.initial}</div>
            <div>
              <div style={{fontSize: 13, fontWeight: 700}}>{g.name}</div>
              <div style={{fontSize: 10, color:'var(--text-3)'}}>{g.members.length} members</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--text-3)', marginBottom: 10,
      }}>Friends</div>
      <div style={{display:'flex', flexDirection:'column', gap: 2}}>
        {FRIENDS.filter(f=>!f.you).map(f => (
          <div key={f.id} style={{
            display:'flex', alignItems:'center', gap: 12, padding: '10px 8px',
            borderRadius: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: f.bg,
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'#fff', fontWeight: 700, fontSize: 13,
              outline: f.new ? '2px solid var(--accent)' : undefined,
              outlineOffset: f.new ? 2 : undefined,
            }}>{f.initial}</div>
            <div style={{flex: 1}}>
              <div style={{fontSize: 13, fontWeight: 600, color:'var(--text-1)'}}>{f.name}</div>
              <div style={{fontSize: 10, color:'var(--text-3)'}}>
                {f.new ? 'Sent you 2 new cards' : 'Active recently'}
              </div>
            </div>
            {f.new && <div style={{
              width: 8, height: 8, borderRadius:'50%', background: 'var(--accent)',
            }}/>}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { App, FriendsPanelSheet, FriendsFullScreen, ACCENT_OPTIONS });

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
