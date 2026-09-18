import { redirect } from "next/navigation";
import Image from "next/image";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in users go straight to their feed.
  if (user) {
    redirect("/feed");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text-1)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 32px",
          borderBottom: "1px solid var(--border-1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Image
            src="/logo-48.png"
            alt="LIKED logo"
            width={36}
            height={36}
            style={{ borderRadius: 9 }}
          />
          <span
            className="font-serif"
            style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em" }}
          >
            liked<span style={{ color: "var(--accent)" }}>.</span>
          </span>
        </div>
        <nav style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <a
            href="/login"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-2)",
              textDecoration: "none",
            }}
          >
            Sign in
          </a>
          <a
            href="/signup"
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--accent-ink)",
              background: "var(--accent)",
              padding: "8px 16px",
              borderRadius: "var(--r-md)",
              textDecoration: "none",
            }}
          >
            Get started
          </a>
        </nav>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "80px 24px 64px",
          maxWidth: 920,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <Image
            src="/logo-128.png"
            alt="LIKED"
            width={96}
            height={96}
            style={{ borderRadius: 24 }}
          />
        </div>
        <h1
          className="font-serif"
          style={{
            fontSize: "clamp(36px, 6vw, 56px)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            margin: 0,
            color: "var(--text-1)",
          }}
        >
          Save and share what you like.
        </h1>
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.6,
            color: "var(--text-2)",
            maxWidth: 620,
            margin: "20px 0 0",
          }}
        >
          LIKED is a content-sharing app where you save links and notes as
          cards, organize them with folders and tags, and share them with
          exactly the people you choose — no more, no less.
        </p>
        <div
          style={{
            display: "flex",
            gap: 16,
            marginTop: 36,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <a
            href="/signup"
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--accent-ink)",
              background: "var(--accent)",
              padding: "12px 28px",
              borderRadius: "var(--r-md)",
              textDecoration: "none",
            }}
          >
            Create your library
          </a>
          <a
            href="/login"
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-1)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-1)",
              padding: "12px 28px",
              borderRadius: "var(--r-md)",
              textDecoration: "none",
            }}
          >
            Sign in
          </a>
        </div>
      </main>

      <section
        style={{
          maxWidth: 920,
          width: "100%",
          margin: "0 auto",
          padding: "0 24px 80px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 20,
        }}
      >
        {features.map((f) => (
          <div
            key={f.title}
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-1)",
              borderRadius: "var(--r-xl)",
              padding: 28,
              textAlign: "left",
            }}
          >
            <div style={{ marginBottom: 14 }}>{f.icon}</div>
            <h3
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: "var(--text-1)",
                margin: "0 0 8px",
              }}
            >
              {f.title}
            </h3>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: "var(--text-2)",
                margin: 0,
              }}
            >
              {f.body}
            </p>
          </div>
        ))}
      </section>

      <section
        style={{
          maxWidth: 920,
          width: "100%",
          margin: "0 auto",
          padding: "0 24px 96px",
          textAlign: "center",
        }}
      >
        <h2
          className="font-serif"
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--text-1)",
            margin: "0 0 16px",
          }}
        >
          How it works
        </h2>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.7,
            color: "var(--text-2)",
            maxWidth: 640,
            margin: "0 auto",
          }}
        >
          Save any URL or write a note and it becomes a card in your library.
          Group cards into folders, label them with tags, and connect with other
          users. When you share a card, only the people you&apos;ve connected to
          can see it — visibility is always controlled by you through explicit
          connections, never inferred or made public by default.
        </p>
      </section>

      <footer
        style={{
          borderTop: "1px solid var(--border-1)",
          padding: "28px 24px",
          textAlign: "center",
          color: "var(--text-3)",
          fontSize: 13,
          display: "flex",
          gap: 20,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <span>LIKED</span>
        <a href="/privacy" style={{ color: "var(--text-3)", textDecoration: "none" }}>
          Privacy Policy
        </a>
        <a href="/terms" style={{ color: "var(--text-3)", textDecoration: "none" }}>
          Terms
        </a>
      </footer>
    </div>
  );
}

const features = [
  {
    title: "Save anything",
    body: "Bookmark a link or jot down a note. Each one becomes a card with a preview, ready to organize.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: "Organize your way",
    body: "Group cards into folders and label them with tags. Switch between masonry, grid, list, and canvas views.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    title: "Share on your terms",
    body: "Connect with the people you trust. A card is only visible to those you've explicitly connected to — never public by default.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <line x1="8.2" y1="11" x2="15.8" y2="7" />
        <line x1="8.2" y1="13" x2="15.8" y2="17" />
      </svg>
    ),
  },
];
