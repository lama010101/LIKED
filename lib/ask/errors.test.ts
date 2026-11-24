import { describe, expect, it } from "vitest";
import { AskError, askErrorResponse, mapAskRpcError } from "./errors";

describe("mapAskRpcError — prototype-chain keys must not map", () => {
  it.each(["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"])(
    "message %j -> 503 ASK_UNAVAILABLE without throwing",
    async (message) => {
      const res = mapAskRpcError({ message, code: "P0001" });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "ASK_UNAVAILABLE" });
    }
  );
});

describe("askErrorResponse — unknown code falls back to ASK_UNAVAILABLE", () => {
  it("bogus code -> 503 {error: ASK_UNAVAILABLE}", async () => {
    const res = askErrorResponse("NOT_A_REAL_CODE" as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ASK_UNAVAILABLE" });
  });

  it("AskError instance still maps its own code", async () => {
    const res = askErrorResponse(new AskError("RATE_LIMITED"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "RATE_LIMITED" });
  });
});
