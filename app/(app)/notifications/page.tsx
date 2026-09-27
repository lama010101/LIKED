import { getSessionUser } from "@/app/lib/actions/session";
import { listNotificationsAction } from "@/app/lib/actions/mvp2";
import { redirect } from "next/navigation";
import NotificationsView from "./_components/NotificationsView";

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const items = await listNotificationsAction(50);
  return <NotificationsView items={items} />;
}
