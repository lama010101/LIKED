"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const DIFFICULTY_BITS = 20;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function leadingZeroBits(hex: string): number {
  let bits = 0;
  for (const ch of hex) {
    const v = parseInt(ch, 16);
    if (v === 0) { bits += 4; continue; }
    bits += 4 - Math.floor(Math.log2(v)) - 1;
    break;
  }
  return bits;
}

async function solve(challenge: string): Promise<string | null> {
  for (let nonce = 0; nonce < 50_000_000; nonce++) {
    const hex = await sha256Hex(`${challenge}.${nonce}`);
    if (leadingZeroBits(hex) >= DIFFICULTY_BITS) return `${challenge}.${nonce}`;
  }
  return null;
}

export default function DeleteRequestForm() {
  const t = useTranslations("deletion");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const chRes = await fetch("/api/delete-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "challenge" }),
      });
      const ch = (await chRes.json()) as { challenge?: string };
      if (!chRes.ok || !ch.challenge) throw new Error("challenge");
      const token = await solve(ch.challenge);
      if (!token) throw new Error("pow");
      const res = await fetch("/api/delete-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      });
      if (!res.ok && res.status !== 429) throw new Error("submit");
      setSent(true);
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <p>{t("pubSent")}</p>;
  return (
    <form onSubmit={submit}>
      <label>
        {t("pubEmail")}
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" hidden aria-hidden="true" />
      <button type="submit" disabled={busy}>
        {t("pubSubmit")}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
