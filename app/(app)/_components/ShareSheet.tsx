"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "./Modal";
import Avatar from "./Avatar";
import { toast } from "@/lib/store/toastStore";

export interface ShareTargets {
  friends: { id: string; name: string; avatarKey: string | null }[];
  groups: { id: string; name: string }[];
}

/**
 * Share dialog (Phase 6): friends / groups / all-friends + role picker.
 * Q3: all-friends = snapshot edges per current friend. Q4: group = snapshot
 * expansion to current members. Caller supplies the share action.
 */
const PERMS = ["view", "comment", "contribute", "edit", "reshare"] as const;

export default function ShareSheet({
  open, onClose, loadTargets, onShare, shareUrl,
}: {
  open: boolean;
  onClose: () => void;
  loadTargets: () => Promise<ShareTargets>;
  onShare: (sel: { permission: string; userIds: string[]; groupIds: string[]; allFriends: boolean }) => Promise<void>;
  /** External link for copy / native share (UX-BATCH-004).
   *  Note: recipients still need an account with access — anonymous
   *  public links need a share-token migration (flagged to user). */
  shareUrl?: string;
}) {
  const t = useTranslations();
  const [targets, setTargets] = useState<ShareTargets>({ friends: [], groups: [] });
  const [users, setUsers] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [allFriends, setAllFriends] = useState(false);
  const [perm, setPerm] = useState<string>("view");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    loadTargets().then(setTargets).catch(() => {});
  }, [open, loadTargets]);

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    apply(next);
  };

  const submit = async () => {
    if (users.size === 0 && groups.size === 0 && !allFriends) return;
    setBusy(true);
    try {
      await onShare({ permission: perm, userIds: [...users], groupIds: [...groups], allFriends });
      setUsers(new Set()); setGroups(new Set()); setAllFriends(false);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("share.title")}>
      {shareUrl && (
        <div className="share-link">
          <button
            type="button"
            className="btn share-copy"
            onClick={() => {
              navigator.clipboard.writeText(shareUrl).then(
                () => toast.success(t("share.linkCopied")),
                () => toast.error(t("common.error"))
              );
            }}
          >
            {t("share.copyLink")}
          </button>
          {typeof navigator !== "undefined" && !!navigator.share && (
            <button
              type="button"
              className="btn share-native"
              onClick={() => navigator.share({ url: shareUrl }).catch(() => {})}
            >
              {t("share.shareVia")}
            </button>
          )}
        </div>
      )}
      <label className="fld">
        <span>{t("share.permission")}</span>
        <select value={perm} onChange={(e) => setPerm(e.target.value)}>
          {PERMS.map((p) => (
            <option key={p} value={p}>{t(`folder.permission${p[0].toUpperCase()}${p.slice(1)}` as `folder.permissionView`)}</option>
          ))}
        </select>
      </label>

      <h3 className="sec-title">{t("share.friends")}</h3>
      {targets.friends.length === 0 ? (
        <p className="muted">{t("share.noFriends")}</p>
      ) : (
        <>
          <label className="pick-row">
            <input type="checkbox" checked={allFriends} onChange={(e) => setAllFriends(e.target.checked)} />
            <span>{t("share.allFriends")}</span>
          </label>
          <div className="pick-list">
            {targets.friends.map((f) => (
              <label key={f.id} className="pick-row">
                <input
                  type="checkbox"
                  checked={users.has(f.id)}
                  disabled={allFriends}
                  onChange={() => toggle(users, f.id, setUsers)}
                />
                <Avatar userId={f.id} avatarKey={f.avatarKey} name={f.name} size={24} />
                <span>{f.name}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {targets.groups.length > 0 && (
        <>
          <h3 className="sec-title">{t("share.groups")}</h3>
          <div className="pick-list">
            {targets.groups.map((g) => (
              <label key={g.id} className="pick-row">
                <input type="checkbox" checked={groups.has(g.id)} onChange={() => toggle(groups, g.id, setGroups)} />
                <span>{g.name}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <p className="muted">{t("share.snapshotNote")}</p>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{t("share.send")}</button>
      </div>
    </Modal>
  );
}
