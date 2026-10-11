import Link from "next/link";
import type { Metadata } from "next";
import { PROTOTYPES } from "@/lib/prototypes";

export const metadata: Metadata = {
  title: "LIKED — UI previews",
};

export default function ProtoIndex() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-xl font-semibold text-zinc-100">LIKED — UI previews</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Same app, two interfaces. Flow is the rebuilt UIX; the PROTO pages are
          the original static mockups.
        </p>
      </header>
      <ul className="flex flex-col gap-3">
        <li>
          <a
            href="http://localhost:3001"
            className="block rounded-lg border border-edge bg-panel p-4 transition-colors hover:border-accent"
          >
            <span className="font-medium text-zinc-100">LIKED app</span>
            <span className="mt-1 block text-xs text-zinc-500">
              Production UI — npm run dev from repo root (port 3001)
            </span>
          </a>
        </li>
        <li>
          <Link
            href="/"
            className="block rounded-lg border border-edge bg-panel p-4 transition-colors hover:border-accent"
          >
            <span className="font-medium text-zinc-100">Flow UIX</span>
            <span className="mt-1 block text-xs text-zinc-500">
              Next.js rebuild — the alternative interface
            </span>
          </Link>
        </li>
        {Object.entries(PROTOTYPES).map(([name, proto]) => (
          <li key={name}>
            <a
              href={`/proto/${name}`}
              className="block rounded-lg border border-edge bg-panel p-4 transition-colors hover:border-accent"
            >
              <span className="font-medium text-zinc-100">{proto.label}</span>
              <span className="mt-1 block text-xs text-zinc-500">
                {proto.file}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
