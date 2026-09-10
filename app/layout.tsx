import type { Metadata } from "next";
import { Inter, Fraunces, Caveat } from "next/font/google";
import "./globals.css";
import ToastContainer from "@/components/ToastContainer";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${fraunces.variable} ${caveat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
