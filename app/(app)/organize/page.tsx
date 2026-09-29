import { getSessionUser } from "@/app/lib/actions/session";
import { getOrganizeBatchesAction, getFoldersAction } from "@/app/lib/actions/mvp2";
import { redirect } from "next/navigation";
import OrganizeHome from "./_components/OrganizeHome";

export default async function OrganizePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [batches, folders] = await Promise.all([getOrganizeBatchesAction(), getFoldersAction()]);
  return <OrganizeHome batches={batches} folders={folders.filter((f) => f.owner_id === user.id)} />;
}
