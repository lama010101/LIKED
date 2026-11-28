// Browser PoW solver (PLAN-V2-002 §4.4, task P0-13).
//
// The server issues "p1.<id>.<exp>.<diff>.<sig>" (lib/ask/humanCheck.ts);
// the client must find a nonce whose sha256("<challenge>.<nonce>") has
// `difficulty` leading zero bits and send back "<challenge>.<nonce>".
// Web Crypto only (no dependency): crypto.subtle.digest is async, so the
// loop yields to the event loop every batch to keep the UI responsive.

export interface PowSolution {
  token: string;
  iterations: number;
  elapsedMs: number;
}

function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    let b = byte;
    let count = 0;
    while ((b & 0x80) === 0) {
      count += 1;
      b = (b << 1) & 0xff;
    }
    bits += count;
    break;
  }
  return bits;
}

const BATCH = 512;

/** Solve one challenge. Returns null when the budget is exhausted or the
 *  caller aborted. `signal.aborted` is checked every batch. */
export async function solvePow(
  challenge: string,
  difficultyBits: number,
  options: { signal?: { aborted: boolean }; maxIterations?: number } = {}
): Promise<PowSolution | null> {
  const encoder = new TextEncoder();
  const started = performance.now();
  const max = options.maxIterations ?? 8_000_000;
  let nonce = 0;
  while (nonce < max) {
    for (let i = 0; i < BATCH && nonce < max; i += 1, nonce += 1) {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        encoder.encode(`${challenge}.${nonce}`)
      );
      if (leadingZeroBits(new Uint8Array(digest)) >= difficultyBits) {
        return {
          token: `${challenge}.${nonce}`,
          iterations: nonce + 1,
          elapsedMs: Math.round(performance.now() - started),
        };
      }
    }
    if (options.signal?.aborted) return null;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return null;
}
