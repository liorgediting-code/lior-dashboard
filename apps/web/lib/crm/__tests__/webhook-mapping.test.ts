import { describe, expect, it } from "vitest";
import { applyFieldMappings, suggestUnmappedKeys } from "../webhook-mapping";

const COLUMN_ID = "11111111-1111-1111-1111-111111111111";
const columns = new Set([COLUMN_ID]);

describe("applyFieldMappings", () => {
  it("keeps the built-in defaults working with no configuration", () => {
    const result = applyFieldMappings({ full_name: "דנה", phone_number: "050", email: "d@x.co" }, [], columns);
    expect(result).toEqual({ name: "דנה", phone: "050", email: "d@x.co", custom_fields: {} });
  });

  it("routes a configured key into a custom column, keyed by column id", () => {
    // CrmTable reads custom_fields by lead_columns.id — storing the raw key
    // here is exactly the bug this feature exists to fix.
    const result = applyFieldMappings({ "מה התקציב שלך?": "5000" }, [{ source_key: "מה התקציב שלך?", target: COLUMN_ID }], columns);
    expect(result.custom_fields).toEqual({ [COLUMN_ID]: "5000" });
  });

  it("lets an explicit mapping override a built-in default", () => {
    const result = applyFieldMappings({ name: "דנה" }, [{ source_key: "name", target: COLUMN_ID }], columns);
    expect(result.name).toBeNull();
    expect(result.custom_fields).toEqual({ [COLUMN_ID]: "דנה" });
  });

  it("matches source keys case-insensitively", () => {
    const result = applyFieldMappings({ Budget: "5000" }, [{ source_key: "budget", target: COLUMN_ID }], columns);
    expect(result.custom_fields).toEqual({ [COLUMN_ID]: "5000" });
  });

  it("drops keys mapped to ignore", () => {
    const result = applyFieldMappings({ utm_junk: "x", email: "d@x.co" }, [{ source_key: "utm_junk", target: "ignore" }], columns);
    expect(result.custom_fields).toEqual({});
    expect(result.email).toBe("d@x.co");
  });

  it("keeps unmapped keys under their raw key rather than discarding them", () => {
    const result = applyFieldMappings({ city: "חיפה" }, [], columns);
    expect(result.custom_fields).toEqual({ city: "חיפה" });
  });

  it("falls back to the raw key when the mapped column no longer exists", () => {
    // Deleting a CRM column must not make incoming data disappear into a
    // column id nothing renders.
    const result = applyFieldMappings({ city: "חיפה" }, [{ source_key: "city", target: "deleted-column-id" }], columns);
    expect(result.custom_fields).toEqual({ city: "חיפה" });
  });

  it("flattens Meta's array-valued answers", () => {
    const result = applyFieldMappings({ email: ["d@x.co"], interests: ["א", "ב"] }, [], columns);
    expect(result.email).toBe("d@x.co");
    expect(result.custom_fields).toEqual({ interests: "א, ב" });
  });

  it("skips values that can't be stored", () => {
    const result = applyFieldMappings({ nested: { a: 1 }, empty: null, ok: 5 }, [], columns);
    expect(result.custom_fields).toEqual({ ok: 5 });
  });

  it("keeps the first non-empty value when two keys map to the same field", () => {
    const result = applyFieldMappings(
      { full_name: "דנה", nickname: "" },
      [{ source_key: "nickname", target: "name" }],
      columns
    );
    expect(result.name).toBe("דנה");
  });
});

describe("suggestUnmappedKeys", () => {
  it("lists raw keys seen on leads that have no mapping yet", () => {
    const suggestions = suggestUnmappedKeys(
      [{ city: "חיפה", budget: "5000" }, { city: "תל אביב" }],
      [{ source_key: "budget" }],
      columns
    );
    expect(suggestions).toEqual(["city"]);
  });

  it("ignores keys that are already column ids", () => {
    const suggestions = suggestUnmappedKeys([{ [COLUMN_ID]: "5000" }], [], columns);
    expect(suggestions).toEqual([]);
  });

  it("de-duplicates case variants", () => {
    const suggestions = suggestUnmappedKeys([{ City: "חיפה" }, { city: "תל אביב" }], [], columns);
    expect(suggestions).toHaveLength(1);
  });
});
