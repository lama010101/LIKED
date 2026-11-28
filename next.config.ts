import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.188.219.52:3001", "localhost:3000", "localhost:3001", "127.0.0.1:3001"],
  // ship workspace/ HTML mockups to the /proto/[name] route handler on Vercel
  outputFileTracingIncludes: {
    "/proto/[name]": ["./workspace/**/*"],
  },
  async headers() {
    // Landing switch (V2-LANDING-002-A): any response served through an
    // override (?landing=<variant> or the "liked.landing" cookie) is noindex
    // and private. `has` only matches valid variant values; ?landing=default
    // (which clears the cookie) is excluded from the cookie rule.
    const overrideHeaders = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      {
        source: "/",
        has: [{ type: "query" as const, key: "landing", value: "legacy|v2a|v2b" }],
        headers: overrideHeaders,
      },
      {
        source: "/",
        has: [{ type: "cookie" as const, key: "liked.landing", value: "legacy|v2a|v2b" }],
        missing: [{ type: "query" as const, key: "landing", value: "default" }],
        headers: overrideHeaders,
      },
      {
        source: "/delete-account/confirm",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co https://i.ytimg.com https://yt3.ggpht.com https://lh3.googleusercontent.com https://image.tmdb.org",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co https://www.googleapis.com wss://lzkzfqshnjvlzosnntfx.supabase.co",
              "frame-src https://www.youtube.com https://open.spotify.com https://studio.suno.com https://suno.com",
              "media-src 'self' https://*.supabase.co",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
      },
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
