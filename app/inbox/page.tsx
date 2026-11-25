import { redirect } from "next/navigation";
import { getSessionUser } from "@/app/lib/actions/session";
import { getUnreadNotificationCountAction } from "@/app/lib/actions/notifications";
import {
  ensureMyAskAction,
  getInboxAction,
  getMyPrefsAction,
} from "@/app/lib/actions/v2-owner";
import InboxView from "@/components/v2/inbox/InboxView";

/** Owner inbox page (PLAN-V2-002 §8.1 P0-16). Auth is enforced here as well as
 *  in proxy.ts; every read goes through the class-O RPCs with the owner's
 *  cookie-session client. ensure_my_ask runs on first load (PRD §6.1). */
export default async function InboxPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [ask, inbox, prefs, unread] = await Promise.all([
    ensureMyAskAction(),
    getInboxAction(),
    getMyPrefsAction(),
    getUnreadNotificationCountAction().catch(() => 0),
  ]);

  return (
    <InboxView
      initial={inbox}
      ask={ask}
      region={prefs.region_code ?? "US"}
      unread={unread}
    />
  );
}
