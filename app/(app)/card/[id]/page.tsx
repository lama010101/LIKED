import { getSessionUser } from "@/app/lib/actions/session";
import { fetchCardDetail } from "@/app/lib/actions/cardDetail";
import { redirect, notFound } from "next/navigation";
import CardView from "./_components/CardView";

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const res = await fetchCardDetail(id, user.language_code ?? "en");
  if (!res.ok) notFound();
  return <CardView detail={res.detail} />;
}
