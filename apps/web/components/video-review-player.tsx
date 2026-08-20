"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { VideoComment, VideoDrawing, VideoDrawingStroke } from "@dashboard-lior/shared";
import { addVideoComment, resolveVideoComment } from "@/lib/actions/videos";
import {
  ContentBox,
  formatTimestamp,
  hasDrawing,
  markerPercent,
  normalisePointInContent,
  projectStrokeInContent,
  sortByTimestamp,
  videoContentBox,
} from "@/lib/videos/review-geometry";

const STROKE_WIDTH = 4;

/** Deliberately few, and all readable against video: picking a colour is a decision, not a hobby. */
const COLORS = [
  { value: "#ef4444", label: "אדום" },
  { value: "#facc15", label: "צהוב" },
  { value: "#22d3ee", label: "תכלת" },
  { value: "#ffffff", label: "לבן" },
];

const EMPTY_BOX: ContentBox = { left: 0, top: 0, width: 0, height: 0 };

type Props = {
  videoId: string;
  clientId: string;
  streamUrl: string;
  durationSeconds: number | null;
  comments: VideoComment[];
  /** Agency view gets a "mark resolved" button and shows every comment's author; the portal view doesn't. */
  isAgencyView: boolean;
};

export function VideoReviewPlayer({ videoId, streamUrl, durationSeconds, comments, isAgencyView }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPending, startTransition] = useTransition();

  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<VideoDrawingStroke[]>([]);
  const [color, setColor] = useState(COLORS[0].value);
  const [pendingTimestamp, setPendingTimestamp] = useState<number | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [previewComment, setPreviewComment] = useState<VideoComment | null>(null);

  // The content box is read on every pointer event and every repaint, and
  // must never be a render-triggering state value — a setState per
  // pointermove would drop points on a slow device.
  const contentBoxRef = useRef<ContentBox>(EMPTY_BOX);
  // The stroke being drawn right now. A ref, not state, for the same reason;
  // `repaint()` reads it directly.
  const liveStrokeRef = useRef<VideoDrawingStroke | null>(null);

  const sorted = sortByTimestamp(comments);
  const duration = durationSeconds ?? 0;

  /**
   * Repaints the whole canvas from scratch, always.
   *
   * There is no incremental drawing anywhere: the previous version painted
   * each segment as the pointer moved and never repainted from state, so a
   * window resize silently erased strokes the user had already drawn and a
   * finished stroke could not be undone. One paint path, one source of
   * truth.
   */
  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const live = liveStrokeRef.current;
    const toPaint: VideoDrawingStroke[] = isDrawing
      ? [...strokes, ...(live ? [live] : [])]
      : previewComment && hasDrawing(previewComment.drawing)
        ? previewComment.drawing.strokes
        : [];

    for (const stroke of toPaint) {
      const pixels = projectStrokeInContent(stroke.points, contentBoxRef.current);
      if (pixels.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // A dark outline under the stroke keeps a white or yellow mark visible
      // on a bright frame, which is most of an ad.
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.moveTo(pixels[0][0], pixels[0][1]);
      for (const point of pixels.slice(1)) ctx.lineTo(point[0], point[1]);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }, [isDrawing, strokes, previewComment]);

  /**
   * Keeps the canvas's backing store equal to the video element's rendered
   * box, and recomputes where the frame sits inside it.
   *
   * This is the bug that made drawing unusable before: the canvas was sized
   * ONCE at mount, before `loadedmetadata`. A 1080x1920 ad makes the element
   * roughly nine times taller the moment metadata arrives, so the small
   * backing store got CSS-stretched and every stroke landed squashed and
   * offset from where the user actually drew it.
   *
   * Two triggers are needed, not one. ResizeObserver catches window resizes
   * and layout shifts — but because the element's height is CAPPED, its box
   * may not change at all when metadata arrives, while the intrinsic aspect
   * ratio (and therefore the pillarbox) changes completely. `loadedmetadata`
   * is the only signal for that case.
   */
  const syncGeometry = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const elementBox = { width: video.clientWidth, height: video.clientHeight };
    if (elementBox.width === 0 || elementBox.height === 0) return;

    // 1:1 backing store to display size, so painting in element pixels is
    // correct without any extra scale factor.
    if (canvas.width !== elementBox.width) canvas.width = elementBox.width;
    if (canvas.height !== elementBox.height) canvas.height = elementBox.height;

    contentBoxRef.current = videoContentBox(elementBox, {
      width: video.videoWidth,
      height: video.videoHeight,
    });
    repaint();
  }, [repaint]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    syncGeometry();
    const observer = new ResizeObserver(syncGeometry);
    observer.observe(video);
    video.addEventListener("loadedmetadata", syncGeometry);
    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", syncGeometry);
    };
  }, [syncGeometry]);

  // Repaint whenever what should be on screen changes.
  useEffect(() => {
    repaint();
  }, [repaint]);

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (video) video.currentTime = seconds;
  }

  function startNote() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    // Fractional seconds kept as-is — never Math.round here.
    setPendingTimestamp(video.currentTime);
    setStrokes([]);
    liveStrokeRef.current = null;
    setPreviewComment(null);
    setIsDrawing(true);
  }

  function cancelNote() {
    setIsDrawing(false);
    setPendingTimestamp(null);
    setStrokes([]);
    liveStrokeRef.current = null;
    setNoteBody("");
  }

  /** Pointer position -> a normalised point against the frame, bars excluded. */
  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return normalisePointInContent([e.clientX - rect.left, e.clientY - rect.top], contentBoxRef.current);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    // isPrimary guards against a palm or second finger starting a second
    // stroke mid-drag — clients will review these on phones.
    if (!isDrawing || !e.isPrimary) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    liveStrokeRef.current = { color, width: STROKE_WIDTH, points: [pointFromEvent(e)] };
    repaint();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!liveStrokeRef.current || !e.isPrimary) return;
    liveStrokeRef.current.points.push(pointFromEvent(e));
    repaint();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const live = liveStrokeRef.current;
    liveStrokeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // A single tap is not a stroke — two points minimum, or it renders as
    // nothing and just clutters the saved drawing.
    if (live && live.points.length > 1) setStrokes((prev) => [...prev, live]);
    else repaint();
  }

  function submitNote() {
    if (pendingTimestamp == null || !noteBody.trim()) return;
    const drawing: VideoDrawing | null = strokes.length > 0 ? { strokes } : null;
    startTransition(async () => {
      await addVideoComment({ videoId, timestampSeconds: pendingTimestamp, body: noteBody.trim(), drawing });
      cancelNote();
    });
  }

  function showComment(comment: VideoComment) {
    seekTo(Number(comment.timestamp_seconds));
    setPreviewComment(comment);
  }

  return (
    <div>
      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-lg bg-black" dir="ltr">
        {/*
          max-h + object-contain: a 1080x1920 ad would otherwise render ~1365px
          tall and you could not see the frame and the notes at once. The
          pillarbox bars this creates are why coordinates are normalised
          against `videoContentBox` and NOT against the element box.
        */}
        <video
          ref={videoRef}
          src={streamUrl}
          controls
          playsInline
          className="mx-auto block max-h-[65vh] w-full object-contain"
          onPlay={() => {
            if (isDrawing) cancelNote();
          }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{
            pointerEvents: isDrawing ? "auto" : "none",
            touchAction: isDrawing ? "none" : "auto",
            cursor: isDrawing ? "crosshair" : "default",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {isDrawing && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-2">
            <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
              ציירו על התמונה כדי לסמן מה לתקן
            </span>
          </div>
        )}
      </div>

      {/* Scrub-bar markers, forced LTR so time runs left-to-right regardless of the page's RTL direction. */}
      {duration > 0 && (
        <div className="relative mx-auto mt-2 h-3 max-w-3xl rounded bg-slate-200" dir="ltr">
          {sorted.map((comment) => (
            <button
              key={comment.id}
              type="button"
              title={`${formatTimestamp(Number(comment.timestamp_seconds))} · ${comment.body}`}
              onClick={() => showComment(comment)}
              className={`absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full border border-white transition-transform hover:scale-125 ${
                previewComment?.id === comment.id ? "scale-125 bg-amber-500" : "bg-blue-600"
              }`}
              style={{ left: `${markerPercent(Number(comment.timestamp_seconds), duration)}%` }}
            />
          ))}
        </div>
      )}

      <div className="mx-auto mt-3 max-w-3xl">
        {!isDrawing ? (
          <div className="flex items-center gap-3">
            <button type="button" className="btn btn-secondary" onClick={startNote}>
              + הוסף הערה בנקודה הזו
            </button>
            {previewComment && (
              <button type="button" className="text-sm text-slate-500 underline" onClick={() => setPreviewComment(null)}>
                נקה סימון
              </button>
            )}
          </div>
        ) : (
          <div className="card">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="label mb-0">הערה בזמן {formatTimestamp(pendingTimestamp ?? 0)}</span>
              <div className="flex items-center gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => setColor(c.value)}
                    className={`h-6 w-6 rounded-full border-2 transition-transform ${
                      color === c.value ? "scale-110 border-blue-700" : "border-slate-300"
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary text-xs"
                disabled={strokes.length === 0}
                onClick={() => setStrokes((prev) => prev.slice(0, -1))}
              >
                בטל ציור אחרון
              </button>
              <button
                type="button"
                className="btn btn-secondary text-xs"
                disabled={strokes.length === 0}
                onClick={() => setStrokes([])}
              >
                נקה הכל
              </button>
              <span className="text-xs text-slate-500">
                {strokes.length > 0 ? `${strokes.length} סימונים` : "אפשר גם רק לכתוב, בלי לצייר"}
              </span>
            </div>

            <textarea
              className="input mb-2 w-full"
              rows={2}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="מה צריך לתקן?"
              autoFocus
            />
            <div className="flex gap-2">
              <button type="button" className="btn btn-primary" disabled={isPending || !noteBody.trim()} onClick={submitNote}>
                שמור הערה
              </button>
              <button type="button" className="btn btn-secondary" onClick={cancelNote}>
                ביטול
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto mt-4 max-w-3xl space-y-2">
        {sorted.length === 0 && <p className="text-sm text-slate-500">אין עדיין הערות על הסרטון הזה.</p>}
        {sorted.map((comment) => (
          <div
            key={comment.id}
            className={`card flex items-start justify-between gap-3 ${comment.resolved_at ? "opacity-60" : ""} ${
              previewComment?.id === comment.id ? "ring-2 ring-blue-400" : ""
            }`}
          >
            <button type="button" className="flex-1 text-right" onClick={() => showComment(comment)}>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="badge badge-neutral">{formatTimestamp(Number(comment.timestamp_seconds))}</span>
                <span>{comment.author_kind === "agency" ? "הסוכנות" : "לקוח"}</span>
                {hasDrawing(comment.drawing) && <span>· כולל ציור</span>}
                {comment.resolved_at && <span className="badge badge-winner">טופל</span>}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
            </button>
            {isAgencyView && !comment.resolved_at && (
              <button
                type="button"
                className="btn btn-secondary text-xs"
                disabled={isPending}
                onClick={() => startTransition(() => resolveVideoComment(comment.id))}
              >
                סמן כטופל
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
