import { getSessionUser } from "@/app/lib/actions/session";
import { getYoutubeConsentAction } from "@/app/lib/actions/mvp2";
import { redirect } from "next/navigation";
import YouTubeView from "./_components/YouTubeView";

export default async function YouTubePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const consent = await getYoutubeConsentAction();
  return <YouTubeView consent={consent} />;
}
