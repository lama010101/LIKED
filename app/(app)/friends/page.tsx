import { getSessionUser, getFriendBarAction, getGroupBarAction } from "@/app/lib/actions/session";
import { redirect } from "next/navigation";
import FriendsView from "./_components/FriendsView";

export default async function FriendsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [friends, groups] = await Promise.all([getFriendBarAction(), getGroupBarAction()]);
  return <FriendsView friends={friends} groups={groups} />;
}
