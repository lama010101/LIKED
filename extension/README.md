# LIKED Chrome Extension

Save any URL to your LIKED library from the browser toolbar. Quick save by default; expand **Advanced** to set title, description, tags, and collection.

## Architecture

- **Manifest V3**, permissions `activeTab` + `storage`, host_permissions for the LIKED API origin (needed for popup `fetch()` calls).
- **Service worker** receives the user's LIKED session from the web app's `/extension/auth` relay page via `chrome.runtime.sendMessageExternal` and stores it in `chrome.storage.local`.
- **Popup** reads the active tab, posts to `/api/import` on the LIKED web app, and renders saved / already-saved / error states.
- **No DB credentials** in the extension. The extension only holds the user's Supabase `access_token` (anon-key authed) and sends it as `Authorization: Bearer <token>`.

## Build

```bash
# from the extension/ directory
npm install
LIKED_API_URL=http://localhost:3000 npm run build
# → extension/dist/  (load this directory unpacked in Chrome)
```

If port 3000 is occupied (Next.js auto-selects 3001), build with:

```bash
LIKED_API_URL=http://localhost:3001 npm run build
```

Watch mode for development:

```bash
LIKED_API_URL=http://localhost:3000 npm run dev
```

For production, set `LIKED_API_URL` to your deployed LIKED web app origin (e.g. `https://liked.app`).

## Load in Chrome

1. Build the extension (above).
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select `extension/dist/`.
5. Note the **extension ID** shown on the LIKED card (e.g. `abcdefghijklmnopqrstuvwxyz`).

## Configure the web app

The LIKED web app needs to know the extension ID so the auth relay page can target it with `chrome.runtime.sendMessage`. In the web app's `.env.local`:

```bash
NEXT_PUBLIC_EXTENSION_ID=abcdefghijklmnopqrstuvwxyz
```

Then restart `npm run dev` (or rebuild) so `/extension/auth` picks it up.

Also ensure the extension's `manifest.json` `externally_connectable.matches` lists your LIKED web app origin. The default includes `http://localhost:3000/*` and `https://liked.app/*`. Edit `extension/manifest.json` and rebuild if your origin differs.

## First-use sign-in

1. Click the LIKED toolbar icon.
2. The popup shows **Sign in to LIKED**.
3. Click it → a tab opens at `${LIKED_API_URL}/extension/auth`.
4. Sign in to LIKED (email/password or Google OAuth).
5. The relay page sends the session to the extension and closes itself.
6. Reopen the popup → you're authenticated. Click **Save to LIKED**.

## Save flows

- **Quick save (default):** click the toolbar icon, click **Save to LIKED**. The node is created with auto-extracted metadata (title, thumbnail, channel) from the `extract-node-metadata` Edge Function.
- **Advanced:** click **Advanced** to set a custom title, description, choose a collection, pick existing tags, and add new tag labels. Then click **Save to LIKED**.

## Duplicate handling

Saving the same URL twice returns `alreadyExists: true`. The popup shows **Already saved — Open in LIKED**.

## Files

```
extension/
├── manifest.json
├── package.json
├── tsconfig.json
├── build.mjs
├── public/icons/{16,32,48,128}.png
└── src/
    ├── background/service-worker.ts   # receives LIKED_SESSION, stores in chrome.storage
    ├── auth/session.ts                # getSession / isAuthenticated / signOut
    ├── api/liked-client.ts            # importUrl / getFolders / getTags
    └── popup/
        ├── popup.html
        ├── popup.css
        └── popup.ts                   # popup UI controller
```

## Security notes

- The extension never sees the Supabase service-role key. It only holds the user's `access_token`.
- `externally_connectable.matches` in `manifest.json` restricts which origins can message the extension.
- The service worker rejects messages from origins not in `ALLOWED_ORIGINS`.
- All API calls go over HTTPS in production (use `http://localhost:3000` only for local dev).
