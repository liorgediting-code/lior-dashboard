import { describe, expect, it } from "vitest";
import { resolveColumnLayout, moveColumn, toggleColumnHidden, toStoredLayout } from "../column-layout";

const CUSTOM_A = { id: "a", name: "תקציב", sort_order: 0 };
const CUSTOM_B = { id: "b", name: "מקור פנייה", sort_order: 1 };

describe("resolveColumnLayout", () => {
  it("defaults to built-ins first, then custom columns by sort_order, nothing hidden", () => {
    const resolved = resolveColumnLayout(null, [CUSTOM_B, CUSTOM_A]);
    expect(resolved.map((c) => c.key)).toEqual(["name", "phone", "email", "status", "source", "deal_value", "follow_up", "a", "b"]);
    expect(resolved.every((c) => !c.hidden)).toBe(true);
  });

  it("applies a stored order and stored hidden flags", () => {
    const stored = [
      { key: "phone", hidden: false },
      { key: "name", hidden: false },
      { key: "a", hidden: true },
    ];
    const resolved = resolveColumnLayout(stored, [CUSTOM_A]);
    expect(resolved.map((c) => c.key)).toEqual(["phone", "name", "a", "email", "status", "source", "deal_value", "follow_up"]);
    expect(resolved.find((c) => c.key === "a")?.hidden).toBe(true);
  });

  it("drops a stored key for a column that was deleted since", () => {
    const stored = [{ key: "a", hidden: false }];
    const resolved = resolveColumnLayout(stored, []);
    expect(resolved.some((c) => c.key === "a")).toBe(false);
  });

  it("appends a column that didn't exist when the layout was saved", () => {
    const stored = [{ key: "name", hidden: false }];
    const resolved = resolveColumnLayout(stored, [CUSTOM_A]);
    expect(resolved.map((c) => c.key)).toContain("a");
  });

  it("never hides name or status even if a stale stored entry says so", () => {
    const stored = [
      { key: "name", hidden: true },
      { key: "status", hidden: true },
    ];
    const resolved = resolveColumnLayout(stored, []);
    expect(resolved.find((c) => c.key === "name")?.hidden).toBe(false);
    expect(resolved.find((c) => c.key === "status")?.hidden).toBe(false);
  });
});

describe("moveColumn", () => {
  it("swaps with the previous column on 'up'", () => {
    const resolved = resolveColumnLayout(null, []);
    const moved = moveColumn(resolved, "phone", "up");
    expect(moved.map((c) => c.key).slice(0, 2)).toEqual(["phone", "name"]);
  });

  it("is a no-op at the boundary", () => {
    const resolved = resolveColumnLayout(null, []);
    const moved = moveColumn(resolved, "name", "up");
    expect(moved.map((c) => c.key)).toEqual(resolved.map((c) => c.key));
  });
});

describe("toggleColumnHidden", () => {
  it("flips a togglable column", () => {
    const resolved = resolveColumnLayout(null, []);
    const toggled = toggleColumnHidden(resolved, "phone");
    expect(toggled.find((c) => c.key === "phone")?.hidden).toBe(true);
  });

  it("refuses to hide a locked column", () => {
    const resolved = resolveColumnLayout(null, []);
    const toggled = toggleColumnHidden(resolved, "name");
    expect(toggled.find((c) => c.key === "name")?.hidden).toBe(false);
  });
});

describe("toStoredLayout", () => {
  it("strips derived fields down to key + hidden", () => {
    const resolved = resolveColumnLayout(null, [CUSTOM_A]);
    expect(toStoredLayout(resolved)).toEqual(resolved.map((c) => ({ key: c.key, hidden: c.hidden })));
  });
});
