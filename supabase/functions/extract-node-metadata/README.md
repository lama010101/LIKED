# extract-node-metadata

Supabase Edge Function implementing the contract in **PRD §15.1** and
task **P8-T01**.

## What it does

Given `{ url?, text_content?, user_language_code }`, returns:

```ts
{
  title: string,
  description?: string,
  thumbnail_key?: string | null,
  language_code: string,
  suggested_tags: string[],         // up to 8
  og_data?: { og_title?, og_description?, og_image?, og_type? }
}
```

### Branches

- **URL card** — fetches the page (UA `LIKED-Bot/1.0`, 8 s timeout, 500 KB
  body cap), extracts Open-Graph + Twitter + `<title>`/`<meta>` tags,
  downloads `og:image` and uploads it to the `thumbnails/` Storage bucket
  under `{user_id}/{uuid}.{ext}`.
- **Text-only card** — uses the first 120 chars as title, tokenises for
  simple keyword tags.

### Determinism & safety

- Never throws — every failure branch returns sensible defaults
  (see `buildDefaults`).
- Logs every invocation to `public.activity_log` with
  `action='metadata_extraction'`.
- Rate limit: **30 calls / user / minute**, implemented by counting rows
  in `activity_log` for the last 60 s. Over-limit returns HTTP 429 with
  a defaults payload.
- Stop-word filtering per PRD §15.1 #1c; English + optional per-language
  extra list.

## Deploy

Requires the Supabase CLI linked to your project:

```bash
supabase link --project-ref <your-ref>
supabase functions deploy extract-node-metadata --no-verify-jwt
```

The `--no-verify-jwt` flag lets us parse the Authorization header
ourselves and still return defaults for anonymous invocations used by
tests; authenticated callers' user id is resolved via
`caller.auth.getUser()`.

### Required environment

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` automatically. No extra secrets needed.

### Storage bucket

Migration `018_thumbnails_storage_bucket.sql` creates the `thumbnails/`
bucket with RLS. Apply it before invoking the function:

```bash
supabase db push
```

## Call from the app

```ts
const { data, error } = await supabase.functions.invoke(
  "extract-node-metadata",
  {
    body: {
      url,                                // or null for text cards
      text_content: textContent ?? null,
      user_language_code: userLang ?? "en",
    },
  }
);
```

Downstream (P8-T02) will feed the output into `createNode()` so the node
row plus `tag_edges` land in a single transaction.
