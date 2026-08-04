import { describe, expect, it } from "vitest";
import { serializeDriveLinks } from "../drive-links";

describe("serializeDriveLinks", () => {
  it("serializes non-empty rows to JSON", () => {
    const json = serializeDriveLinks([{ label: "תיקייה", url: "https://drive.google.com/x" }]);
    expect(JSON.parse(json)).toEqual([{ label: "תיקייה", url: "https://drive.google.com/x" }]);
  });

  it("trims whitespace from label and url", () => {
    const json = serializeDriveLinks([{ label: "  תיקייה  ", url: "  https://x  " }]);
    expect(JSON.parse(json)).toEqual([{ label: "תיקייה", url: "https://x" }]);
  });

  it("drops rows where both fields are empty", () => {
    const json = serializeDriveLinks([
      { label: "", url: "" },
      { label: "תיקייה", url: "https://x" },
    ]);
    expect(JSON.parse(json)).toEqual([{ label: "תיקייה", url: "https://x" }]);
  });

  it("keeps a row with only one field filled in", () => {
    const json = serializeDriveLinks([{ label: "תיקייה", url: "" }]);
    expect(JSON.parse(json)).toEqual([{ label: "תיקייה", url: "" }]);
  });

  it("serializes an empty list to an empty JSON array", () => {
    expect(serializeDriveLinks([])).toBe("[]");
  });
});
