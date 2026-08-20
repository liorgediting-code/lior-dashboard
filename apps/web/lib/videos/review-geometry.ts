import type { VideoComment, VideoDrawing } from "@dashboard-lior/shared";

// Pure geometry + formatting for the video review player. No `server-only`
// import and no Supabase import, so this can be unit-tested directly — same
// split as lib/metrics/campaign-stats.ts.
//
// THE ROUND TRIP THAT MATTERS: a drawing is captured against whatever box
// the video happens to render at (phone, desktop, resized window) and must
// reproduce at the same relative spot on a DIFFERENT box. That only works
// if points are normalised to 0..1 of the box's own width/height on the way
// in, and re-scaled by the CURRENT box's width/height on the way out. Never
// store or compare raw pixels.

export type DisplayBox = { width: number; height: number };
/** A box positioned within an element box — the video content, bars excluded. */
export type ContentBox = { left: number; top: number; width: number; height: number };
export type Point = [number, number];

/** Clamp to [0, 1] — a stroke drawn a pixel past the video edge must not store >1 or <0. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Pixel point within a display box -> normalised 0..1 point. */
export function normalisePoint(point: Point, box: DisplayBox): Point {
  if (box.width <= 0 || box.height <= 0) return [0, 0];
  return [clamp01(point[0] / box.width), clamp01(point[1] / box.height)];
}

/** Normalised 0..1 point -> pixel point within a (possibly different-sized) display box. */
export function projectPoint(point: Point, box: DisplayBox): Point {
  return [point[0] * box.width, point[1] * box.height];
}

export function normaliseStrokePoints(points: Point[], box: DisplayBox): Point[] {
  return points.map((point) => normalisePoint(point, box));
}

export function projectStrokePoints(points: Point[], box: DisplayBox): Point[] {
  return points.map((point) => projectPoint(point, box));
}

/**
 * The rectangle the video's PIXELS actually occupy inside its element box.
 *
 * Why this exists: a 1080x1920 ad inside a 768px-wide player would render
 * ~1365px tall, which is unusable — you cannot see the frame and the notes
 * at once. Constraining the height means `object-contain`, which means
 * pillarbox bars, which means the element box is no longer the video.
 *
 * Normalising against the ELEMENT box would then put a stroke in a
 * different relative spot whenever the bar width changes (different window,
 * different device, fullscreen). Normalise against this instead and a mark
 * stays on the same part of the frame everywhere.
 */
export function videoContentBox(elementBox: DisplayBox, intrinsic: DisplayBox): ContentBox {
  // Before `loadedmetadata` the intrinsic size is 0x0 and there is no
  // sensible content box — fall back to the element box so early strokes
  // are merely imprecise rather than divided by zero.
  if (intrinsic.width <= 0 || intrinsic.height <= 0 || elementBox.width <= 0 || elementBox.height <= 0) {
    return { left: 0, top: 0, width: elementBox.width, height: elementBox.height };
  }
  // `object-contain` scales to the smaller of the two ratios, letting the
  // other axis get bars.
  const scale = Math.min(elementBox.width / intrinsic.width, elementBox.height / intrinsic.height);
  const width = intrinsic.width * scale;
  const height = intrinsic.height * scale;
  return {
    left: (elementBox.width - width) / 2,
    top: (elementBox.height - height) / 2,
    width,
    height,
  };
}

/** Element-space pixel point -> normalised 0..1 against the content box (bars excluded). */
export function normalisePointInContent(point: Point, box: ContentBox): Point {
  return normalisePoint([point[0] - box.left, point[1] - box.top], { width: box.width, height: box.height });
}

/** Normalised 0..1 point -> element-space pixel point, re-adding the current bar offset. */
export function projectPointInContent(point: Point, box: ContentBox): Point {
  const [x, y] = projectPoint(point, { width: box.width, height: box.height });
  return [x + box.left, y + box.top];
}

export function normaliseStrokeInContent(points: Point[], box: ContentBox): Point[] {
  return points.map((point) => normalisePointInContent(point, box));
}

export function projectStrokeInContent(points: Point[], box: ContentBox): Point[] {
  return points.map((point) => projectPointInContent(point, box));
}

/** `12.4` -> `"0:12"`. Truncates the fraction — the label is for humans, the stored value keeps it. */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** Scrub-bar marker position as a percentage, 0..100. */
export function markerPercent(timestampSeconds: number, durationSeconds: number): number {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  return clamp01(timestampSeconds / durationSeconds) * 100;
}

/** Comments ordered along the timeline, earliest first — the contract the list and the markers both rely on. */
export function sortByTimestamp<T extends Pick<VideoComment, "timestamp_seconds">>(comments: T[]): T[] {
  return [...comments].sort((a, b) => Number(a.timestamp_seconds) - Number(b.timestamp_seconds));
}

/** True when a comment carries an actual drawing (not just an empty stroke list). */
export function hasDrawing(drawing: VideoDrawing | null | undefined): drawing is VideoDrawing {
  return Boolean(drawing && drawing.strokes && drawing.strokes.length > 0);
}
