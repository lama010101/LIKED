import { describe, expect, it } from "vitest";
import { extractLanguageCodes, findMissingTags } from "./check-languages.mjs";

const TAGS = ["en-US", "fr-FR", "es-ES", "es-MX", "th-TH"];

describe("extractLanguageCodes", () => {
  it("accepts a plain array of strings", () => {
    const r = extractLanguageCodes(["en-US", "fr-FR", "es-ES", "th-TH"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.codes).toEqual(["en-US", "fr-FR", "es-ES", "th-TH"]);
  });

  it("accepts an object with a languages array of objects", () => {
    const r = extractLanguageCodes({
      languages: [
        { iso_639_1: "en" },
        { iso_639_1: "fr" },
        { iso_639_1: "es" },
        { iso_639_1: "th" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(findMissingTags(r.codes, TAGS)).toEqual([]);
  });

  it("accepts an object with a results array", () => {
    const r = extractLanguageCodes({ results: ["en", "fr", "es", "th"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(findMissingTags(r.codes, TAGS)).toEqual([]);
  });

  it("rejects a bad shape and reports keys only", () => {
    const r = extractLanguageCodes({ foo: 1, bar: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.shape).toBe("object(keys=foo,bar)");
  });

  it("rejects an array without language codes", () => {
    const r = extractLanguageCodes([1, 2, 3]);
    expect(r.ok).toBe(false);
  });
});

describe("findMissingTags", () => {
  it("passes when every required tag is covered by primary subtag", () => {
    expect(findMissingTags(["en", "fr", "es", "th"], TAGS)).toEqual([]);
  });

  it("passes when response uses full region tags", () => {
    expect(findMissingTags(["en-US", "fr-FR", "es-ES", "th-TH"], TAGS)).toEqual([]);
  });

  it("lists missing tags", () => {
    expect(findMissingTags(["en", "fr", "es"], TAGS)).toEqual(["th-TH"]);
  });
});
