import { describe, expect, it } from "vitest";
import { negotiateLocale } from "./negotiate";
import { tmdbTagFor } from "./languages";

// PRD §13 negotiation table (plan §7.2 item 2)
describe("negotiateLocale", () => {
  it("fr-FR,en;q=0.5 -> fr", () => {
    expect(negotiateLocale("fr-FR,en;q=0.5")).toBe("fr");
  });
  it("de-DE -> en", () => {
    expect(negotiateLocale("de-DE")).toBe("en");
  });
  it("th -> th", () => {
    expect(negotiateLocale("th")).toBe("th");
  });
  it("en,fr;q=0.9 -> en", () => {
    expect(negotiateLocale("en,fr;q=0.9")).toBe("en");
  });
  it("es-MX -> es", () => {
    expect(negotiateLocale("es-MX")).toBe("es");
  });
  it("q=0 and * are ignored", () => {
    expect(negotiateLocale("fr;q=0,*;q=0.1,de;q=0.5")).toBe("de" in {} ? "" : "en");
    expect(negotiateLocale("*;q=0.9")).toBe("en");
  });
  it("empty/missing header -> en", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale("")).toBe("en");
  });
});

describe("tmdbTagFor", () => {
  it("es + Latin-American region -> es-MX", () => {
    expect(tmdbTagFor("es", "es-MX,es;q=0.9")).toBe("es-MX");
    expect(tmdbTagFor("es", "es-AR")).toBe("es-MX");
  });
  it("es + non-LatAm region -> es-ES", () => {
    expect(tmdbTagFor("es", "es-ES")).toBe("es-ES");
  });
  it("other locales use config tag", () => {
    expect(tmdbTagFor("th", "th-TH")).toBe("th-TH");
    expect(tmdbTagFor("fr")).toBe("fr-FR");
  });
});
