import { describe, expect, it } from "vitest";
import {
  formatTimestamp,
  hasDrawing,
  markerPercent,
  normalisePoint,
  normaliseStrokePoints,
  projectPoint,
  projectStrokePoints,
  sortByTimestamp,
} from "../review-geometry";

describe("normalise -> project round trip", () => {
  it("reproduces the same relative position on a different-sized box", () => {
    // Drawn at the top-right quarter of a 400x300 (mobile) player.
    const mobileBox = { width: 400, height: 300 };
    const point: [number, number] = [300, 75];

    const normalised = normalisePoint(point, mobileBox);
    expect(normalised[0]).toBeCloseTo(0.75, 5);
    expect(normalised[1]).toBeCloseTo(0.25, 5);

    // Re-projected onto a 1200x675 (desktop) player must land at the same
    // relative spot, not the same pixel offset.
    const desktopBox = { width: 1200, height: 675 };
    const projected = projectPoint(normalised, desktopBox);
    expect(projected[0]).toBeCloseTo(900, 5);
    expect(projected[1]).toBeCloseTo(168.75, 5);
  });

  it("round-trips a whole stroke through two different display sizes", () => {
    const strokeAtA = [
      [10, 10],
      [50, 40],
      [90, 80],
    ] as [number, number][];
    const boxA = { width: 100, height: 100 };
    const boxB = { width: 500, height: 250 };

    const normalised = normaliseStrokePoints(strokeAtA, boxA);
    const projectedToB = projectStrokePoints(normalised, boxB);

    expect(projectedToB).toEqual([
      [50, 25],
      [250, 100],
      [450, 200],
    ]);

    // And back down to a box the same size as A reproduces the original points.
    const backToA = projectStrokePoints(normalised, boxA);
    expect(backToA).toEqual(strokeAtA);
  });

  it("clamps out-of-bounds pixels instead of storing values outside 0..1", () => {
    const box = { width: 100, height: 100 };
    expect(normalisePoint([-10, 150], box)).toEqual([0, 1]);
  });

  it("returns the origin for a degenerate (zero-size) box rather than dividing by zero", () => {
    expect(normalisePoint([10, 10], { width: 0, height: 0 })).toEqual([0, 0]);
  });
});

describe("formatTimestamp", () => {
  it("formats fractional seconds as m:ss, truncating the fraction", () => {
    expect(formatTimestamp(12.9)).toBe("0:12");
    expect(formatTimestamp(75)).toBe("1:15");
    expect(formatTimestamp(0)).toBe("0:00");
  });
});

describe("markerPercent", () => {
  it("places a mid-video comment at 50%", () => {
    expect(markerPercent(30, 60)).toBe(50);
  });

  it("returns 0 for a missing or zero duration instead of NaN/Infinity", () => {
    expect(markerPercent(10, 0)).toBe(0);
  });
});

describe("sortByTimestamp", () => {
  it("orders comments earliest-first without mutating the input array", () => {
    const input = [{ timestamp_seconds: 30 }, { timestamp_seconds: 5 }, { timestamp_seconds: 12.4 }];
    const sorted = sortByTimestamp(input);
    expect(sorted.map((c) => c.timestamp_seconds)).toEqual([5, 12.4, 30]);
    expect(input.map((c) => c.timestamp_seconds)).toEqual([30, 5, 12.4]);
  });

  it("coerces postgrest's numeric-as-string timestamps before comparing", () => {
    const input = [
      { timestamp_seconds: "20" as unknown as number },
      { timestamp_seconds: "3" as unknown as number },
    ];
    const sorted = sortByTimestamp(input);
    expect(sorted.map((c) => c.timestamp_seconds)).toEqual(["3", "20"]);
  });
});

describe("hasDrawing", () => {
  it("is false for null, undefined, and an empty stroke list", () => {
    expect(hasDrawing(null)).toBe(false);
    expect(hasDrawing(undefined)).toBe(false);
    expect(hasDrawing({ strokes: [] })).toBe(false);
  });

  it("is true when at least one stroke exists", () => {
    expect(hasDrawing({ strokes: [{ color: "#ef4444", width: 3, points: [[0, 0]] }] })).toBe(true);
  });
});
