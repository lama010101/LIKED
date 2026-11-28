import { headers } from "next/headers";
import { redirect } from "next/navigation";
import pkg from "@/package.json";
import { getSessionUser } from "@/app/lib/actions/session";
import { getMyPrefsAction } from "@/app/lib/actions/v2-owner";
import SettingsView from "@/components/v2/settings/SettingsView";

const REGION_RE = /^[A-Z]{2}$/;

/** Settings page (PLAN-V2-002 §8.1 P0-19, PRD §6.9). Auth is enforced here as
 *  well as in proxy.ts. The only IP-derived value is the suggested streaming
 *  region (PLAN §7.2 item 3) — never the language. */
export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [prefs, headerStore] = await Promise.all([getMyPrefsAction(), headers()]);
  const country = headerStore.get("x-vercel-ip-country");
  const suggestedRegion = country && REGION_RE.test(country) ? country : null;

  return (
    <SettingsView
      displayName={user.display_name ?? ""}
      email={user.email ?? null}
      prefs={prefs}
      suggestedRegion={suggestedRegion}
      version={pkg.version}
    />
  );
}
