// src/feed.jsx — feed views: col / masonry / list / free

const VIEW_ICONS = {
  col:    (p)=><IconGrid   {...p}/>,
  mason:  (p)=><IconCols   {...p}/>,
  list:   (p)=><IconList   {...p}/>,
  free:   (p)=><IconMove   {...p}/>,
};

function TopBar({ filterCount, onOpenFilter, onOpenSettings, avatarInitial = 'JS' }) {
  return (
    <div className="topbar">
      <div className="wordmark">liked<span className="dot">.</span></div>
      <div className="topbar-actions">
        <div className={`icon-btn ${filterCount>0?'active':''}`} onClick={onOpenFilter} aria-label="Filter">
          <IconSliders size={16}/>
          {filterCount > 0 && <span className="badge accent">{filterCount}</span>}
        </div>
        <div className="icon-btn" aria-label="Notifications">
          <IconBell size={16}/>
          <span className="badge">2</span>
        </div>
        <div className="avatar-btn" onClick={onOpenSettings}>{avatarInitial}</div>
      </div>
    </div>
  );
}

function FeedTabs({ tab, setTab }) {
  const tabs = [
    { id: 'all',      label: 'All' },
    { id: 'mine',     label: 'Mine' },
    { id: 'received', label: 'Received' },
  ];
  return (
    <div className="feed-tabs">
      {tabs.map(t => (
        <div key={t.id}
          className={`feed-tab ${tab===t.id?'active':''} ${tab===t.id?t.id:''}`}
          onClick={()=>setTab(t.id)}>
          {t.label}
        </div>
      ))}
    </div>
  );
}

function ContextChips({ filter, setFilter }) {
  const chips = [];
  filter.friends.forEach(id => {
    const f = FRIENDS.find(x=>x.id===id) || GROUPS.find(x=>x.id===id);
    if (f) chips.push({key:'friend-'+id, label: f.name, type:'friends', id, color:f.bg});
  });
  filter.tags.forEach(id => {
    const t = TAGS[id]; if (t) chips.push({key:'tag-'+id, label: t.label, type:'tags', id, color:t.color});
  });
  filter.folders.forEach(id => {
    const f = FOLDERS.find(x=>x.id===id); if (f) chips.push({key:'folder-'+id, label: f.name, type:'folders', id, color:f.color});
  });
  if (chips.length === 0) return null;

  const remove = (type, id) => {
    const n = new Set(filter[type]); n.delete(id);
    setFilter({ ...filter, [type]: n });
  };
  const clearAll = () => setFilter({ ...filter, friends: new Set(), tags: new Set(), folders: new Set() });

  return (
    <div className="context-row">
      {chips.map(c => (
        <div key={c.key} className="context-chip" onClick={()=>remove(c.type, c.id)}>
          <span style={{
            width: 8, height: 8, borderRadius: 2, background: c.color, display:'inline-block'
          }}/>
          {c.label}
          <IconX size={11} className="close"/>
        </div>
      ))}
      <div className="context-chip clear" onClick={clearAll}>Clear all</div>
    </div>
  );
}

