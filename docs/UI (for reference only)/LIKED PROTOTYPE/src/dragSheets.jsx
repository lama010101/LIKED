// src/dragSheets.jsx — drag-to-share (friends/groups) and drag-to-move (folders)

function ShareSheet({ open, onClose, onConfirm, card }) {
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(new Set());

  React.useEffect(() => {
    if (open) { setQuery(''); setSelected(new Set()); }
  }, [open]);

  const toggle = (id) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const q = query.toLowerCase();
  const friends = FRIENDS.filter(f => !f.you && f.name.toLowerCase().includes(q));
  const groups = GROUPS.filter(g => g.name.toLowerCase().includes(q));

  return (
    <Sheet open={open} onClose={onClose} title="Share with" subtitle={card ? `"${card.title}"` : 'Pick friends or groups'}>
      <div className="sheet-section">
        <div className="search-field">
          <IconSearch size={14}/>
          <input placeholder="Search friends or groups…" value={query} onChange={e=>setQuery(e.target.value)}/>
          {query && <IconX size={14} style={{opacity:.6,cursor:'pointer'}} onClick={()=>setQuery('')}/>}
        </div>
      </div>
      {friends.length > 0 && (
        <>
          <div className="sheet-section"><div className="sheet-section-label">Friends</div></div>
          <div className="select-grid">
            {friends.map(f => (
              <div key={f.id} className="select-grid-item" onClick={()=>toggle(f.id)}>
                <div className={`select-avatar ${selected.has(f.id)?'on':''}`} style={{background:f.bg}}>
                  {f.initial}
                </div>
                <div className="select-label">{f.name}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {groups.length > 0 && (
        <>
          <div className="sheet-section"><div className="sheet-section-label">Groups</div></div>
          <div className="select-grid">
            {groups.map(g => (
              <div key={g.id} className="select-grid-item" onClick={()=>toggle(g.id)}>
                <div className={`select-avatar group ${selected.has(g.id)?'on':''}`} style={{background:g.bg}}>
                  {g.initial}
                </div>
                <div className="select-label">{g.name}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {friends.length === 0 && groups.length === 0 && (
        <div style={{textAlign:'center', padding:'32px 18px', color:'var(--text-3)', fontSize:12}}>
          No friends or groups match "{query}"
        </div>
      )}
      <button className={`btn-primary ${selected.size===0?'disabled':''}`}
        disabled={selected.size===0}
        onClick={() => { onConfirm(Array.from(selected)); onClose(); }}>
        {selected.size === 0 ? 'Select to share' : `Share with ${selected.size}`}
      </button>
    </Sheet>
  );
}

function MoveSheet({ open, onClose, onConfirm, card }) {
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(null);
  const [expanded, setExpanded] = React.useState(new Set(['f-fav','f-travel']));

  React.useEffect(() => {
    if (open) { setQuery(''); setSelected(null); }
  }, [open]);

  const q = query.toLowerCase();

  // Build tree
  const getChildren = (parentId) => FOLDERS.filter(f => f.parent === parentId);
  const roots = getChildren(null);

  const toggleExpand = (id) => {
    const n = new Set(expanded);
    n.has(id) ? n.delete(id) : n.add(id);
    setExpanded(n);
  };

  const renderNode = (folder, depth) => {
    const children = getChildren(folder.id);
    const hasChildren = children.length > 0;
    const isOpen = expanded.has(folder.id);
    const visible = !q || folder.name.toLowerCase().includes(q);
    return (
      <React.Fragment key={folder.id}>
        {visible && (
          <div
            onClick={()=>setSelected(folder.id)}
            style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'10px 12px',
              marginLeft: depth * 18,
              background: selected === folder.id ? 'color-mix(in oklab, var(--accent) 14%, transparent)' : 'transparent',
              border: selected === folder.id ? '1px solid color-mix(in oklab, var(--accent) 35%, transparent)' : '1px solid transparent',
              borderRadius: 10,
              cursor:'pointer',
              marginBottom: 2,
            }}
          >
            {hasChildren ? (
              <div onClick={(e)=>{e.stopPropagation(); toggleExpand(folder.id);}}
                style={{width:18, height:18, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)'}}>
                {isOpen ? <IconChevD size={14}/> : <IconChevL size={14} style={{transform:'rotate(180deg)'}}/>}
              </div>
            ) : <div style={{width:18}}/>}
            <div style={{width:12, height:12, borderRadius:3, background: folder.color, flexShrink:0}}/>
            <div style={{flex:1, fontSize:13, color:'var(--text-1)', fontWeight:500}}>{folder.name}</div>
            <div style={{fontSize:10, color:'var(--text-3)'}}>{folder.count}</div>
            {selected === folder.id && <IconCheck size={14} style={{color:'var(--accent)'}}/>}
          </div>
        )}
        {hasChildren && (isOpen || q) && children.map(c => renderNode(c, depth+1))}
      </React.Fragment>
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Move to folder" subtitle={card ? `"${card.title}"` : 'Pick any folder, any depth'}>
      <div className="sheet-section">
        <div className="search-field">
          <IconSearch size={14}/>
          <input placeholder="Search folders…" value={query} onChange={e=>setQuery(e.target.value)}/>
          {query && <IconX size={14} style={{opacity:.6,cursor:'pointer'}} onClick={()=>setQuery('')}/>}
        </div>
      </div>
      <div style={{padding: '0 18px 18px'}}>
        <div className="sheet-section-label" style={{marginBottom:8}}>All folders</div>
        <div style={{maxHeight: 340, overflowY:'auto'}}>
          {roots.map(f => renderNode(f, 0))}
        </div>
      </div>
      <button className={`btn-primary ${!selected?'disabled':''}`} disabled={!selected}
        onClick={()=>{ onConfirm(selected); onClose(); }}>
        {selected ? `Move to ${FOLDERS.find(f=>f.id===selected)?.name}` : 'Select a folder'}
      </button>
    </Sheet>
  );
}

Object.assign(window, { ShareSheet, MoveSheet });
