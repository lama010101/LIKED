// @ts-nocheck — Deno Edge Function, not part of Node tsc project
// HTML parsing utilities — extracted from extract-node-metadata/index.ts

export function extractMeta(html: string): {
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  ogLocale?: string;
  ogVideoTags: string[];
  ogArticleTags: string[];
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  title?: string;
  description?: string;
  htmlLang?: string;
} {
  const out: ReturnType<typeof extractMeta> = {
    ogVideoTags: [],
    ogArticleTags: [],
  };

  // <title>…</title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) out.title = decodeHtmlEntities(titleMatch[1].trim());

  // <html lang="xx">
  const htmlLang = html.match(/<html[^>]*\slang=["']([^"']+)["']/i);
  if (htmlLang) out.htmlLang = htmlLang[1];

  // <meta property="og:foo" content="…">  and  <meta name="…" content="…">
  const metaRe =
    /<meta\s+(?:[^>]*?(?:property|name)=["']([^"']+)["'])[^>]*?content=["']([^"']*)["'][^>]*\/?>/gi;
  const metaRe2 =
    /<meta\s+(?:[^>]*?content=["']([^"']*)["'])[^>]*?(?:property|name)=["']([^"']+)["'][^>]*\/?>/gi;

  const addMeta = (key: string, rawValue: string) => {
    const value = decodeHtmlEntities(rawValue);
    const k = key.toLowerCase();
    switch (k) {
      case "og:title":
        out.ogTitle = value;
        break;
      case "og:description":
        out.ogDescription = value;
        break;
      case "og:image":
      case "og:image:url":
      case "og:image:secure_url":
        if (!out.ogImage) out.ogImage = value;
        break;
      case "og:type":
        out.ogType = value;
        break;
      case "og:locale":
        out.ogLocale = value;
        break;
      case "og:video:tag":
        out.ogVideoTags.push(value);
        break;
      case "og:article:tag":
      case "article:tag":
        out.ogArticleTags.push(value);
        break;
      case "twitter:title":
        out.twitterTitle = value;
        break;
      case "twitter:description":
        out.twitterDescription = value;
        break;
      case "twitter:image":
      case "twitter:image:src":
        out.twitterImage = value;
        break;
      case "description":
        out.description = value;
        break;
    }
  };

  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) addMeta(m[1], m[2]);
  while ((m = metaRe2.exec(html)) !== null) addMeta(m[2], m[1]);

  return out;
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
