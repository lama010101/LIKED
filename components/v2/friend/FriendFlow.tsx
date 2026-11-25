"use client";

// Guest friend flow (PRD §5, tasks P0-13/P0-14).
// Phase 1 (this PR): landing — owner identity, prompt, note, genre tags,
// the name field, the PoW + cookie mint, and the language/appearance
// sheet. The add/details/send phases land in P0-14.

import { useState } from "react";
import { useTranslations } from "next-intl";
import AddScreen from "./AddScreen";
import LanguageAppearanceSheet from "./LanguageAppearanceSheet";
import ReceiptScreen from "./ReceiptScreen";
import { solvePow } from "./powClient";
import { initials, type FriendAsk, type TrayItem } from "./types";

type Phase = "landing" | "working" | "add" | "sent";
type ErrorKey = "name" | "pow" | "busy" | "token";

interface FriendFlowProps {
  token: string;
  ask: FriendAsk;
  genreNames: string[];
}

interface SessionChallenge {
  provider: string;
  challenge: string;
  difficulty: number;
  ttl_seconds: number;
}

export default function FriendFlow({ token, ask, genreNames }: FriendFlowProps) {
  const t = useTranslations("friend");
  const [phase, setPhase] = useState<Phase>("landing");
  const [name, setName] = useState("");
  const [error, setError] = useState<ErrorKey | null>(null);
  const [tray, setTray] = useState<TrayItem[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function start() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 50) {
      setError("name");
      return;
    }
    setError(null);
    setPhase("working");
    try {
      const challengeRes = await fetch("/api/ask/session", { cache: "no-store" });
      if (!challengeRes.ok) {
        setError(challengeRes.status === 404 ? "token" : "busy");
        setPhase("landing");
        return;
      }
      const challenge = (await challengeRes.json()) as SessionChallenge;
      const solution = await solvePow(challenge.challenge, challenge.difficulty);
      if (!solution) {
        setError("pow");
        setPhase("landing");
        return;
      }
      const res = await fetch("/api/ask/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name: trimmed, captchaToken: solution.token }),
      });
      if (res.ok) {
        setPhase("add");
        return;
      }
      setError(res.status === 404 ? "token" : res.status === 403 ? "pow" : res.status === 400 ? "name" : "busy");
      setPhase("landing");
    } catch {
      setError("busy");
      setPhase("landing");
    }
  }

  async function send() {
    if (tray.length === 0) {
      setSendError(t("error.empty"));
      return;
    }
    setSending(true);
    setSendError(null);
    const items = tray.map((item) => ({
      item_id: item.item_id,
      rating: item.rating,
      platform: item.platform.trim() ? item.platform.trim() : null,
      comment: item.comment.trim() ? item.comment.trim() : null,
    }));
    try {
      const res = await fetch("/api/ask/submit", {
        method: "POST",
        headers: { "content-type": "application/json", "x-ask-token": token },
        body: JSON.stringify({ client_batch_id: crypto.randomUUID(), items }),
      });
      if (!res.ok) {
        setSendError(res.status === 429 ? t("error.rateLimited") : t("error.submit"));
        return;
      }
      setTray([]);
      setPhase("sent");
    } catch {
      setSendError(t("error.submit"));
    } finally {
      setSending(false);
    }
  }

  const owner = ask.owner_display_name || "";
  const prompt = ask.prompt?.trim() ? ask.prompt : t("landing.defaultPrompt");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 py-6 text-[var(--v2-text)]">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--v2-surface-raised)] text-sm font-semibold"
          >
            {initials(owner)}
          </span>
          <div>
            <p className="text-sm text-[var(--v2-text-muted)]">{t("landing.nameLabel")}</p>
            <p className="text-base font-semibold">{owner}</p>
          </div>
        </div>
        <LanguageAppearanceSheet />
      </header>

      {phase === "add" ? (
        <AddScreen
          token={token}
          owner={owner}
          tray={tray}
          onChange={setTray}
          onSend={() => {
            void send();
          }}
          sending={sending}
          sendError={sendError}
        />
      ) : phase === "sent" ? (
        <ReceiptScreen
          token={token}
          owner={owner}
          onAddMore={() => setPhase("add")}
          onDeleted={() => setTray([])}
        />
      ) : (
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold leading-tight">{prompt}</h1>
          {ask.note?.trim() ? (
            <p className="text-base text-[var(--v2-text)]">{ask.note}</p>
          ) : null}
          {genreNames.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-[var(--v2-text-muted)]">
                {t("landing.likes", { owner })}
              </span>
              {genreNames.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full border border-[var(--v2-border)] px-2.5 py-1 text-xs"
                >
                  {genre}
                </span>
              ))}
            </div>
          ) : null}

          <form
            className="mt-2 flex flex-col gap-3 rounded-3xl border border-[var(--v2-border)] bg-[var(--v2-surface)] p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (phase === "working") return;
              void start();
            }}
          >
            <label htmlFor="friend-name" className="text-sm font-medium">
              {t("landing.nameLabel")}
            </label>
            <input
              id="friend-name"
              name="name"
              type="text"
              autoComplete="given-name"
              maxLength={50}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder={t("landing.namePlaceholder")}
              aria-describedby="friend-name-hint"
              aria-invalid={error === "name"}
              className="rounded-xl border border-[var(--v2-border)] bg-[var(--v2-bg)] px-3 py-2 text-base outline-none focus:border-[var(--v2-accent)]"
            />
            <p id="friend-name-hint" className="text-xs text-[var(--v2-text-muted)]">
              {t("landing.nameHint")}
            </p>
            {error ? (
              <p role="alert" className="text-sm text-[var(--v2-danger)]">
                {t(`errors.${error}`)}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={phase === "working"}
              className="mt-1 rounded-xl bg-[var(--v2-accent)] px-4 py-2.5 text-base font-semibold text-[var(--v2-on-accent)] disabled:opacity-60"
            >
              {phase === "working" ? t("pow.solving") : t("landing.start")}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
