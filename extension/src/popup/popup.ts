// LIKED Chrome extension — popup UI controller.
//
// Renders the popup into #root. States:
//   loading → unauthenticated (sign-in CTA) → authenticated
//     → idle (tab preview + Save + Advanced toggle)
//     → saving → saved ✓ / already-saved / error
//
// On open, GET /api/extension/status?url=… marks the popup "already saved"
// when the URL is already in the user's library (EXT-STATUS-001).
// Appearance: a persisted popup background color stored in
// chrome.storage.sync (remembered across the user's Chrome installs).
//
// Quick save (default): click "Save" with no advanced fields → POST /api/import
//   with just { url, clientMetadata }.
// Advanced: expand to set title, description, folder, existing tag chips,
//   and free-text new tag labels.

import { isAuthenticated, getSession, signOut } from "../auth/session";
import {
  importUrl,
  getFolders,
  getTags,
  getUrlStatus,
  type Folder,
  type Tag,
  type ApiError,
} from "../api/liked-client";
import { t } from "../i18n/strings";

// LIKED_API_URL is replaced at build time by the extension's esbuild step.
// Used for both API calls (in liked-client.ts) and web app links (sign-in,
// open in LIKED). Default to localhost for dev.
declare const LIKED_API_URL: string;

function likedWebUrl(): string {
  try {
    if (typeof LIKED_API_URL !== "undefined") return LIKED_API_URL;
  } catch {
    // LIKED_API_URL not defined — fall through to default.
  }
  return "http://localhost:3000";
}

interface ActiveTab {
  url: string;
  title: string;
  favIconUrl?: string;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; nodeId: string; alreadyExists: boolean }
  | { kind: "error"; message: string };

