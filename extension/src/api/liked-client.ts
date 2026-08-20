// LIKED Chrome extension — typed API client for the LIKED backend.
//
// All requests send the user's access_token as `Authorization: Bearer <token>`
// and target the LIKED web app's extension API routes. The base URL is
// injected at build time via the LIKED_API_URL define (see extension/tsconfig.json
// + build script). Errors are normalized to { ok: false, code, message }.

import { getAccessToken } from "../auth/session";

// LIKED_API_URL is replaced at build time by the extension's esbuild step.
// Default to localhost for dev; production builds pass it explicitly.
declare const LIKED_API_URL: string;

function baseUrl(): string {
  try {
    if (typeof LIKED_API_URL !== "undefined") return LIKED_API_URL;
  } catch {
    // LIKED_API_URL not defined — fall through to default.
  }
  return "http://localhost:3000";
}

export interface Folder {
  id: string;
  name: string;
  parentFolderId: string | null;
  colorHex: string;
  isProject: boolean;
}

export interface Tag {
  id: string;
  label: string;
  colorHex: string;
}

export interface ImportRequest {
  url: string;
  title?: string | null;
  description?: string | null;
  note?: string | null;
  folderId?: string | null;
  tagIds?: string[];
  newTagLabels?: string[];
  clientMetadata?: {
    pageTitle?: string;
    pageDescription?: string;
    faviconUrl?: string;
  };
}

export interface ImportSuccess {
  success: true;
  nodeId: string;
  alreadyExists: boolean;
}

export interface ApiError {
  success: false;
  code: "unauthenticated" | "invalid" | "network" | "server";
  message: string;
}

function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ApiError>;
  return v.success === false && typeof v.code === "string" && typeof v.message === "string";
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    const err: ApiError = {
      success: false,
      code: "unauthenticated",
      message: "Please sign in to LIKED.",
    };
    throw err;
  }
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${baseUrl()}${path}`, { ...init, headers });
}

async function parseJson<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    const err: ApiError = { success: false, code: "unauthenticated", message: "Please sign in to LIKED." };
    throw err;
  }
  if (res.status >= 500) {
    const err: ApiError = { success: false, code: "server", message: "LIKED could not save this page. Please try again." };
    throw err;
  }
  const json = (await res.json().catch(() => null)) as unknown;
  if (res.status >= 400) {
    if (isApiError(json)) throw json;
    const err: ApiError = {
      success: false,
      code: "invalid",
      message: (json as { message?: string } | null)?.message ?? "This page cannot be saved.",
    };
    throw err;
  }
  return json as T;
}

export async function importUrl(body: ImportRequest): Promise<ImportSuccess> {
  let res: Response;
  try {
    res = await authedFetch("/api/import", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (e) {
    const err: ApiError = {
      success: false,
      code: "network",
      message: "Unable to reach LIKED.",
    };
    if (e instanceof Error) err.message = e.message;
    throw err;
  }
  return parseJson<ImportSuccess>(res);
}

export async function getFolders(): Promise<Folder[]> {
  const res = await authedFetch("/api/extension/folders", { method: "GET" });
  return parseJson<Folder[]>(res);
}

export async function getTags(): Promise<Tag[]> {
  const res = await authedFetch("/api/extension/tags", { method: "GET" });
  return parseJson<Tag[]>(res);
}
