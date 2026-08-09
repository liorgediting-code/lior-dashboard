import { describe, expect, it } from "vitest";
import { normalizeQuestions, weekStartIso } from "../questionnaire-week";

describe("weekStartIso", () => {
  it("returns the same Sunday for every day of that week", () => {
    // Sun 2026-08-02 .. Sat 2026-08-08 all belong to the week starting 08-02.
    const days = ["2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"];
    for (const day of days) {
      const [year, month, date] = day.split("-").map(Number);
      expect(weekStartIso(new Date(year, month - 1, date))).toBe("2026-08-02");
    }
  });

  it("returns the day itself when it is already a Sunday", () => {
    expect(weekStartIso(new Date(2026, 7, 9))).toBe("2026-08-09");
  });

  it("starts a NEW week on Sunday rather than closing the previous one", () => {
    // The Sun-vs-Mon regression: Saturday ends the week, Sunday opens the next.
    expect(weekStartIso(new Date(2026, 7, 8))).toBe("2026-08-02");
    expect(weekStartIso(new Date(2026, 7, 9))).toBe("2026-08-09");
  });

  it("crosses month and year boundaries", () => {
    // 2026-01-01 is a Thursday; its week started Sun 2025-12-28.
    expect(weekStartIso(new Date(2026, 0, 1))).toBe("2025-12-28");
  });
});

describe("normalizeQuestions", () => {
  it("drops questions with a blank label", () => {
    const result = normalizeQuestions([
      { id: "a", label: "שאלה", type: "text", required: true },
      { id: "b", label: "   ", type: "text", required: false },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("falls back to a positional id when one is missing", () => {
    const result = normalizeQuestions([{ label: "בלי מזהה" }]);
    expect(result[0].id).toBe("q1");
  });

  it("falls back to the text type for an unknown type", () => {
    const result = normalizeQuestions([{ id: "a", label: "שאלה", type: "carrier-pigeon" }]);
    expect(result[0].type).toBe("text");
  });

  it("treats the string 'true' as required, since form values arrive as strings", () => {
    const result = normalizeQuestions([{ id: "a", label: "שאלה", required: "true" }]);
    expect(result[0].required).toBe(true);
  });

  it("returns an empty list for non-array input", () => {
    expect(normalizeQuestions(null)).toEqual([]);
    expect(normalizeQuestions({ not: "an array" })).toEqual([]);
  });
});
