// src/sheets.jsx — bottom sheet shells shared across flows

function Sheet({ open, onClose, children, title, subtitle, action, onAction }) {
  return (
    <div className={`sheet ${open ? 'show' : ''}`}>
      <div className="sheet-drag" />
      {title && (
        <div className="sheet-header">
          <div>
            <div className="sheet-title">{title}</div>
            {subtitle && <div className="sheet-sub">{subtitle}</div>}
          </div>
          {action && (
            <div className="sheet-action" onClick={onAction}>{action}</div>
          )}
          {!action && (
            <div className="icon-btn" style={{width:30,height:30}} onClick={onClose}>
              <IconX size={14}/>
            </div>
          )}
        </div>
      )}
      <div className="sheet-body">{children}</div>
    </div>
  );
}

function OverlayBackdrop({ show, onClick }) {
  return (
    <div className={`overlay-backdrop ${show ? 'show' : ''}`} onClick={onClick} />
  );
}

/* =========== ADD SHEET =========== */
function AddSheet({ open, onClose, onAdd }) {
  const [url, setUrl] = React.useState('');
  const [note, setNote] = React.useState('');
  const [tag, setTag] = React.useState('music');
  const [selected, setSelected] = React.useState(new Set());

  React.useEffect(() => {
    if (open) { setUrl(''); setNote(''); setSelected(new Set()); }
  }, [open]);

  const toggle = (id) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const submit = () => {
    if (!url.trim()) return;
    onAdd({ url, note, tag, sharedWith: Array.from(selected) });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Save a link" subtitle="Drop a URL · add a note · share optionally">
      <div className="sheet-section">
        <input className="field" placeholder="Paste or type URL…"
          value={url} onChange={e=>setUrl(e.target.value)} autoFocus={open}/>
      </div>
      <div className="sheet-section">
        <textarea className="field" placeholder="Add a note (optional)"
          value={note} onChange={e=>setNote(e.target.value)}
          style={{minHeight: note.length > 60 ? 96 : 48}}/>
      </div>
      <div className="sheet-section">
        <div className="sheet-section-label">Tag</div>
        <div className="chip-row">
          {Object.entries(TAGS).map(([k,t]) => (
            <div key={k} className={`chip ${tag===k?'on':''}`} onClick={()=>setTag(k)}>
              {t.label}
            </div>
          ))}
        </div>
      </div>
      <div className="sheet-section">
        <div className="sheet-section-label">Share with (optional)</div>
      </div>
      <div className="select-grid">
        {FRIENDS.filter(f=>!f.you).slice(0,10).map(f => (
          <div key={f.id} className="select-grid-item" onClick={()=>toggle(f.id)}>
            <div className={`select-avatar ${selected.has(f.id)?'on':''}`} style={{background:f.bg}}>
              {f.initial}
            </div>
            <div className="select-label">{f.name}</div>
          </div>
        ))}
      </div>
      <button className={`btn-primary ${!url.trim()?'disabled':''}`}
        disabled={!url.trim()} onClick={submit}>
        Save {selected.size > 0 ? `and share with ${selected.size}` : ''}
      </button>
    </Sheet>
  );
}

