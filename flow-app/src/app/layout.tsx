import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";

export const metadata: Metadata = {
  title: "Flow — AI Studio",
  description:
    "A Google Flow-style dual-form-factor workspace for AI-generated assets. Mocked Gemini/Veo calls.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-ink font-sans text-zinc-200">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
