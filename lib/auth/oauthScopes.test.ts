import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// C16 audit: sign-in/signup must not request incremental YouTube access.
// The test reads the exact route source so a future scope regression fails
// even when the OAuth call happens inside the provider SDK.
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function requestedScopes(source: string): string | null {
  const match = source.match(/scope\s*:\s*["']([^"']+)["']/);
  return match?.[1] ?? null;
}

describe("OAuth scope audit", () => {
  it("sign-in/signup request no YouTube scope; incremental connect requests readonly only", () => {
    const login = read("app/(auth)/login/page.tsx");
    const signup = read("app/(auth)/signup/page.tsx");
    const connect = read("app/api/youtube/connect/route.ts");

    const loginOAuth = login.match(/signInWithOAuth\(\{[\s\S]*?\}\);/)?.[0] ?? "";
    const signupOAuth = signup.match(/signInWithOAuth\(\{[\s\S]*?\}\);/)?.[0] ?? "";
    expect(loginOAuth).toContain('provider: "google"');
    expect(signupOAuth).toContain('provider: "google"');
    expect(loginOAuth).not.toContain("youtube");
    expect(signupOAuth).not.toContain("youtube");
    expect(requestedScopes(loginOAuth)).toBeNull();
    expect(requestedScopes(signupOAuth)).toBeNull();
    expect(requestedScopes(connect)).toBe("https://www.googleapis.com/auth/youtube.readonly");
  });

  it("scope strings snapshot", () => {
    const login = read("app/(auth)/login/page.tsx");
    const signup = read("app/(auth)/signup/page.tsx");
    const connect = read("app/api/youtube/connect/route.ts");
    expect({
      login: requestedScopes(login.match(/signInWithOAuth\(\{[\s\S]*?\}\);/)?.[0] ?? "") ?? "provider-default-openid-email-profile",
      signup: requestedScopes(signup.match(/signInWithOAuth\(\{[\s\S]*?\}\);/)?.[0] ?? "") ?? "provider-default-openid-email-profile",
      youtubeConnect: requestedScopes(connect),
    }).toMatchSnapshot();
  });
});
