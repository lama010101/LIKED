import { getSessionUser } from "@/app/lib/actions/session";
import { getOrganizeBatchAction } from "@/app/lib/actions/mvp2";
import { redirect, notFound } from "next/navigation";
import BatchView from "./_components/BatchView";

export default async function OrganizeBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { batchId } = await params;
  const items = await getOrganizeBatchAction(batchId).catch(() => null);
  if (!items) notFound();
  return <BatchView batchId={batchId} items={items} />;
}
