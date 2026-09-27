"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { FriendBarEntry, GroupBarEntry } from "@/lib/db/friends";
import { inviteFriendAction, removeFriendAction, blockUserAction, createGroupAction, deleteGroupAction, addGroupMemberAction } from "@/app/lib/actions/mvp2";
import Avatar from "../../_components/Avatar";
import Modal from "../../_components/Modal";
import { toast } from "@/lib/store/toastStore";

/** Friends & groups management (Phase 6). */
export default function FriendsView({ friends, groups }: { friends: FriendBarEntry[]; groups: GroupBarEntry[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [groupName, setGroupName] = useState("");
  const [addMemberTo, setAddMemberTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="friends-view">
      <h1 className="sec-title">{t("friends.title")}</h1>

      {/* Invite */}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email.trim()) return;
          run(async () => { await inviteFriendAction(email.trim()); setEmail(""); }, t("friends.inviteSent"));
        }}
      >
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("friends.invitePlaceholder")} inputMode="email" />
        <button className="btn btn-primary" disabled={busy}>{t("friends.invite")}</button>
      </form>

      {/* Friends */}
      <section>
        <h2 className="sec-title">{t("share.friends")}</h2>
        {friends.length === 0 && <p className="muted">{t("friends.emptyFriends")}</p>}
        <ul className="access-list">
          {friends.map((f) => (
            <li key={f.user_id ?? f.to_email ?? f.display_name} className="access-row">
              <Avatar userId={f.user_id ?? ""} avatarKey={f.avatar_key} name={f.display_name ?? f.to_email ?? "?"} size={32} />
              <span className="access-name">{f.display_name ?? f.to_email}</span>
              {f.is_pending && <span className="muted">{t("friends.pending")}</span>}
              {f.user_id && (
                <>
                  <button className="btn btn-sm" onClick={() => run(() => removeFriendAction(f.user_id!))}>{t("friends.remove")}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => run(() => blockUserAction(f.user_id!))}>{t("friends.block")}</button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Groups */}
      <section>
        <div className="feed-head">
          <h2 className="sec-title">{t("friends.groups")}</h2>
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!groupName.trim()) return;
            run(async () => { await createGroupAction(groupName.trim()); setGroupName(""); });
          }}
        >
          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={t("friends.groupName")} />
          <button className="btn" disabled={busy}>{t("friends.newGroup")}</button>
        </form>
        {groups.length === 0 && <p className="muted">{t("friends.emptyGroups")}</p>}
        <ul className="access-list">
          {groups.map((g) => (
            <li key={g.id} className="access-row">
              <span className="access-name">{g.name}</span>
              <span className="muted">{g.member_count ?? ""}</span>
              <button className="btn btn-sm" onClick={() => setAddMemberTo(g.id)}>{t("friends.addMember")}</button>
              <button className="btn btn-danger btn-sm" onClick={() => run(() => deleteGroupAction(g.id))}>{t("common.delete")}</button>
            </li>
          ))}
        </ul>
      </section>

      {/* Add member modal */}
      <Modal open={!!addMemberTo} onClose={() => setAddMemberTo(null)} title={t("friends.addMember")}>
        <div className="pick-list">
          {friends.filter((f) => f.user_id).map((f) => (
            <button
              key={f.user_id}
              className="pick-row btn-ghost"
              onClick={() => run(async () => { await addGroupMemberAction(addMemberTo!, f.user_id!); setAddMemberTo(null); })}
            >
              <Avatar userId={f.user_id!} avatarKey={f.avatar_key} name={f.display_name ?? "?"} size={24} />
              <span>{f.display_name}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
