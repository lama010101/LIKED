import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import DeletePanel from "./_components/DeletePanel";

export const dynamic = "force-dynamic";

export default async function DeleteAccountSettingsPage() {
  const t = await getTranslations("deletion");
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/delete");

  // What the sheet must list (PRD v2.6 §10.2 / v2.6 change log):
  // owned groups, chat messages sent, direct chats participated in.
  const uid = user.id;
  const [groups, messages, chats] = await Promise.all([
    supabase.from("groups").select("id", { count: "exact", head: true }).eq("owner_id", uid),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("sender_id", uid),
    supabase
      .from("direct_chats")
      .select("id", { count: "exact", head: true })
      .or(`user_1_id.eq.${uid},user_2_id.eq.${uid}`),
  ]);

  return (
    <main>
      <h1>{t("sheetTitle")}</h1>
      <p>{t("sheetIntro")}</p>
      <ul>
        <li>{t("itemInbox")}</li>
        <li>{t("itemLibrary")}</li>
        <li>{t("itemRecommendations")}</li>
        <li>{t("itemNotifications")}</li>
        <li>
          {t("itemGroups", { count: groups.count ?? 0 })}
        </li>
        <li>
          {t("itemMessages", { count: messages.count ?? 0 })}
        </li>
        <li>
          {t("itemDirectChats", { count: chats.count ?? 0 })}
        </li>
      </ul>
      <p>{t("cannotUndo")}</p>
      <DeletePanel />
    </main>
  );
}
