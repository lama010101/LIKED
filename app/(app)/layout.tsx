import { redirect } from "next/navigation";
import { getSessionUser, getFriendBarAction } from "@/app/lib/actions/session";
import { getUnreadNotificationCountAction } from "@/app/lib/actions/notifications";
import AppShell from "./_components/AppShell";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [friends, unread] = await Promise.all([
    getFriendBarAction().catch(() => []),
    getUnreadNotificationCountAction().catch(() => 0),
  ]);
  return (
    <AppShell user={user} friends={friends} initialUnread={unread}>
      {children}
    </AppShell>
  );
}
