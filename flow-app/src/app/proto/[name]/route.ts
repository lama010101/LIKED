import { readFile } from "node:fs/promises";
import path from "node:path";
import { PROTOTYPES } from "@/lib/prototypes";

export const dynamic = "force-dynamic";

async function loadPrototype(rel: string): Promise<string | null> {
  const roots = [process.cwd(), path.resolve(process.cwd(), "..")];
  for (const root of roots) {
    try {
      return await readFile(path.join(root, rel), "utf8");
    } catch {
      // try the repo root next
    }
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const proto = PROTOTYPES[name as keyof typeof PROTOTYPES];
  if (!proto) {
    return new Response(`Unknown prototype "${name}"`, { status: 404 });
  }
  const html = await loadPrototype(proto.file);
  if (html === null) {
    return new Response(`Prototype file not found: ${proto.file}`, {
      status: 404,
    });
  }
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