/* =========== FILTER SHEET =========== */
function FilterSheet({ open, onClose, filter, setFilter }) {
  const toggleSet = (key, id) => {
    const n = new Set(filter[key]);
    n.has(id) ? n.delete(id) : n.add(id);
    setFilter({ ...filter, [key]: n });
  };
  const clear = () => setFilter({ friends: new Set(), tags: new Set(), folders: new Set(), sort: 'newest' });
  const activeCount =
    (filter.friends?.size || 0) +
    (filter.tags?.size || 0) +
    (filter.folders?.size || 0);

  return (
    <Sheet open={open} onClose={onClose}
      title="Filter feed"
      subtitle={activeCount ? `${activeCount} filter${activeCount>1?'s':''} active` : 'Narrow down what you see'}
      action={activeCount ? 'Clear all' : null} onAction={clear}>
      <div className="sheet-section">
        <div className="sheet-section-label">Sort by</div>
        <div className="chip-row">
          {['newest','oldest','popular','random'].map(s => (
            <div key={s} className={`chip ${filter.sort===s?'on':''}`} onClick={()=>setFilter({...filter, sort: s})}>
              {s[0].toUpperCase()+s.slice(1)}
            </div>
          ))}
        </div>
      </div>
      <div className="sheet-section">
        <div className="sheet-section-label">Tags</div>
        <div className="chip-row">
          {Object.entries(TAGS).map(([k,t]) => (
            <div key={k} className={`chip ${filter.tags.has(k)?'on':''}`}
              onClick={()=>toggleSet('tags', k)}>
              {t.label}
            </div>
          ))}
        </div>
      </div>
      <div className="sheet-section">
        <div className="sheet-section-label">Friends &amp; groups</div>
      </div>
      <div className="select-grid">
        {FRIENDS.filter(f=>!f.you).slice(0,10).map(f => (
          <div key={f.id} className="select-grid-item" onClick={()=>toggleSet('friends', f.id)}>
            <div className={`select-avatar ${filter.friends.has(f.id)?'on':''}`} style={{background:f.bg}}>
              {f.initial}
            </div>
            <div className="select-label">{f.name}</div>
          </div>
        ))}
        {GROUPS.map(g => (
          <div key={g.id} className="select-grid-item" onClick={()=>toggleSet('friends', g.id)}>
            <div className={`select-avatar group ${filter.friends.has(g.id)?'on':''}`} style={{background:g.bg}}>
              {g.initial}
            </div>
            <div className="select-label">{g.name}</div>
          </div>
        ))}
      </div>
      <div className="sheet-section">
        <div className="sheet-section-label">Folders</div>
      </div>
      <div className="folder-select-grid">
        {FOLDERS.filter(f=>!f.parent).map(f => {
          const arts = f.artIdx.map(i=>ART[i]);
          return (
            <div key={f.id} className={`folder-select-item ${filter.folders.has(f.id)?'on':''}`}
              onClick={()=>toggleSet('folders', f.id)}>
              <div className="folder-select-tile">
                <div className="folder-collage">
                  {arts.map((a,i)=><div key={i} style={{background:a}}/>)}
                </div>
              </div>
              <div className="folder-select-name">{f.name}</div>
            </div>
          );
        })}
      </div>
      <button className="btn-primary" onClick={onClose}>
        Show {activeCount ? `filtered` : 'all'} results
      </button>
    </Sheet>
  );
}

/* =========== CARD DETAIL SHEET =========== */
function CardDetailSheet({ open, onClose, card, onDelete, onShare, onRate }) {
  if (!card) return <Sheet open={open} onClose={onClose}/>;
  const tag = TAGS[card.tag];
  const author = FRIENDS.find(f => f.id === card.from);
  const isVideo = card.type === 'video';

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="detail-media" style={{background: card.art}}>
        {isVideo && (
          <>
            <div className="play-overlay">
              <div className="play-btn"><IconPlay size={22} color="#000"/></div>
            </div>
            <div className="chrome">
              <div className="progress-bar"><div className="progress-fill"/></div>
              <div className="yt-controls">
                <IconPlay size={14}/>
                <span style={{fontSize:10}}>HD</span>
                <span className="yt-time">2:47 / 7:12</span>
                <IconFullscreen size={14}/>
              </div>
            </div>
          </>
        )}
        <div className="icon-btn" style={{
          position:'absolute', top: 12, right: 12,
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff',
        }} onClick={onClose}><IconX size={14}/></div>
      </div>
      <div className="detail-title">{card.title}</div>
      <div className="detail-meta">
        <span className="meta-pill" style={{color: tag.color, borderColor: tag.color+'44'}}>{tag.label}</span>
        <span className="meta-pill">{card.source}</span>
        <span className="meta-pill">
          {card.dir === 'mine' ? 'Saved by you' : `From ${author?.name || '—'}`}
        </span>
        <span className="meta-pill">{card.createdDaysAgo}d ago</span>
      </div>

      {/* Rating editor */}
      <div className="rating-row">
        <div className="rating-label">Rating</div>
        <div className="rating-stars">
          {[1,2,3,4,5].map(n => (
            <div key={n} className={`rating-star ${card.rating>=n?'on':''}`}
              onClick={()=>onRate(card.rating === n ? 0 : n)}>
              <IconStar size={22}/>
            </div>
          ))}
          {card.rating > 0 && (
            <div className="rating-clear" onClick={()=>onRate(0)}>Clear</div>
          )}
        </div>
      </div>

      {card.sentTo && card.sentTo.length > 0 && (
        <div className="shared-with">
          <div className="shared-label">Sent to</div>
          <div className="shared-avatars">
            {card.sentTo.map(id => {
              const f = FRIENDS.find(x=>x.id===id);
              return <div key={id} className="a" style={{background:f?.bg}}>{f?.initial}</div>;
            })}
          </div>
        </div>
      )}
      <button className="btn-primary" style={{display:'flex', gap:8, alignItems:'center', justifyContent:'center'}}>
        <IconExt size={16}/> Open in {card.source}
      </button>
      <div className="action-grid">
        <div className="action-cell" onClick={onShare}>
          <IconShare size={16}/> Share
        </div>
        <div className="action-cell danger" onClick={onDelete}>
          <IconTrash size={16}/> Delete
        </div>
      </div>
    </Sheet>
  );
}

