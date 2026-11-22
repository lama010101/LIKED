import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { LANDING_VARIANT } from "@/components/landing/config";
import LandingV2 from "@/components/landing/LandingV2";
import LegacyLanding from "@/components/landing/LegacyLanding";

export async function generateMetadata(): Promise<Metadata> {
  if (LANDING_VARIANT === "legacy") return {};
  const t = await getTranslations("landing.meta");
  const title = t("title");
  const description = t("description");
  const images = [{ url: "/logo-512.png", width: 512, height: 512 }];
  return {
    title: { absolute: title },
    description,
    openGraph: { title, description, siteName: "LIKED", images, type: "website" },
    twitter: { card: "summary", title, description, images: ["/logo-512.png"] },
  };
}

export default async function RootPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in users go straight to their feed.
  if (user) {
    redirect("/feed");
  }

  return LANDING_VARIANT === "legacy" ? <LegacyLanding /> : <LandingV2 />;
}
