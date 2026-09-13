'use client';

/**
 * FriendManagerModal — PROTO V2 .friend-manager overlay (UIX-PORT-00 / UIX-11).
 * Full-screen Friends & Groups manager:
 *   Friends tab — invite-by-email + friend rows (tap → FriendActionSheet:
 *                 view feed / remove / block) + pending invites
 *   Groups tab  — group rows (initials, member count) + New group form
 *                 (name + member checkboxes → dndAutoCreateGroup)
 * No group edit/delete/member-management — no backend for it (scope).
 */

import { useEffect, useState } from 'react';
import { getFriendBarAction, getGroupBarAction } from '@/app/lib/actions/session';
import { sendFriendInviteAction } from '@/app/lib/actions/friends';
import { dndAutoCreateGroup } from '@/app/lib/actions/dnd';
import { toast } from '@/lib/store/toastStore';
import { supabaseBrowser } from '@/lib/supabase/client';
import FriendActionSheet, { type FriendSheetTarget } from '@/components/sheets/FriendActionSheet';
import type { FriendBarEntry, GroupBarEntry } from '@/lib/db/friends';

const XIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const GROUP_COLORS = ['var(--accent)', 'var(--blue)', 'var(--purple)', 'var(--green)', 'var(--orange)'];

interface FriendManagerModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'friends' | 'groups';
  /** Called after any friend/group mutation so the rail can refresh. */
  onChanged?: () => void;
}

