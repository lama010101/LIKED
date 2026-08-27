// LIKED Chrome extension — popup UI controller.
//
// Renders the popup into #root. States:
//   loading → unauthenticated (sign-in CTA) → authenticated
//     → idle (tab preview + Save + Advanced toggle)
//     → saving → saved ✓ / already-saved / error
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
  type Folder,
  type Tag,
  type ApiError,
} from "../api/liked-client";

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

function openInLiked() {
  // The feed page does not support a ?node= highlight param, so we just
  // open the feed. The saved item will appear at the top (newest first).
  chrome.tabs.create({ url: `${likedWebUrl()}/feed` });
}

function faviconUrl(tab: ActiveTab): string {
  // Only use Chrome's own favIconUrl (cached locally by the browser).
  // Do NOT fall back to third-party favicon services — that would leak
  // every domain the user considers saving to a third party.
  return tab.favIconUrl ?? "";
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
    renderError(root, "This page cannot be saved. Open a web page (http/https) and try again.");
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
    h("p", {}, ["Sign in to LIKED to save pages to your library."]),
    h("button", { className: "btn btn-primary", onClick: openSignIn }, ["Sign in to LIKED"]),
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

  const header = h("div", { className: "header" }, [
    h("h1", {}, ["Save to LIKED"]),
    h(
      "button",
      {
        className: "signout",
        onClick: async () => {
          await signOut();
          render();
        },
      },
      ["Sign out"]
    ),
  ]);
  root.appendChild(header);

  const preview = h("div", { className: "preview" }, [
    h("img", { className: "favicon", src: faviconUrl(tab), alt: "" }),
    h("div", { className: "meta" }, [
      h("p", { className: "title" }, [tab.title]),
      h("p", { className: "url" }, [domainOf(tab.url)]),
    ]),
  ]);
  root.appendChild(preview);

  const advancedToggle = h("button", { className: "advanced-toggle", type: "button" }, [
    h("span", {}, ["Advanced (title, description, tags, collection)"]),
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
    ["Save to LIKED"]
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
        h("label", {}, ["Title (optional)"]),
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
        h("label", {}, ["Description (optional)"]),
        h("textarea", {
          value: state.description,
          placeholder: "Why are you saving this?",
          oninput: (e: Event) => {
            state.description = (e.target as HTMLTextAreaElement).value;
          },
        }),
      ])
    );

    // Personal note (PRD §8 — P0 feature)
    advanced.appendChild(
      h("div", { className: "field" }, [
        h("label", {}, ["Personal note (optional)"]),
        h("textarea", {
          value: state.note,
          placeholder: "Add a personal note about this page…",
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
        h("label", {}, ["Collection (optional)"]),
        folderSelect,
      ])
    );

    // Tags
    const tagChips = h("div", { className: "tag-chips" });
    if (state.tags.length === 0) {
      tagChips.appendChild(h("span", { className: "muted" }, ["No tags yet."]));
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
        h("label", {}, ["Tags (optional)"]),
        tagChips,
      ])
    );

    // New tag free-text
    const newTagInput = h("input", {
      type: "text",
      value: state.newTagInput,
      placeholder: "Add a new tag…",
      oninput: (e: Event) => {
        state.newTagInput = (e.target as HTMLInputElement).value;
      },
    });
    const addTagBtn = h("button", { type: "button" }, ["Add"]);
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
        h("label", {}, ["New tags"]),
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
            already ? "Already saved — " : "Saved ✓ — ",
            h(
              "a",
              {
                href: "#",
                onClick: (e: Event) => {
                  e.preventDefault();
                  openInLiked();
                },
              },
              ["Open in LIKED"]
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
          ? "Please sign in to LIKED."
          : (e as ApiError)?.code === "network"
            ? "Unable to reach LIKED."
            : e instanceof Error
              ? e.message
              : "LIKED could not save this page. Please try again.";
      state.save = { kind: "error", message };
    }
    rerenderStatus();
  });

  rerenderAdvanced();
}

document.addEventListener("DOMContentLoaded", render);
