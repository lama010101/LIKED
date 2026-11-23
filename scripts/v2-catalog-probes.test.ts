import { describe, expect, it } from "vitest";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  V2_CLASS_O_NAMES,
  V2_FUNCTION_MIGRATIONS,
  deriveV2Functions,
  hasPublicSearchPath,
  evaluateV2FunctionSecurity,
  findV2DdlViolations,
  planV2RoleProbe,
  buildProbeCall,
  splitTopLevel,
} from "./lib/v2-catalog-probes.mjs";
import { findCoverageGaps, COVERED_FKS } from "./lib/delete-account-coverage.mjs";

// The frozen coverage lib is plain .mjs (params infer as never[]
// under tsc); this wrapper gives the snapshots a real type.
const coverageGaps = (input: {
  liveFks?: { child: string; column: string; parent: string; on_delete?: string }[];
  liveColumns?: { table: string; column: string }[];
  livePayloadKeys?: { table: string; type_or_kind: string; key: string }[];
}) => findCoverageGaps(input as never) as string[];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("deriveV2Functions", () => {
  const derived = deriveV2Functions(root);

  it("derives 30 functions from migrations 142-146", () => {
    expect(derived).toHaveLength(30);
    expect(V2_FUNCTION_MIGRATIONS).toHaveLength(5);
  });

  it("splits into 18 class S and exactly the 12 class O names", () => {
    const s = derived.filter((f) => f.cls === "S").map((f) => f.name);
    const o = derived.filter((f) => f.cls === "O").map((f) => f.name);
    expect(s).toHaveLength(18);
    expect(o.sort()).toEqual([...V2_CLASS_O_NAMES].sort());
    expect(o).toHaveLength(12);
  });

  it("class S = 8 from 143 + 9 from 144 + delete_account from 146", () => {
    const s = derived.filter((f) => f.cls === "S");
    expect(s.filter((f) => f.file === "143_v2_inbox_support.sql")).toHaveLength(8);
    expect(s.filter((f) => f.file === "144_v2_guest_submit.sql")).toHaveLength(9);
    expect(s.filter((f) => f.file === "146_v2_delete_account.sql").map((f) => f.name)).toEqual([
      "delete_account",
    ]);
    expect(s.filter((f) => f.file === "142_v2_inbox_core.sql")).toHaveLength(0);
    expect(s.filter((f) => f.file === "145_v2_owner_inbox.sql")).toHaveLength(0);
  });
});

// ---- synthetic catalog row factory (DB-21 shape) ----
const goodRow = (name: string, cls: "S" | "O", over: Record<string, unknown> = {}) => ({
  oid: 1,
  name,
  cls,
  identity_args: "",
  argtypes: "",
  prosecdef: true,
  proconfig: ["search_path=public"],
  proacl: cls === "O"
    ? "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}"
    : "{postgres=X/postgres,service_role=X/postgres}",
  overloads: 1,
  grantees: cls === "O" ? ["postgres", "authenticated", "service_role"] : ["postgres", "service_role"],
  ...over,
});

const derived = deriveV2Functions(root);
const goodRows = derived.map((f) => goodRow(f.name, f.cls as "S" | "O"));

