import type { Metadata } from "next";
import { Inter, Fraunces, Caveat, Noto_Sans_Thai } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import "./globals.css";
import "./v2-tokens.css";
import Toaster from "@/components/ui/Toaster";
import {
  ACCENT_PRESET_NAMES,
  ACCENT_RE,
  DEFAULT_ACCENT,
  resolveCustomAccent,
} from "@/lib/theme/contrast";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const caveat = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://liked-zeta.vercel.app"),
  title: {
    default: "LIKED — Save and share what you like",
    template: "%s · LIKED",
  },
  description:
    "LIKED is a content-sharing app where you save links and notes as cards, organize them with folders and tags, and share them with exactly the people you choose through explicit connections.",
  applicationName: "LIKED",
  icons: {
    icon: [
      { url: "/logo-32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo-48.png", sizes: "48x48", type: "image/png" },
      { url: "/logo-192.png", sizes: "192x192", type: "image/png" },
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/logo-180.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/logo-32.png"],
  },
  openGraph: {
    title: "LIKED — Save and share what you like",
    description:
      "Save links and notes as cards, organize them with folders and tags, and share with exactly the people you choose.",
    siteName: "LIKED",
    images: [{ url: "/logo-512.png", width: 512, height: 512 }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "LIKED — Save and share what you like",
    description:
      "Save links and notes as cards, organize them with folders and tags, and share with exactly the people you choose.",
    images: ["/logo-512.png"],
  },
};

const THEMES = new Set(["light", "dark", "system"]);
const THEME_COOKIE = "LIKED_THEME";
const ACCENT_COOKIE = "LIKED_ACCENT";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const store = await cookies();
  const themeRaw = store.get(THEME_COOKIE)?.value;
  const theme = themeRaw && THEMES.has(themeRaw) ? themeRaw : "system";
  const accentRaw = store.get(ACCENT_COOKIE)?.value ?? "";
  let accent: string = DEFAULT_ACCENT;
  let accentStyle: React.CSSProperties | undefined;
  if ((ACCENT_PRESET_NAMES as readonly string[]).includes(accentRaw)) {
    accent = accentRaw;
  } else if (ACCENT_RE.test(accentRaw)) {
    accent = "custom";
    const r = resolveCustomAccent(accentRaw);
    accentStyle = {
      "--v2-accent-lt": r.light.accent,
      "--v2-on-lt": r.light.onAccent,
      "--v2-accent-dk": r.dark.accent,
      "--v2-on-dk": r.dark.onAccent,
    } as React.CSSProperties;
  }
  return (
    <html
      lang={locale}
      data-theme={theme}
      data-accent={accent}
      style={accentStyle}
      className={`${inter.variable} ${fraunces.variable} ${caveat.variable} ${notoSansThai.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