/* =========== SETTINGS SHEET =========== */
function SettingsSheet({ open, onClose, theme, setTheme, accent, setAccent, accentOptions }) {
  return (
    <Sheet open={open} onClose={onClose} title="Settings" subtitle="Theme, accent, and your account">
      <div className="sheet-section">
        <div className="sheet-section-label">Appearance</div>
        <div className="theme-row">
          <div className={`theme-opt ${theme==='dark'?'on':''}`} onClick={()=>setTheme('dark')}>
            <div className="theme-preview theme-preview-dark">
              <div className="tp-top"/>
              <div className="tp-card" style={{background:'#7a3ad5'}}/>
              <div className="tp-card" style={{background:'#f5a623'}}/>
              <div className="tp-card" style={{background:'#1a8a7b'}}/>
              <div className="tp-card" style={{background:'#4a9fd5'}}/>
            </div>
            <div className="theme-opt-label"><IconMoon size={12}/> Dark</div>
          </div>
          <div className={`theme-opt ${theme==='light'?'on':''}`} onClick={()=>setTheme('light')}>
            <div className="theme-preview theme-preview-light">
              <div className="tp-top"/>
              <div className="tp-card" style={{background:'#7a3ad5'}}/>
              <div className="tp-card" style={{background:'#f5a623'}}/>
              <div className="tp-card" style={{background:'#1a8a7b'}}/>
              <div className="tp-card" style={{background:'#4a9fd5'}}/>
            </div>
            <div className="theme-opt-label"><IconSun size={12}/> Light</div>
          </div>
        </div>
      </div>
      <div className="sheet-section">
        <div className="sheet-section-label">Accent color</div>
        <div className="accent-row">
          {accentOptions.map((a, i) => (
            <div key={a.name}
              className={`accent-swatch ${accent===i?'on':''}`}
              style={{background: a.hex}}
              onClick={()=>setAccent(i)}>
              {accent === i && <IconCheck size={14} style={{color: a.ink}}/>}
            </div>
          ))}
        </div>
        <div className="accent-names">
          {accentOptions.map((a, i) => (
            <div key={a.name} className={`accent-name ${accent===i?'on':''}`} onClick={()=>setAccent(i)}>{a.name}</div>
          ))}
        </div>
      </div>
      <div className="sheet-section">
        <div className="sheet-section-label">Account</div>
        <div className="settings-list">
          <div className="settings-row"><span>Signed in as</span><b>you@liked.app</b></div>
          <div className="settings-row"><span>Notifications</span><b>On</b></div>
          <div className="settings-row"><span>Default tag</span><b>Music</b></div>
          <div className="settings-row danger"><span>Sign out</span></div>
        </div>
      </div>
      <button className="btn-primary" onClick={onClose}>Done</button>
    </Sheet>
  );
}

Object.assign(window, { Sheet, OverlayBackdrop, AddSheet, FilterSheet, CardDetailSheet, SettingsSheet });
