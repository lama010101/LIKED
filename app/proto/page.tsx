import Link from "next/link";
import type { Metadata } from "next";
import "@/flow/flow.css";
import { PROTOTYPES } from "@/flow/lib/prototypes";

export const metadata: Metadata = {
  title: "UI previews",
};

export default function ProtoIndex() {
  return (
    <div className="flow-scope bg-ink">
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 p-8">
        <header>
          <h1 className="text-xl font-semibold text-zinc-100">
            LIKED — UI previews
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Same app, two interfaces. Flow is the rebuilt UIX; the PROTO pages
            are the original static mockups.
          </p>
        </header>
        <ul className="flex flex-col gap-3">
          <li>
            <Link
              href="/feed"
              className="block rounded-lg border border-edge bg-panel p-4 transition-colors hover:border-accent"
            >
              <span className="font-medium text-zinc-100">LIKED app</span>
              <span className="mt-1 block text-xs text-zinc-500">
                Production UI — /feed
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/flow"
              className="block rounded-lg border border-edge bg-panel p-4 transition-colors hover:border-accent"
            >
              <span className="font-medium text-zinc-100">Flow UIX</span>
              <span className="mt-1 block text-xs text-zinc-500">
                Rebuilt interface — /flow
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
    </div>
  );
}