type ElProps = Record<string, unknown> & {
  dataset?: Record<string, string>;
  className?: string;
  style?: string;
};

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "dataset") {
      for (const [dk, dv] of Object.entries(v as Record<string, string>)) {
        el.dataset[dk] = dv;
      }
      continue;
    }
    if (k === "className") {
      el.className = v as string;
      continue;
    }
    if (k === "style" && typeof v === "string") {
      el.setAttribute("style", v);
      continue;
    }
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      continue;
    }
    if (v === null || v === undefined) continue;
    (el as unknown as Record<string, unknown>)[k] = v;
  }
  for (const child of children) {
    el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

function clear(root: HTMLElement) {
  while (root.firstChild) root.removeChild(root.firstChild);
}

async function getActiveTab(): Promise<ActiveTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  if (!/^https?:\/\//i.test(tab.url)) return null;
  return {
    url: tab.url,
    title: tab.title ?? tab.url,
    favIconUrl: tab.favIconUrl,
  };
}

function openSignIn() {
  chrome.tabs.create({ url: `${likedWebUrl()}/extension/auth` });
}

// ── Appearance: persisted popup background (EXT-THEME-001) ────────────
// Stored in chrome.storage.sync so the choice follows the user's Chrome
// profile. A picked color also forces the light/dark palette via
// data-ext-theme (luminance decides which keeps contrast).
const BG_KEY = "liked.popup.bg";
const BG_SWATCHES: (string | null)[] = [
  null,        // auto = system light/dark
  "#ffffff", "#f3f4f6", "#eef4ff", "#f0fdf4", "#faf5ff", "#fff7ed",
  "#1f2937", "#0d0e11",
];

function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  // Rec. 601 perceived luminance, 0..255.
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

function applyBg(hex: string | null) {
  const root = document.documentElement;
  if (!hex) {
    delete root.dataset.extTheme;
    root.style.removeProperty("--bg");
    return;
  }
  root.dataset.extTheme = isLightColor(hex) ? "light" : "dark";
  root.style.setProperty("--bg", hex);
}

async function initAppearance(): Promise<string | null> {
  try {
    const stored = await chrome.storage.sync.get(BG_KEY);
    const hex = typeof stored[BG_KEY] === "string" ? (stored[BG_KEY] as string) : null;
    applyBg(hex);
    return hex;
  } catch {
    return null;
  }
}

// Apply the stored color as early as possible — before first paint.
void initAppearance();

function openInLiked() {
  // The feed page does not support a ?node= highlight param, so we just
  // open the feed. The saved item will appear at the top (newest first).
  chrome.tabs.create({ url: `${likedWebUrl()}/feed` });
}

function faviconUrl(tab: ActiveTab): string {
  // Only use Chrome's own favIconUrl (cached locally by the browser).
  // Do NOT fall back to third-party favicon services — that would leak
  // every domain the user considers saving to a third party.
  // Validate scheme to prevent javascript:/data: URLs in <img> (AUDIT-06 P3-11).
  const url = tab.favIconUrl ?? "";
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    return url;
  } catch {
    return "";
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function render() {
  const root = document.getElementById("root");
  if (!root) return;
  clear(root);

  const authed = await isAuthenticated();
  if (!authed) {
    renderUnauthenticated(root);
    return;
  }

  const tab = await getActiveTab();
  if (!tab) {
    renderError(root, t("errBadPage"));
    return;
  }

  const session = await getSession();
  if (!session) {
    renderUnauthenticated(root);
    return;
  }

  await renderReady(root, tab);
}

function renderUnauthenticated(root: HTMLElement) {
  const wrap = h("div", { className: "auth-view" }, [
    h("p", {}, [t("signInBody")]),
    h("button", { className: "btn btn-primary", onClick: openSignIn }, [t("signIn")]),
  ]);
  root.appendChild(wrap);
}

function renderError(root: HTMLElement, message: string) {
  root.appendChild(
    h("div", { className: "auth-view" }, [
      h("p", { style: "color: var(--danger)" }, [message]),
    ])
  );
}

interface PopupState {
  tab: ActiveTab;
  folders: Folder[];
  tags: Tag[];
  selectedFolderId: string | null;
  selectedTagIds: Set<string>;
  newTagLabels: string[];
  newTagInput: string;
  advancedOpen: boolean;
  titleOverride: string;
  description: string;
  note: string;
  save: SaveState;
}

async function renderReady(root: HTMLElement, tab: ActiveTab) {
  const state: PopupState = {
    tab,
    folders: [],
    tags: [],
    selectedFolderId: null,
    selectedTagIds: new Set(),
    newTagLabels: [],
    newTagInput: "",
    advancedOpen: false,
    titleOverride: "",
    description: "",
    note: "",
    save: { kind: "idle" },
  };

  // Hydrate folders + tags in the background; only used when advanced opens.
  const loadPromise = Promise.all([getFolders().catch(() => []), getTags().catch(() => [])]).then(
    ([folders, tags]) => {
      state.folders = folders;
      state.tags = tags;
    }
  );

  // Appearance control: a small palette button in the header toggles a
  // swatch row; the choice persists via chrome.storage.sync.
  const themeRow = h("div", { className: "theme-row" });
  const themeToggle = h(
    "button",
    {
      className: "theme-toggle",
      type: "button",
      title: t("popupBg"),
      "aria-label": t("popupBg"),
      onClick: () => themeRow.classList.toggle("open"),
    },
    [h("span", { className: "theme-dot" }, [])]
  );
  const header = h("div", { className: "header" }, [
    h("h1", {}, [t("saveTo")]),
    h("div", { className: "header-actions" }, [
      themeToggle,
      h(
        "button",
        {
          className: "signout",
          onClick: async () => {
            await signOut();
            render();
          },
        },
        [t("signOut")]
      ),
    ]),
  ]);
  root.appendChild(header);
  root.appendChild(themeRow);

  async function renderThemeRow() {
    clear(themeRow);
    const current = (await chrome.storage.sync.get(BG_KEY))[BG_KEY] ?? null;
    for (const value of BG_SWATCHES) {
      themeRow.appendChild(
        h(
          "button",
          {
            type: "button",
            className: `swatch${value === current ? " selected" : ""}${value === null ? " auto" : ""}`,
            style: value ? `background: ${value}` : "",
            title: value ?? t("bgAuto"),
            "aria-label": value ?? t("bgAuto"),
            onClick: async () => {
              if (value) await chrome.storage.sync.set({ [BG_KEY]: value });
              else await chrome.storage.sync.remove(BG_KEY);
              applyBg(value);
              renderThemeRow();
            },
          },
          value === null ? ["A"] : []
        )
      );
    }
    // Custom color picker — swatch-adjacent circle that opens <input type=color>.
    themeRow.appendChild(
      h("input", {
        type: "color",
        className: "swatch custom",
        value: current && /^#[0-9a-f]{6}$/i.test(current) ? current : "#888888",
        title: t("popupBg"),
        oninput: async (e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          await chrome.storage.sync.set({ [BG_KEY]: v });
          applyBg(v);
          renderThemeRow();
        },
      })
    );
  }
  renderThemeRow();

  const preview = h("div", { className: "preview" }, [
    h("img", { className: "favicon", src: faviconUrl(tab), alt: "" }),
    h("div", { className: "meta" }, [
      h("p", { className: "title" }, [tab.title]),
      h("p", { className: "url" }, [domainOf(tab.url)]),
    ]),
  ]);
  root.appendChild(preview);

  const advancedToggle = h("button", { className: "advanced-toggle", type: "button" }, [
    h("span", {}, [t("advanced")]),
    h("span", { className: "chevron" }, ["▾"]),
  ]);
  root.appendChild(advancedToggle);

  const advanced = h("div", { className: "advanced" });
  root.appendChild(advanced);

  const statusHost = h("div", {});
  root.appendChild(statusHost);

  const saveBtn = h(
    "button",
    { className: "btn btn-primary", type: "button" },
    [t("saveTo")]
  );
  // Place Save button between preview and advanced toggle for prominence.
  root.insertBefore(saveBtn, advancedToggle);

  function rerenderAdvanced() {
    clear(advanced);
    advanced.classList.toggle("open", state.advancedOpen);
    advancedToggle.classList.toggle("open", state.advancedOpen);

    if (!state.advancedOpen) return;

    // Title
    advanced.appendChild(
      h("div", { className: "field" }, [
        h("label", {}, [t("titleOptional")]),
        h("input", {
          type: "text",
          value: state.titleOverride,
          placeholder: tab.title,
          oninput: (e: Event) => {
            state.titleOverride = (e.target as HTMLInputElement).value;
          },
        }),
      ])
    );

    // Description
    advanced.appendChild(
      h("div", { className: "field" }, [
        h("label", {}, [t("descriptionOptional")]),
        h("textarea", {
          value: state.description,
          placeholder: t("descriptionPh"),
          oninput: (e: Event) => {
            state.description = (e.target as HTMLTextAreaElement).value;
          },
        }),
      ])
    );

    // Personal note (PRD §8 — P0 feature)
    advanced.appendChild(
      h("div", { className: "field" }, [
        h("label", {}, [t("noteOptional")]),
        h("textarea", {
          value: state.note,
          placeholder: t("notePh"),
          oninput: (e: Event) => {
            state.note = (e.target as HTMLTextAreaElement).value;
          },
        }),
      ])
    );

    // Folder
    const folderSelect = h("select", {}, [
      h("option", { value: "" }, ["— No collection —"]),
    ]);
    for (const f of state.folders) {
      folderSelect.appendChild(
        h("option", { value: f.id }, [f.name])
      );
    }
    folderSelect.value = state.selectedFolderId ?? "";
    folderSelect.addEventListener("change", (e: Event) => {
      state.selectedFolderId = (e.target as HTMLSelectElement).value || null;
    });
    advanced.appendChild(
      h("div", { className: "field" }, [
        h("label", {}, [t("collectionOptional")]),
        folderSelect,
      ])
    );

    // Tags
    const tagChips = h("div", { className: "tag-chips" });
    if (state.tags.length === 0) {
      tagChips.appendChild(h("span", { className: "muted" }, [t("noTagsYet")]));
    } else {
      for (const t of state.tags) {
        const chip = h(
          "button",
          {
            type: "button",
            className: `tag-chip${state.selectedTagIds.has(t.id) ? " selected" : ""}`,
            onClick: () => {
              if (state.selectedTagIds.has(t.id)) {
                state.selectedTagIds.delete(t.id);
                chip.classList.remove("selected");
              } else {
                state.selectedTagIds.add(t.id);
                chip.classList.add("selected");
              }
            },
          },
          [
            h("span", { className: "dot", style: `background: ${t.colorHex}` }),
            t.label,
          ]
        );
        tagChips.appendChild(chip);
      }
    }
    advanced.appendChild(
      h("div", { className: "field" }, [
        h("label", {}, [t("tagsOptional")]),
        tagChips,
      ])
    );

    // New tag free-text
    const newTagInput = h("input", {
      type: "text",
      value: state.newTagInput,
      placeholder: t("addTagPh"),
      oninput: (e: Event) => {
        state.newTagInput = (e.target as HTMLInputElement).value;
      },
    });
    const addTagBtn = h("button", { type: "button" }, [t("add")]);
    addTagBtn.addEventListener("click", () => {
      const v = state.newTagInput.trim();
      if (!v) return;
      if (!state.newTagLabels.includes(v)) state.newTagLabels.push(v);
      state.newTagInput = "";
      rerenderAdvanced();
    });
    newTagInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTagBtn.click();
      }
    });
    advanced.appendChild(
      h("div", { className: "field" }, [
        h("label", {}, [t("newTags")]),
        h("div", { className: "new-tag-row" }, [newTagInput, addTagBtn]),
        state.newTagLabels.length > 0
          ? h(
              "div",
              { className: "tag-chips", style: "margin-top: 6px" },
              state.newTagLabels.map((label) =>
                h(
                  "button",
                  {
                    type: "button",
                    className: "tag-chip selected",
                    onClick: () => {
                      state.newTagLabels = state.newTagLabels.filter((l) => l !== label);
                      rerenderAdvanced();
                    },
                  },
                  [label, " ×"]
                )
              )
            )
          : h("span", { className: "muted" }, []),
      ])
    );
  }

  advancedToggle.addEventListener("click", () => {
    state.advancedOpen = !state.advancedOpen;
    if (state.advancedOpen) {
      // Ensure folders + tags are loaded before first open.
      loadPromise.then(rerenderAdvanced);
    }
    rerenderAdvanced();
  });

  function rerenderStatus() {
    clear(statusHost);
    switch (state.save.kind) {
      case "idle":
        return;
      case "saving":
        statusHost.appendChild(
          h("div", { className: "status status-saving" }, [
            h("span", { className: "spinner" }),
            " Saving…",
          ])
        );
        saveBtn.disabled = true;
        return;
      case "saved": {
        saveBtn.disabled = false;
        const already = state.save.alreadyExists;
        statusHost.appendChild(
          h("div", { className: "status status-success" }, [
            already ? t("alreadySaved") : t("saved"),
            h(
              "a",
              {
                href: "#",
                onClick: (e: Event) => {
                  e.preventDefault();
                  openInLiked();
                },
              },
              [t("openInLiked")]
            ),
          ])
        );
        return;
      }
      case "error":
        saveBtn.disabled = false;
        statusHost.appendChild(
          h("div", { className: "status status-error" }, [state.save.message])
        );
        return;
    }
  }

  // Saved-state on open: check whether this URL is already in the
  // library and pre-show the status (EXT-STATUS-001). Best-effort — a
  // failure leaves the popup fully usable.
  getUrlStatus(tab.url)
    .then((st) => {
      if (st.saved && state.save.kind === "idle") {
        state.save = { kind: "saved", nodeId: st.nodeId ?? "", alreadyExists: true };
        rerenderStatus();
      }
    })
    .catch(() => undefined);

  saveBtn.addEventListener("click", async () => {
    if (state.save.kind === "saving") return;
    state.save = { kind: "saving" };
    rerenderStatus();

    try {
      const result = await importUrl({
        url: tab.url,
        title: state.titleOverride.trim() || null,
        description: state.description.trim() || null,
        note: state.note.trim() || null,
        folderId: state.selectedFolderId,
        tagIds: Array.from(state.selectedTagIds),
        newTagLabels: state.newTagLabels,
        clientMetadata: {
          pageTitle: tab.title,
          faviconUrl: faviconUrl(tab),
        },
      });
      state.save = { kind: "saved", nodeId: result.nodeId, alreadyExists: result.alreadyExists };
    } catch (err) {
      const e = err as ApiError | Error;
      const message =
        (e as ApiError)?.code === "unauthenticated"
          ? t("errSignIn")
          : (e as ApiError)?.code === "network"
            ? t("errNetwork")
            : e instanceof Error
              ? e.message
              : t("errGeneric");
      state.save = { kind: "error", message };
    }
    rerenderStatus();
  });

  rerenderAdvanced();
}

document.addEventListener("DOMContentLoaded", render);