function UtilBar({ view, setView, sort, onOpenFilter, zoom, setZoom }) {
  const views = [
    { id: 'col',   icon: <IconGrid size={14}/>,  label:'Columns'  },
    { id: 'mason', icon: <IconCols size={14}/>,  label:'Masonry'  },
    { id: 'list',  icon: <IconList size={14}/>,  label:'List'     },
    { id: 'free',  icon: <IconMove size={14}/>,  label:'Free'     },
  ];
  return (
    <div className="util-bar">
      <div className="util-left">
        <div className="sort-btn" onClick={onOpenFilter}>
          <IconSort size={12}/> {sort[0].toUpperCase()+sort.slice(1)}
        </div>
        {view === 'col' && (
          <div className="zoom-pill">
            <div className="zoom-btn" onClick={()=>setZoom(Math.min(6, zoom+1))} title="Zoom out (more cols)">
              <IconZoomOut size={12}/>
            </div>
            <div className="zoom-count">{zoom} col</div>
            <div className="zoom-btn" onClick={()=>setZoom(Math.max(2, zoom-1))} title="Zoom in (fewer cols)">
              <IconZoomIn size={12}/>
            </div>
          </div>
        )}
      </div>
      <div className="view-switch">
        {views.map(v => (
          <div key={v.id} className={`view-btn ${view===v.id?'on accent':''}`}
               onClick={()=>setView(v.id)} title={v.label}>
            {v.icon}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   CARD TILES
   ========================================================= */

function CardTile({ card, onClick, onPointerDown, size, onResizeStart }) {
  // size = {w, h} in grid units — controls grid-span
  const w = size?.w || 1;
  const h = size?.h || 1;
  return (
    <div className="card-tile sized"
      onPointerDown={onPointerDown}
      onClick={onClick}
      data-card-id={card.id}
    >
      <div className="card-art" style={{background: card.art}}/>
      {(w >= 2 || h >= 2) && (
        <div className="card-label">
          <div className="card-label-title">{card.title}</div>
        </div>
      )}
      {card.rating > 0 && (
        <div className="card-rating-badge">
          <IconStar size={8}/>{card.rating}
        </div>
      )}
      {card.dir === 'mine' && <div className="card-dot-dir mine"/>}
      {card.dir === 'received' && <div className="card-dot-dir received"/>}
      {card.sentTo && card.sentTo.length > 0 && <div className="card-sent"/>}
      <ResizeHandle onPointerDown={onResizeStart}/>
    </div>
  );
}

function MasonryCard({ card, onClick, onPointerDown }) {
  const tag = TAGS[card.tag];
  const h = 60 + ((card.id.charCodeAt(2) || 0) % 5) * 14;
  return (
    <div className="m-card" onClick={onClick} onPointerDown={onPointerDown} data-card-id={card.id}>
      <div className="m-card-media" style={{background: card.art, height: h}}/>
      <div className="m-card-meta">
        <div className="m-card-title">{card.title}</div>
        <div className="m-card-tags">
          <span className="m-tag" style={{background: tag.color}}>{tag.label}</span>
          {card.rating > 0 && (
            <span className="m-tag" style={{background:'transparent', border:'1px solid var(--border-2)', color:'var(--text-2)', display:'inline-flex', alignItems:'center', gap:3, padding:'1px 5px'}}>
              <IconStar size={8}/>{card.rating}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ListRow({ card, onClick, onPointerDown }) {
  const tag = TAGS[card.tag];
  const author = FRIENDS.find(f => f.id === card.from);
  return (
    <div className="list-row" onClick={onClick} onPointerDown={onPointerDown} data-card-id={card.id}>
      <div className="list-thumb" style={{background: card.art}}/>
      <div className="list-meta">
        <div className="list-title">{card.title}</div>
        <div className="list-sub">
          <span className="list-tag" style={{color: tag.color}}>● {tag.label}</span>
          <span>·</span>
          <span>{card.source}</span>
          <span>·</span>
          <span>{card.createdDaysAgo}d</span>
        </div>
        {card.rating > 0 && (
          <div className="list-stars">
            {Array.from({length: 5}).map((_, i) => (
              <IconStar key={i} size={9}
                style={{
                  color: i < card.rating ? 'var(--accent)' : 'var(--surface-5)',
                  fill:  i < card.rating ? 'var(--accent)' : 'none',
                }}/>
            ))}
          </div>
        )}
      </div>
      {card.sentTo && card.sentTo.length > 0 && (
        <div className="list-shared">
          {card.sentTo.slice(0,3).map(id => {
            const f = FRIENDS.find(x=>x.id===id);
            return f ? (
              <div key={id} className="list-a" style={{background: f.bg}}>{f.initial}</div>
            ) : null;
          })}
        </div>
      )}
      <div className="list-chev"><IconChevL size={14} style={{transform:'rotate(180deg)'}}/></div>
    </div>
  );
}

function ResizeHandle({ onPointerDown }) {
  return (
    <div className="resize-handle br"
      onPointerDown={(e)=>{ e.stopPropagation(); onPointerDown && onPointerDown(e); }}>
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M1 9 L9 1 M4 9 L9 4 M7 9 L9 7" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      </svg>
    </div>
  );
}

/* =========================================================
   FOLDER TILES
   ========================================================= */

function FolderTile({ folder, onClick, size, onResizeStart, onPointerDown }) {
  const w = size?.w || 1;
  const h = size?.h || 1;
  const arts = folder.artIdx.map(i => ART[i]);
  return (
    <div className="folder-tile"
      onPointerDown={onPointerDown}
      onClick={onClick}
      data-folder-id={folder.id}>
      <div className="folder-collage">
        {arts.map((a,i)=><div key={i} style={{background:a}}/>)}
      </div>
      <div className="folder-color-dot" style={{background: folder.color}}/>
      <div className="folder-overlay">
        <div className="folder-name">{folder.name}</div>
        <div className="folder-count">{folder.count} items</div>
      </div>
      <ResizeHandle onPointerDown={onResizeStart}/>
    </div>
  );
}

function FolderListRow({ folder, onClick }) {
  return (
    <div className="list-row folder" onClick={onClick} data-folder-id={folder.id}>
      <div className="list-thumb" style={{background: folder.color+'22', padding: 4}}>
        <div className="folder-collage" style={{borderRadius: 6, overflow:'hidden', width:'100%', height:'100%'}}>
          {folder.artIdx.map(i=>ART[i]).map((a,i)=>(
            <div key={i} style={{background:a}}/>
          ))}
        </div>
      </div>
      <div className="list-meta">
        <div className="list-title">{folder.name}</div>
        <div className="list-sub">
          <span style={{color: folder.color}}>●</span>
          <span>{folder.count} items</span>
        </div>
      </div>
      <div className="list-chev"><IconChevL size={14} style={{transform:'rotate(180deg)'}}/></div>
    </div>
  );
}

/* =========================================================
   FREE CANVAS
   ========================================================= */

function FreeCanvas({ items, positions, setPositions, onItemClick, onCardPointerDown, openFolder }) {
  const canvasRef = React.useRef(null);
  const GRID = 16; // snap grid px

  // Compute content bounds
  const maxY = Math.max(120, ...items.map(it => {
    const p = positions[it.id] || {x:0,y:0,w:90,h:90};
    return p.y + p.h;
  }));

  const snap = (n) => Math.round(n / GRID) * GRID;

  const startDrag = (id, e, mode /* 'move' | 'resize' */) => {
    e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const start = positions[id] || {x:0,y:0,w:90,h:90};
    const onMove = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      setPositions(prev => {
        const p = {...start};
        if (mode === 'move') {
          p.x = Math.max(0, Math.min(rect.width - start.w, snap(start.x + dx)));
          p.y = Math.max(0, snap(start.y + dy));
        } else {
          p.w = Math.max(60, Math.min(rect.width - start.x, snap(start.w + dx)));
          p.h = Math.max(60, snap(start.h + dy));
        }
        return { ...prev, [id]: p };
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="free-canvas" ref={canvasRef} style={{height: maxY + 24}}>
      {items.map(it => {
        const pos = positions[it.id] || {x: 0, y: 0, w: 90, h: 90};
        const isFolder = it.kind === 'folder';
        return (
          <div key={it.id}
            className={`free-item ${isFolder?'is-folder':'is-card'}`}
            style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }}
            data-card-id={!isFolder ? it.data.id : undefined}
            onPointerDown={(e) => {
              if (e.button && e.button !== 0) return;
              const sx = e.clientX, sy = e.clientY;
              let moved = false;
              const onMove = (ev) => {
                const dx = ev.clientX - sx, dy = ev.clientY - sy;
                if (!moved && Math.hypot(dx, dy) > 4) {
                  moved = true;
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  startDrag(it.id, ev, 'move');
                }
              };
              const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                if (!moved) {
                  if (isFolder) openFolder(it.data.id);
                  else onItemClick(it.data);
                }
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
            }}>
            {isFolder ? (
              <>
                <div className="folder-collage">
                  {it.data.artIdx.map(i=>ART[i]).map((a,i)=>(
                    <div key={i} style={{background:a}}/>
                  ))}
                </div>
                <div className="folder-color-dot" style={{background: it.data.color}}/>
                <div className="folder-overlay">
                  <div className="folder-name">{it.data.name}</div>
                  <div className="folder-count">{it.data.count} items</div>
                </div>
              </>
            ) : (
              <>
                <div className="card-art" style={{background: it.data.art}}/>
                <div className="card-label">
                  <div className="card-label-title">{it.data.title}</div>
                </div>
                {it.data.rating > 0 && (
                  <div className="card-rating-badge">
                    <IconStar size={8}/>{it.data.rating}
                  </div>
                )}
                {it.data.dir === 'mine' && <div className="card-dot-dir mine"/>}
                {it.data.dir === 'received' && <div className="card-dot-dir received"/>}
              </>
            )}
            <div className="resize-handle br"
              onPointerDown={(e)=>{ e.stopPropagation(); startDrag(it.id, e, 'resize'); }}>
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M1 9 L9 1 M4 9 L9 4 M7 9 L9 7" stroke="currentColor" strokeWidth="1.2" fill="none"/>
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================
   FRIENDS STRIP (draggable to expand)
   ========================================================= */

function FriendsStrip({ filter, setFilter, onExpand, dragTarget }) {
  const [dragY, setDragY] = React.useState(0);
  const handleRef = React.useRef(null);

  const toggle = (id) => {
    const n = new Set(filter.friends);
    n.has(id) ? n.delete(id) : n.add(id);
    setFilter({ ...filter, friends: n });
  };

  const onHandlePointerDown = (e) => {
    const startY = e.clientY;
    let moved = 0;
    const onMove = (ev) => {
      moved = startY - ev.clientY;
      setDragY(Math.max(0, Math.min(120, moved)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved > 40) onExpand();
      setDragY(0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <>
      <div className="expand-handle"
        ref={handleRef}
        onClick={onExpand}
        onPointerDown={onHandlePointerDown}
        style={{
          transform: dragY ? `translateY(-${dragY * 0.3}px)` : undefined,
          color: dragY > 40 ? 'var(--accent)' : undefined,
        }}>
        <div className="expand-bar"/>
        <IconChevU size={14}/>
        <span className="expand-label">Friends</span>
      </div>
      <div className="friends-strip" style={{
        transform: dragY ? `translateY(-${dragY * 0.5}px)` : undefined,
      }}>
        {FRIENDS.slice(0,1).map(f => (
          <div key={f.id} className="friend-item">
            <div className="friend-avatar" style={{background: f.bg}}>{f.initial}</div>
            <div className="friend-name">Me</div>
          </div>
        ))}
        {FRIENDS.filter(f=>!f.you).slice(0,4).map(f => {
          const active = filter.friends.has(f.id);
          const isDragTarget = dragTarget === f.id;
          return (
            <div key={f.id} className="friend-item" onClick={()=>toggle(f.id)} data-drop-id={f.id}>
              <div className={`friend-avatar ${f.new?'has-new':''} ${active?'filter-on':''}`} style={{
                background: f.bg,
                outline: isDragTarget ? '3px solid var(--accent)' : undefined,
                outlineOffset: isDragTarget ? 3 : undefined,
                transform: isDragTarget ? 'scale(1.15)' : undefined,
                transition: 'transform .12s, outline-offset .12s',
              }}>
                {f.initial}
                {f.new && <span className="new-dot"/>}
              </div>
              <div className={`friend-name ${active?'active':''}`}>{f.name}</div>
            </div>
          );
        })}
        {GROUPS.slice(0,2).map(g => {
          const active = filter.friends.has(g.id);
          const isDragTarget = dragTarget === g.id;
          return (
            <div key={g.id} className="friend-item" onClick={()=>toggle(g.id)} data-drop-id={g.id}>
              <div className={`friend-avatar group ${active?'filter-on':''}`} style={{
                background: g.bg,
                outline: isDragTarget ? '3px solid var(--accent)' : undefined,
                outlineOffset: isDragTarget ? 3 : undefined,
                transform: isDragTarget ? 'scale(1.15)' : undefined,
                transition: 'transform .12s, outline-offset .12s',
              }}>
                {g.initial}
                <div className="group-members">
                  {g.members.slice(0,2).map(id => {
                    const m = FRIENDS.find(f=>f.id===id);
                    return <div key={id} style={{background: m?.bg}}>{m?.initial}</div>;
                  })}
                </div>
              </div>
              <div className={`friend-name ${active?'active':''}`}>{g.name}</div>
            </div>
          );
        })}
        {FRIENDS.filter(f=>!f.you).slice(4).map(f => (
          <div key={f.id} className="friend-item" onClick={()=>toggle(f.id)} data-drop-id={f.id}>
            <div className="friend-avatar" style={{background: f.bg}}>{f.initial}</div>
            <div className="friend-name">{f.name}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function BottomNav({ current, setCurrent }) {
  const items = [
    { id: 'home',     icon: <IconHome size={20}/>,   label: 'Home' },
    { id: 'folders',  icon: <IconFolder size={20}/>, label: 'Folders' },
    { id: 'friends',  icon: <IconUsers size={20}/>,  label: 'Friends' },
    { id: 'profile',  icon: <IconUser size={20}/>,   label: 'Me' },
  ];
  return (
    <div className="bottom-nav">
      {items.map(it => (
        <div key={it.id} className={`nav-item ${current===it.id?'on':''}`} onClick={()=>setCurrent(it.id)}>
          {it.icon}
          <div className="nav-label">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

/* Folder content toggle (2col/list) */
function FolderContentToggle({ mode, setMode }) {
  return (
    <div className="folder-toggle">
      <div className={`folder-toggle-btn ${mode==='grid'?'on':''}`} onClick={()=>setMode('grid')} title="Grid">
        <IconGrid size={13}/>
      </div>
      <div className={`folder-toggle-btn ${mode==='list'?'on':''}`} onClick={()=>setMode('list')} title="List">
        <IconList size={13}/>
      </div>
    </div>
  );
}

Object.assign(window, {
  TopBar, FeedTabs, ContextChips, UtilBar,
  CardTile, MasonryCard, ListRow, FolderTile, FolderListRow,
  FreeCanvas, FriendsStrip, BottomNav, FolderContentToggle, VIEW_ICONS,
});