export default function FriendManagerModal({
  open,
  onClose,
  initialTab = 'friends',
  onChanged,
}: FriendManagerModalProps) {
  const [tab, setTab] = useState<'friends' | 'groups'>(initialTab);
  const [friends, setFriends] = useState<FriendBarEntry[]>([]);
  const [groups, setGroups] = useState<GroupBarEntry[]>([]);
  const [sheetTarget, setSheetTarget] = useState<FriendSheetTarget | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<Set<string>>(new Set());
  const [createBusy, setCreateBusy] = useState(false);

  const reload = () => {
    getFriendBarAction().then(setFriends).catch(() => {});
    getGroupBarAction().then(setGroups).catch(() => {});
  };

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setTab(initialTab);
      reload();
    });
  }, [open, initialTab]);

  if (!open) return null;

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email || inviteBusy) return;
    setInviteBusy(true);
    setInviteError(null);
    const res = await sendFriendInviteAction(email);
    setInviteBusy(false);
    if (res.error === 'ALREADY_SENT') setInviteError('Invite already sent to this email');
    else if (res.error === 'INVALID_EMAIL') setInviteError('Enter a valid email address');
    else if (!res.ok) setInviteError(res.error ?? 'Failed to send invite');
    else {
      setInviteSent(true);
      setInviteEmail('');
      setTimeout(() => setInviteSent(false), 2000);
      reload();
      onChanged?.();
    }
  };

  const handleCreateGroup = async () => {
    const name = groupName.trim();
    if (!name || createBusy) return;
    setCreateBusy(true);
    const res = await dndAutoCreateGroup(name, [...groupMembers]);
    setCreateBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? 'Create group failed');
      return;
    }
    setCreating(false);
    setGroupName('');
    setGroupMembers(new Set());
    reload();
    onChanged?.();
  };

  const friendAvatar = (f: FriendBarEntry) =>
    f.avatar_key
      ? { backgroundImage: `url('${supabaseBrowser.storage.from('avatars').getPublicUrl(f.avatar_key).data.publicUrl}')` }
      : undefined;

  return (
    <>
      <div className="friend-manager" role="dialog" aria-modal="true" aria-label="Friends & Groups">
        <div className="friend-manager-header">
          <span>Friends & Groups</span>
          <button type="button" className="tree-picker-close" onClick={onClose} aria-label="Close">
            {XIcon}
          </button>
        </div>

        <div className="friend-manager-tabs">
          <button
            type="button"
            className={`fm-tab${tab === 'friends' ? ' active' : ''}`}
            onClick={() => setTab('friends')}
          >
            Friends
          </button>
          <button
            type="button"
            className={`fm-tab${tab === 'groups' ? ' active' : ''}`}
            onClick={() => setTab('groups')}
          >
            Groups
          </button>
        </div>

        <div className="friend-manager-body">
          {tab === 'friends' && (
            <>
              {/* Invite-by-email row */}
              <div className="fm-section">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="email"
                    className="fm-input"
                    placeholder="Invite by email…"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInvite();
                    }}
                    disabled={inviteBusy}
                  />
                  <button
                    type="button"
                    className="fm-add-btn"
                    onClick={handleInvite}
                    disabled={inviteBusy || !inviteEmail.trim()}
                  >
                    {inviteSent ? 'Sent' : inviteBusy ? '…' : 'Invite'}
                  </button>
                </div>
                {inviteError && (
                  <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>{inviteError}</div>
                )}
                {inviteSent && (
                  <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 6 }}>Invite sent</div>
                )}
              </div>

              <div className="fm-section">
                <span className="fm-head">Your friends</span>
                {friends.length === 0 && <div className="fm-empty">No friends yet — invite someone above</div>}
                {friends.map((f, idx) => {
                  const key = f.user_id ?? f.to_email ?? `pending-${idx}`;
                  const name = f.display_name ?? f.to_email ?? 'Pending';
                  return (
                    <button
                      key={key}
                      type="button"
                      className="fm-friend-row"
                      style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border-1)', textAlign: 'left', cursor: f.is_pending ? 'default' : 'pointer' }}
                      onClick={() => {
                        if (f.is_pending || !f.user_id) return;
                        setSheetTarget({ userId: f.user_id, displayName: name });
                      }}
                      aria-label={f.is_pending ? `${name} (invite pending)` : `${name} actions`}
                    >
                      <span className="fm-avatar" style={friendAvatar(f)}>
                        {!f.avatar_key && name.charAt(0).toUpperCase()}
                      </span>
                      <span className="fm-name">
                        {name}
                        {f.is_pending && <span className="fm-sub"> · Invite pending</span>}
                      </span>
                      {!f.is_pending && f.user_id && (
                        <span className="fm-edit-btn" style={{ border: 'none', background: 'none', padding: '8px 4px' }} aria-hidden="true">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'groups' && (
            <>
              <div className="fm-section">
                {groups.map((g, i) => (
                  <div key={g.id} className="fm-group-row">
                    <span
                      className="fm-group-avatar"
                      style={{ background: GROUP_COLORS[i % GROUP_COLORS.length] }}
                    >
                      {g.name
                        .split(' ')
                        .map((w) => w[0])
                        .filter(Boolean)
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span className="fm-name">{g.name}</span>
                    <span className="fm-sub">
                      {g.member_count != null ? `${g.member_count} member${g.member_count === 1 ? '' : 's'}` : ''}
                    </span>
                  </div>
                ))}
                {groups.length === 0 && !creating && (
                  <div className="fm-empty">No groups yet</div>
                )}
              </div>

              {!creating ? (
                <button type="button" className="fm-new-group" onClick={() => setCreating(true)}>
                  + New group
                </button>
              ) : (
                <div className="fm-section">
                  <input
                    type="text"
                    className="fm-input"
                    placeholder="Group name…"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    maxLength={50}
                    autoFocus
                  />
                  <span className="fm-head" style={{ marginTop: 12 }}>
                    Members
                  </span>
                  {friends
                    .filter((f) => f.user_id && !f.is_pending)
                    .map((f) => (
                      <label key={f.user_id} className="fm-check-row">
                        <input
                          type="checkbox"
                          className="fm-check"
                          checked={groupMembers.has(f.user_id!)}
                          onChange={() =>
                            setGroupMembers((prev) => {
                              const next = new Set(prev);
                              if (next.has(f.user_id!)) next.delete(f.user_id!);
                              else next.add(f.user_id!);
                              return next;
                            })
                          }
                        />
                        <span className="fm-avatar" style={friendAvatar(f)}>
                          {!f.avatar_key && (f.display_name ?? '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="fm-name">{f.display_name ?? 'Member'}</span>
                      </label>
                    ))}
                  <div className="fm-actions">
                    <button
                      type="button"
                      className="tree-picker-cancel"
                      onClick={() => {
                        setCreating(false);
                        setGroupName('');
                        setGroupMembers(new Set());
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="tree-picker-confirm"
                      disabled={!groupName.trim() || createBusy}
                      onClick={handleCreateGroup}
                    >
                      {createBusy ? 'Creating…' : 'Create group'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <FriendActionSheet
        friend={sheetTarget}
        onClose={() => setSheetTarget(null)}
        onChanged={() => {
          reload();
          onChanged?.();
        }}
      />
    </>
  );
}
