"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FeedNode } from "@/lib/types/feed";
import type { AccessEntry, Mvp2FolderDetail } from "@/app/lib/actions/mvp2";
import {
  renameFolderAction, setFolderDetailsAction, trashFolderAction,
  rateFolderAction, shareFolderV2Action, revokeFolderGrantAction,
  setFolderGrantPermissionAction,
} from "@/app/lib/actions/mvp2";
import { getFriendBarAction, getGroupBarAction } from "@/app/lib/actions/session";
import { toast } from "@/lib/store/toastStore";
import Modal from "../../../_components/Modal";
import Avatar from "../../../_components/Avatar";
import ShareSheet from "../../../_components/ShareSheet";
import RatingSlider from "../../../_components/RatingSlider";
import CardItem from "../../../_components/CardItem";
import ViewSwitch, { useCardView } from "../../../_components/ViewSwitch";

const PERMS = ["view", "comment", "contribute", "edit", "reshare", "admin"] as const;

export default function FolderView({
  folder, nodes, totalCount, access, isOwner, myPermission,
}: {
  folder: Mvp2FolderDetail;
  nodes: FeedNode[];
  totalCount: number;
  access: AccessEntry[];
  isOwner: boolean;
  myPermission: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const canEdit = isOwner || ["edit", "reshare", "admin"].includes(myPermission);
  const canShare = isOwner || ["reshare", "admin"].includes(myPermission);
  const isSystem = !!folder.system_kind;

  const [view, pickView] = useCardView();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const [desc, setDesc] = useState(folder.description ?? "");
  const [color, setColor] = useState(folder.color_hex ?? "#ff3b30");
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const saveDetails = async () => {
    setBusy(true);
    try {
      if (!isSystem && name.trim() && name !== folder.name) {
        await renameFolderAction(folder.id, name.trim());
      }
      await setFolderDetailsAction(folder.id, desc.trim() || null, color);
      toast.success(t("me.saved"));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
      setRenaming(false);
    }
  };

  const onTrash = async () => {
    if (!confirm(t("trash.deleteConfirm"))) return;
    try {
      await trashFolderAction(folder.id);
      router.push("/feed");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  return (
    <div className="folder-view">
      {/* Breadcrumb */}
      <nav className="crumbs" aria-label="breadcrumb">
        <Link href="/feed">{t("nav.home")}</Link>
        {folder.breadcrumb?.map((b) => (
          <span key={b.id}> / <Link href={`/folders/${b.id}`}>{b.name}</Link></span>
        ))}
        <span> / {folder.name}</span>
      </nav>

      <div className="folder-head">
        <div className="fh-title" style={{ borderColor: color }}>
          <h1>{folder.name}</h1>
          {isSystem && <span className="ft-sys">{t("folder.systemFolder")}</span>}
          {folder.is_shared && <span className="ft-shared">⇄</span>}
        </div>
        {!isOwner && <p className="muted">{t("folder.sharedBy", { name: folder.owner_name })}</p>}
        {folder.description && <p className="muted">{folder.description}</p>}

        <div className="folder-actions">
          <RatingSlider initial={null} onRate={(s) => rateFolderAction(folder.id, s)} label={t("folder.rateFolder")} />
          {canEdit && !isSystem && <button className="btn" onClick={() => setRenaming(true)}>{t("folder.setDetails")}</button>}
          {canShare && <button className="btn" onClick={() => setShareOpen(true)}>{t("folder.shareFolder")}</button>}
          {isOwner && !isSystem && <button className="btn btn-danger" onClick={onTrash}>{t("folder.trashFolder")}</button>}
        </div>
      </div>

      {/* Subfolders */}
      {folder.children?.length > 0 && (
        <section>
          <h2 className="sec-title">{t("folder.subfolders")}</h2>
          <div className="folder-row">
            {folder.children.map((c) => (
              <Link key={c.id} href={`/folders/${c.id}`} className="folder-tile">
                <div className="ft-name">{c.name}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Member cards (visible to me via edges) — same 3 views as home */}
      <section>
        <div className="feed-head">
          <h2 className="sec-title">{t("folder.members")} · {totalCount}</h2>
          <ViewSwitch view={view} onPick={pickView} />
        </div>
        {nodes.length === 0 ? (
          <p className="empty-note">{t("folder.empty")}</p>
        ) : (
          <div className={`cards cards-${view}`}>
            {nodes.map((n) => (
              <Link key={n.node_id} href={`/card/${n.node_id}`} className="card-link">
                <CardItem node={n} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Access list — owner only (Q20) */}
      {isOwner && (
        <section>
          <h2 className="sec-title">{t("share.accessList")}</h2>
          {access.length === 0 ? (
            <p className="muted">{t("share.ownerOnly")}</p>
          ) : (
            <ul className="access-list">
              {access.map((a) => {
                const gid = a.grantee_id ?? a.user_id!;
                return (
                  <li key={gid} className="access-row">
                    <Avatar userId={gid} avatarKey={a.avatar_key} name={a.display_name} size={28} />
                    <span className="access-name">{a.display_name}</span>
                    <select
                      value={a.permission}
                      onChange={async (e) => {
                        await setFolderGrantPermissionAction(folder.id, gid, e.target.value);
                        router.refresh();
                      }}
                    >
                      {PERMS.map((p) => <option key={p} value={p}>{t(`folder.permission${p[0].toUpperCase()}${p.slice(1)}` as const)}</option>)}
                    </select>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={async () => {
                        await revokeFolderGrantAction(folder.id, gid);
                        router.refresh();
                      }}
                    >
                      {t("share.revoke")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Details modal */}
      <Modal open={renaming} onClose={() => setRenaming(false)} title={t("folder.setDetails")}>
        <div className="form">
          <label className="fld"><span>{t("common.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={isSystem} />
          </label>
          <label className="fld"><span>{t("common.description")}</span>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
          <label className="fld"><span>Color</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setRenaming(false)}>{t("common.cancel")}</button>
          <button className="btn btn-primary" onClick={saveDetails} disabled={busy}>{t("common.save")}</button>
        </div>
      </Modal>

      {/* Share sheet */}
      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        loadTargets={async () => {
          const [fr, gr] = await Promise.all([getFriendBarAction(), getGroupBarAction()]);
          return {
            friends: fr.filter((f) => f.user_id).map((f) => ({ id: f.user_id!, name: f.display_name ?? "", avatarKey: f.avatar_key })),
            groups: gr.map((g) => ({ id: g.id, name: g.name })),
          };
        }}
        onShare={async ({ permission, userIds, groupIds, allFriends }) => {
          await shareFolderV2Action(folder.id, permission, userIds, groupIds, allFriends);
          toast.success(t("share.sharedOk"));
        }}
      />
    </div>
  );
}
