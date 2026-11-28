import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "scripts", "verify-delete-account.mjs"), "utf8");

describe("verify-delete-account migration apply", () => {
  it("checks the live function before applying migration 146", () => {
    expect(source).toContain("to_regprocedure('public.delete_account(uuid,text)')");
    expect(source).toContain("public.delete_account already exists; skipping migration 146 apply");
    expect(source.indexOf("to_regprocedure('public.delete_account(uuid,text)'")).toBeLessThan(
      source.indexOf('await client.query(sqlText)')
    );
  });
});
