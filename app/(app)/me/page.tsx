import { getSessionUser } from "@/app/lib/actions/session";
import { redirect } from "next/navigation";
import MeView from "./_components/MeView";

export default async function MePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <MeView user={user} />;
}
