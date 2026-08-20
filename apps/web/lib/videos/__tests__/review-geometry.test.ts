import { describe, expect, it } from "vitest";
import {
  formatTimestamp,
  hasDrawing,
  markerPercent,
  normalisePoint,
  normalisePointInContent,
  normaliseStrokeInContent,
  normaliseStrokePoints,
  projectPoint,
  projectPointInContent,
  projectStrokeInContent,
  projectStrokePoints,
  sortByTimestamp,
  videoContentBox,
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

describe("videoContentBox", () => {
  // The real case: a 1080x1920 ad in a wide, height-capped player. The
  // frame occupies a narrow column with bars either side.
  it("pillarboxes a vertical video in a wide box", () => {
    const box = videoContentBox({ width: 768, height: 600 }, { width: 1080, height: 1920 });
    expect(box.height).toBeCloseTo(600);
    expect(box.width).toBeCloseTo(337.5);
    expect(box.left).toBeCloseTo((768 - 337.5) / 2);
    expect(box.top).toBeCloseTo(0);
  });

  it("letterboxes a wide video in a tall box", () => {
    const box = videoContentBox({ width: 400, height: 400 }, { width: 1920, height: 1080 });
    expect(box.width).toBeCloseTo(400);
    expect(box.height).toBeCloseTo(225);
    expect(box.left).toBeCloseTo(0);
    expect(box.top).toBeCloseTo(87.5);
  });

  it("has no bars when the aspect ratios match", () => {
    const box = videoContentBox({ width: 640, height: 360 }, { width: 1920, height: 1080 });
    expect(box).toEqual({ left: 0, top: 0, width: 640, height: 360 });
  });

  // Before loadedmetadata the intrinsic size is 0x0 — must not divide by zero.
  it("falls back to the element box before metadata arrives", () => {
    expect(videoContentBox({ width: 500, height: 300 }, { width: 0, height: 0 })).toEqual({
      left: 0,
      top: 0,
      width: 500,
      height: 300,
    });
  });
});

describe("content-box round trip", () => {
  const intrinsic = { width: 1080, height: 1920 };

  // The property the whole feature rests on: a mark made on one viewport
  // must land on the same part of the FRAME on a different viewport, even
  // though the pillarbox bars differ in both size and position.
  it("puts a point on the same part of the frame across viewports", () => {
    const desktop = videoContentBox({ width: 768, height: 600 }, intrinsic);
    const phone = videoContentBox({ width: 390, height: 700 }, intrinsic);

    // A point at the centre of the frame as drawn on desktop.
    const drawn: [number, number] = [desktop.left + desktop.width / 2, desktop.top + desktop.height / 2];
    const normalised = normalisePointInContent(drawn, desktop);
    expect(normalised[0]).toBeCloseTo(0.5);
    expect(normalised[1]).toBeCloseTo(0.5);

    const replayed = projectPointInContent(normalised, phone);
    expect(replayed[0]).toBeCloseTo(phone.left + phone.width / 2);
    expect(replayed[1]).toBeCloseTo(phone.top + phone.height / 2);
  });

  it("keeps a corner mark in the frame's corner, not the element's", () => {
    const box = videoContentBox({ width: 768, height: 600 }, intrinsic);
    const topLeftOfFrame: [number, number] = [box.left, box.top];
    expect(normalisePointInContent(topLeftOfFrame, box)).toEqual([0, 0]);
  });

  // A stroke that strays onto the black bar clamps to the frame edge
  // rather than storing a negative coordinate.
  it("clamps a point drawn on the pillarbox bar to the frame edge", () => {
    const box = videoContentBox({ width: 768, height: 600 }, intrinsic);
    expect(normalisePointInContent([0, 300], box)[0]).toBe(0);
    expect(normalisePointInContent([767, 300], box)[0]).toBe(1);
  });

  it("round-trips a whole stroke", () => {
    const box = videoContentBox({ width: 768, height: 600 }, intrinsic);
    const points: [number, number][] = [
      [box.left + 10, box.top + 20],
      [box.left + 100, box.top + 200],
    ];
    const back = projectStrokeInContent(normaliseStrokeInContent(points, box), box);
    expect(back[0][0]).toBeCloseTo(points[0][0]);
    expect(back[0][1]).toBeCloseTo(points[0][1]);
    expect(back[1][0]).toBeCloseTo(points[1][0]);
    expect(back[1][1]).toBeCloseTo(points[1][1]);
  });
});
