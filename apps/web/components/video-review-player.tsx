"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { VideoComment, VideoDrawing, VideoDrawingStroke } from "@dashboard-lior/shared";
import { addVideoComment, resolveVideoComment } from "@/lib/actions/videos";
import { formatTimestamp, hasDrawing, markerPercent, normaliseStrokePoints, projectStrokePoints, sortByTimestamp } from "@/lib/videos/review-geometry";

const STROKE_COLOR = "#ef4444";
const STROKE_WIDTH = 3;

type Props = {
  videoId: string;
  clientId: string;
  streamUrl: string;
  durationSeconds: number | null;
  comments: VideoComment[];
  /** Agency view gets a "mark resolved" button and shows every comment's author; the portal view doesn't. */
  isAgencyView: boolean;
};

/** Draws the strokes of one comment's drawing onto a canvas already sized to match the video's display box. */
function paintDrawing(ctx: CanvasRenderingContext2D, drawing: VideoDrawing, box: { width: number; height: number }) {
  ctx.clearRect(0, 0, box.width, box.height);
  for (const stroke of drawing.strokes) {
    const pixels = projectStrokePoints(stroke.points, box);
    if (pixels.length < 2) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pixels[0][0], pixels[0][1]);
    for (const point of pixels.slice(1)) ctx.lineTo(point[0], point[1]);
    ctx.stroke();
  }
}

export function VideoReviewPlayer({ videoId, clientId, streamUrl, durationSeconds, comments, isAgencyView }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPending, startTransition] = useTransition();

  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<VideoDrawingStroke[]>([]);
  const [pendingTimestamp, setPendingTimestamp] = useState<number | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [previewComment, setPreviewComment] = useState<VideoComment | null>(null);

  const sorted = sortByTimestamp(comments);
  const duration = durationSeconds ?? 0;

  function displayBox() {
    const el = videoRef.current;
    return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 };
  }

  // Re-sizes the canvas to exactly overlay the <video> element whenever the
  // layout changes — a mismatched canvas box is what makes normalised
  // coordinates land in the wrong place.
  useEffect(() => {
    function syncCanvasSize() {
      const canvas = canvasRef.current;
      const box = displayBox();
      if (!canvas || box.width === 0) return;
      canvas.width = box.width;
      canvas.height = box.height;
      const ctx = canvas.getContext("2d");
      if (ctx && previewComment && hasDrawing(previewComment.drawing)) {
        paintDrawing(ctx, previewComment.drawing, box);
      }
    }
    syncCanvasSize();
    window.addEventListener("resize", syncCanvasSize);
    return () => window.removeEventListener("resize", syncCanvasSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewComment]);

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
  }

  function startNote() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    // Fractional seconds kept as-is — never Math.round here.
    setPendingTimestamp(video.currentTime);
    setStrokes([]);
    setPreviewComment(null);
    setIsDrawing(true);
  }

  function cancelNote() {
    setIsDrawing(false);
    setPendingTimestamp(null);
    setStrokes([]);
    setNoteBody("");
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const box = { width: rect.width, height: rect.height };
    const raw: [number, number][] = [[e.clientX - rect.left, e.clientY - rect.top]];
    const drag = (moveEvent: PointerEvent) => {
      raw.push([moveEvent.clientX - rect.left, moveEvent.clientY - rect.top]);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = STROKE_COLOR;
        ctx.lineWidth = STROKE_WIDTH;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(raw[raw.length - 2][0], raw[raw.length - 2][1]);
        ctx.lineTo(raw[raw.length - 1][0], raw[raw.length - 1][1]);
        ctx.stroke();
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", drag);
      window.removeEventListener("pointerup", stop);
      if (raw.length > 1) {
        setStrokes((prev) => [
          ...prev,
          { color: STROKE_COLOR, width: STROKE_WIDTH, points: normaliseStrokePoints(raw, box) },
        ]);
      }
    };
    window.addEventListener("pointermove", drag);
    window.addEventListener("pointerup", stop);
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
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      const box = { width: canvas.width, height: canvas.height };
      if (hasDrawing(comment.drawing)) paintDrawing(ctx, comment.drawing, box);
      else ctx.clearRect(0, 0, box.width, box.height);
    }
  }

  return (
    <div>
      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-lg bg-black" dir="ltr">
        <video
          ref={videoRef}
          src={streamUrl}
          controls
          className="block w-full"
          onPlay={() => {
            if (isDrawing) cancelNote();
          }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: isDrawing ? "auto" : "none", touchAction: isDrawing ? "none" : "auto" }}
          onPointerDown={handlePointerDown}
        />
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
              className="absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full border border-white bg-blue-600 hover:scale-125"
              style={{ left: `${markerPercent(Number(comment.timestamp_seconds), duration)}%` }}
            />
          ))}
        </div>
      )}

      <div className="mx-auto mt-3 max-w-3xl">
        {!isDrawing ? (
          <button type="button" className="btn btn-secondary" onClick={startNote}>
            + הוסף הערה בנקודה הזו
          </button>
        ) : (
          <div className="card">
            <p className="label">
              הערה בזמן {formatTimestamp(pendingTimestamp ?? 0)} {strokes.length > 0 && "· ציור נשמר"}
            </p>
            <p className="mb-2 text-xs text-slate-500">אפשר לצייר ישירות על התמונה, ולכתוב הערה למטה.</p>
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
          <div key={comment.id} className={`card flex items-start justify-between gap-3 ${comment.resolved_at ? "opacity-60" : ""}`}>
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
