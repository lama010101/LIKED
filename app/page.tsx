import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { LANDING_COOKIE, LANDING_QUERY } from "@/components/landing/config";
import LandingOverrideSync from "@/components/landing/LandingOverrideSync";
import LandingSwitchPill from "@/components/landing/LandingSwitchPill";
import LandingV2 from "@/components/landing/LandingV2";
import LandingV2b from "@/components/landing/v2b/LandingV2b";
import LegacyLanding from "@/components/landing/LegacyLanding";
import { resolveLandingVariant, type LandingResolution } from "@/lib/landing/resolve";
import { SIGNED_IN_HOME } from "@/lib/v2/home";

// Landing switch (V2-LANDING-002-A). "/" resolves its variant per request with
// the pure resolver: ?landing= > cookie "liked.landing" > env LANDING_VARIANT >
// default v2a. With no env var and no override the default branch below is
// byte-for-byte the previous behaviour. The root layout already reads cookies
// (theme/locale), so "/" was dynamic before this change; nothing regressed.
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function resolve(searchParams: SearchParams): Promise<LandingResolution> {
  const sp = await searchParams;
  const store = await cookies();
  return resolveLandingVariant({
    query: sp[LANDING_QUERY],
    cookie: store.get(LANDING_COOKIE)?.value,
    env: process.env.LANDING_VARIANT,
  });
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const r = await resolve(searchParams);
  // Overridden responses and the v2b page are never indexed.
  const robots = r.override || r.variant === "v2b" ? { index: false, follow: false } : undefined;

  if (r.variant === "v2b") {
    const t = await getTranslations("landing.v2b.meta");
    const title = t("title");
    const description = t("description");
    const images = [{ url: "/og/landing-v2b.png", width: 1200, height: 630, alt: t("ogAlt") }];
    return {
      title: { absolute: title },
      description,
      alternates: { canonical: "/" },
      robots,
      openGraph: { title, description, siteName: "LIKED", images, type: "website", url: "/" },
      twitter: { card: "summary_large_image", title, description, images: ["/og/landing-v2b.png"] },
    };
  }
  if (r.variant === "legacy") return robots ? { robots } : {};
  const t = await getTranslations("landing.meta");
  const title = t("title");
  const description = t("description");
  const images = [{ url: "/logo-512.png", width: 512, height: 512 }];
  return {
    title: { absolute: title },
    description,
    ...(robots ? { robots } : {}),
    openGraph: { title, description, siteName: "LIKED", images, type: "website" },
    twitter: { card: "summary", title, description, images: ["/logo-512.png"] },
  };
}

export default async function RootPage({ searchParams }: { searchParams: SearchParams }) {
  const r = await resolve(searchParams);

  // Override plumbing: renders nothing at all when no override/query is active.
  const sync =
    r.cookie === "set" ? <LandingOverrideSync action="set" variant={r.variant} />
    : r.cookie === "clear" ? <LandingOverrideSync action="clear" />
    : null;
  const pill = r.override ? <LandingSwitchPill current={r.variant} /> : null;

  // v2b: no server-side auth call and no redirect; the header resolves
  // "Sign in" / "Open app" on the client after hydration.
  if (r.variant === "v2b") {
    return (
      <>
        {sync}
        <LandingV2b />
        {pill}
      </>
    );
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in users go straight to the v2 home (P0-16 switch: one constant
  // in lib/v2/home.ts; the legacy app stays reachable by URL).
  if (user) {
    redirect(SIGNED_IN_HOME);
  }

  return (
    <>
      {sync}
      {r.variant === "legacy" ? <LegacyLanding /> : <LandingV2 />}
      {pill}
    </>
  );
}
