import { getSessionUser } from "@/app/lib/actions/session";
import { getTrashItemsAction } from "@/app/lib/actions/mvp2";
import { redirect } from "next/navigation";
import TrashView from "./_components/TrashView";

export default async function TrashPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const items = await getTrashItemsAction();
  return <TrashView items={items} />;
}