describe("evaluateV2FunctionSecurity", () => {
  it("passes a clean synthetic catalog", () => {
    const r = evaluateV2FunctionSecurity(derived, goodRows);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("fails when proacl contains anon", () => {
    const rows = goodRows.map((r) =>
      r.name === "guest_get_ask" ? { ...r, grantees: [...r.grantees, "anon"] } : r
    );
    const r = evaluateV2FunctionSecurity(derived, rows);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("guest_get_ask");
    expect(r.violations.join(" ")).toContain("anon");
  });

  it("fails when proacl contains PUBLIC", () => {
    const rows = goodRows.map((r) =>
      r.name === "get_inbox" ? { ...r, grantees: ["PUBLIC", ...r.grantees] } : r
    );
    const r = evaluateV2FunctionSecurity(derived, rows);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("PUBLIC");
  });

  it("fails a class-S function granted to authenticated", () => {
    const rows = goodRows.map((r) =>
      r.name === "rl_hit" ? { ...r, grantees: [...r.grantees, "authenticated"] } : r
    );
    const r = evaluateV2FunctionSecurity(derived, rows);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("class S grants authenticated");
  });

  it("fails a class-O function without the authenticated grant", () => {
    const rows = goodRows.map((r) =>
      r.name === "set_my_prefs"
        ? { ...r, grantees: r.grantees.filter((g) => g !== "authenticated") }
        : r
    );
    const r = evaluateV2FunctionSecurity(derived, rows);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("class O missing authenticated grant");
  });

  it("fails a function without search_path=public", () => {
    const rows = goodRows.map((r) =>
      r.name === "submit_recommendations" ? { ...r, proconfig: ["work_mem=4MB"] } : r
    );
    const r = evaluateV2FunctionSecurity(derived, rows);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("search_path=public");
  });

  it("fails a non-SECURITY-DEFINER function", () => {
    const rows = goodRows.map((r) =>
      r.name === "housekeeping_purge" ? { ...r, prosecdef: false } : r
    );
    const r = evaluateV2FunctionSecurity(derived, rows);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("prosecdef=false");
  });

  it("fails a name with two overloads", () => {
    const rows = [
      ...goodRows,
      goodRow("guest_get_receipt", "S", { oid: 2, identity_args: "p_ask_token text", argtypes: "text", overloads: 2 }),
    ];
    const r = evaluateV2FunctionSecurity(derived, rows);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("overloads");
  });

  it("fails a derived function missing from the catalog", () => {
    const rows = goodRows.filter((r) => r.name !== "delete_account");
    const r = evaluateV2FunctionSecurity(derived, rows);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("delete_account: missing");
  });
});

describe("hasPublicSearchPath", () => {
  it("accepts search_path=public", () => {
    expect(hasPublicSearchPath(["search_path=public"])).toBe(true);
  });
  it("accepts quoted/multi-value forms containing public", () => {
    expect(hasPublicSearchPath(['search_path="public, pg_temp"'])).toBe(true);
    expect(hasPublicSearchPath(["search_path=pg_catalog, public"])).toBe(true);
  });
  it("rejects empty, other values and non-search_path entries", () => {
    expect(hasPublicSearchPath([])).toBe(false);
    expect(hasPublicSearchPath(["search_path=private"])).toBe(false);
    expect(hasPublicSearchPath(["work_mem=4MB"])).toBe(false);
    expect(hasPublicSearchPath(null)).toBe(false);
  });
});

describe("findV2DdlViolations (DB-23)", () => {
  it("passes clean v2 functiondefs", () => {
    const defs = [
      { name: "submit_recommendations", def: "INSERT INTO public.submissions (...) VALUES (...); UPDATE public.items SET x=1;" },
      {
        name: "delete_account",
        def: "DELETE FROM public.causes c WHERE c.created_by = p_user_id; PERFORM public.remove_node_from_folder(v_place.node_id, v_place.folder_id);",
      },
      { name: "ensure_my_ask", def: "SELECT 1; INSERT INTO public.asks (owner_id) VALUES (auth.uid());" },
    ];
    const r = findV2DdlViolations(defs);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.allowedCalls).toEqual(["delete_account: remove_node_from_folder"]);
  });

  it("fails DELETE on edges inside any v2 function", () => {
    const r = findV2DdlViolations([
      { name: "get_inbox", def: "DELETE FROM public.edges WHERE user_id = auth.uid();" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("delete from on edges");
  });

  it("fails INSERT on folder_edges", () => {
    const r = findV2DdlViolations([
      { name: "upsert_item", def: "INSERT INTO public.folder_edges (node_id, folder_id) VALUES (1,2);" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("insert into on folder_edges");
  });

  it("fails UPDATE on edges", () => {
    const r = findV2DdlViolations([
      { name: "mark_friend_seen", def: "UPDATE public.edges SET seen_at = now();" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("update on edges");
  });

  it("fails causes DML outside delete_account", () => {
    const r = findV2DdlViolations([
      { name: "ensure_my_ask", def: "DELETE FROM public.causes WHERE id = 1;" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.violations.join(" ")).toContain("on causes");
  });

  it("fails non-DELETE causes DML even inside delete_account", () => {
    const r = findV2DdlViolations([
      { name: "delete_account", def: "UPDATE public.causes SET x = 1; INSERT INTO public.causes DEFAULT VALUES;" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.violations.filter((v) => v.includes("on causes"))).toHaveLength(2);
  });

  it("allows the delete_account cause DELETE (qualified and unqualified)", () => {
    const r = findV2DdlViolations([
      { name: "delete_account", def: "DELETE FROM public.causes c WHERE true; DELETE FROM causes WHERE false;" },
    ]);
    expect(r.ok).toBe(true);
  });

  it("does not flag SELECTs or similarly-named tables", () => {
    const r = findV2DdlViolations([
      { name: "get_friend_rail", def: "SELECT * FROM public.edges_backup; SELECT count(*) FROM causes_archive;" },
    ]);
    expect(r.ok).toBe(true);
  });
});

describe("planV2RoleProbe (PROBE RULE)", () => {
  it("class S: call-deny for both roles when EXECUTE absent", () => {
    expect(planV2RoleProbe("S", "anon", false).action).toBe("call-deny");
    expect(planV2RoleProbe("S", "authenticated", false).action).toBe("call-deny");
  });
  it("class S: fail-privilege (never call) when EXECUTE unexpectedly present", () => {
    for (const role of ["anon", "authenticated"] as const) {
      const p = planV2RoleProbe("S", role, true);
      expect(p.action).toBe("fail-privilege");
    }
  });
  it("class O: call-deny as anon, assert-grant as authenticated", () => {
    expect(planV2RoleProbe("O", "anon", false).action).toBe("call-deny");
    expect(planV2RoleProbe("O", "anon", true).action).toBe("fail-privilege");
    expect(planV2RoleProbe("O", "authenticated", true).action).toBe("assert-grant");
    expect(planV2RoleProbe("O", "authenticated", false).action).toBe("fail-privilege");
  });
});

describe("buildProbeCall / splitTopLevel", () => {
  it("builds typed NULL calls from oidvectortypes", () => {
    expect(buildProbeCall("guest_get_ask", "text")).toBe("SELECT public.guest_get_ask(NULL::text)");
    expect(buildProbeCall("housekeeping_purge", "")).toBe("SELECT public.housekeeping_purge()");
    expect(buildProbeCall("get_inbox", "text, uuid, jsonb, text, numeric, uuid, integer")).toBe(
      "SELECT public.get_inbox(NULL::text, NULL::uuid, NULL::jsonb, NULL::text, NULL::numeric, NULL::uuid, NULL::integer)"
    );
  });
  it("splitTopLevel respects parens", () => {
    expect(splitTopLevel("text, uuid, jsonb")).toEqual(["text", "uuid", "jsonb"]);
    expect(splitTopLevel("numeric(10,2), text[]")).toEqual(["numeric(10,2)", "text[]"]);
    expect(splitTopLevel("")).toEqual([]);
  });
});

describe("findCoverageGaps (DB-22 evaluator, frozen coverage lib)", () => {
  it("passes an empty live snapshot", () => {
    expect(coverageGaps({ liveFks: [], liveColumns: [], livePayloadKeys: [] })).toEqual([]);
  });
  it("passes a fully covered FK/column/payload snapshot", () => {
    const fk = COVERED_FKS[0];
    const r = coverageGaps({
      liveFks: [{ child: fk.child, column: fk.column, parent: fk.parent, on_delete: fk.on_delete }],
      liveColumns: [{ table: "account_deletion_jobs", column: "user_id" }],
      livePayloadKeys: [{ table: "notifications", type_or_kind: "recommendation_received", key: "count" }],
    });
    expect(r).toEqual([]);
  });
  it("reports an uncovered FK (seeded violation)", () => {
    const r = coverageGaps({
      liveFks: [{ child: "mystery", column: "owner_id", parent: "public.users", on_delete: "NO ACTION" }],
      liveColumns: [],
      livePayloadKeys: [],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("uncovered FK: mystery.owner_id");
  });
  it("reports an uncovered unreferenced user column", () => {
    const r = coverageGaps({
      liveFks: [],
      liveColumns: [{ table: "backup_x", column: "user_id" }],
      livePayloadKeys: [],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("backup_x.user_id");
  });
  it("reports an uncovered payload key holding a user id", () => {
    const r = coverageGaps({
      liveFks: [],
      liveColumns: [],
      livePayloadKeys: [{ table: "notifications", type_or_kind: "new_type", key: "user_id" }],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toContain("new_type.user_id");
  });
});
