import rough from "roughjs";
import type { El, View } from "./types";

const thick = (el: El) => el.sw * 2 + 8; // body thickness of the block arrow
const fontOf = (el: El) => `${el.fs ?? 20}px 'Segoe Print','Comic Sans MS',cursive`;
const lineH = (el: El) => (el.fs ?? 20) * 1.3;

const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_RE = /[A-Za-z\u00C0-\u024F]/;
export function isRTL(el: Pick<El, "dir" | "text">): boolean {
  if (el.dir === "rtl") return true;
  if (el.dir === "ltr") return false;
  const t = el.text || "";
  for (const ch of t) {
    if (RTL_RE.test(ch)) return true;
    if (LTR_RE.test(ch)) return false;
  }
  return false;
}

const imageCache = new Map<string, HTMLImageElement>();
let onImageLoad: () => void = () => {};
export const setImageLoadCallback = (fn: () => void) => { onImageLoad = fn; };
function getImage(src: string) {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => onImageLoad();
    img.src = src;
    imageCache.set(src, img);
  }
  return img;
}

export const HANDLE_PAD = 6;
type Box = { x: number; y: number; w: number; h: number };

export function getHandles(el: El): { id: string; x: number; y: number }[] {
  if (el.type === "line" || el.type === "arrow" || el.type === "thickarrow") {
    return [{ id: "p1", x: el.x, y: el.y }, { id: "p2", x: el.x + el.w, y: el.y + el.h }];
  }
  const b = bounds(el), p = HANDLE_PAD;
  const l = b.x - p, r = b.x + b.w + p, t = b.y - p, bt = b.y + b.h + p;
  const mx = b.x + b.w / 2, my = b.y + b.h / 2;
  return [
    { id: "nw", x: l, y: t }, { id: "n", x: mx, y: t }, { id: "ne", x: r, y: t },
    { id: "e", x: r, y: my }, { id: "se", x: r, y: bt }, { id: "s", x: mx, y: bt },
    { id: "sw", x: l, y: bt }, { id: "w", x: l, y: my },
  ];
}

export function resizeElement(orig: El, b0: Box, handle: string, px: number, py: number, lock: boolean): El {
  if (handle === "p1") return { ...orig, x: px, y: py, w: orig.x + orig.w - px, h: orig.y + orig.h - py };
  if (handle === "p2") return { ...orig, w: px - orig.x, h: py - orig.y };
  // Handles sit HANDLE_PAD outside the box; cancel that offset.
  if (handle.includes("n")) py += HANDLE_PAD;
  if (handle.includes("s")) py -= HANDLE_PAD;
  if (handle.includes("w")) px += HANDLE_PAD;
  if (handle.includes("e")) px -= HANDLE_PAD;
  let left = b0.x, right = b0.x + b0.w, top = b0.y, bottom = b0.y + b0.h;
  if (handle.length === 2 && (lock || orig.type === "image") && b0.w > 0 && b0.h > 0) {
    const ax = handle.includes("w") ? right : left;
    const ay = handle.includes("n") ? bottom : top;
    const w = Math.max(4, Math.abs(px - ax));
    const h = (w * b0.h) / b0.w;
    const ex = ax + (px >= ax ? w : -w), ey = ay + (py >= ay ? h : -h);
    left = Math.min(ax, ex); right = Math.max(ax, ex);
    top = Math.min(ay, ey); bottom = Math.max(ay, ey);
  } else {
    if (handle.includes("w")) left = px;
    if (handle.includes("e")) right = px;
    if (handle.includes("n")) top = py;
    if (handle.includes("s")) bottom = py;
  }
  const nb = {
    x: Math.min(left, right), y: Math.min(top, bottom),
    w: Math.max(4, Math.abs(right - left)), h: Math.max(4, Math.abs(bottom - top)),
  };
  if (orig.type === "freedraw") {
    const sx = b0.w ? nb.w / b0.w : 1, sy = b0.h ? nb.h / b0.h : 1;
    return {
      ...orig, x: nb.x, y: nb.y,
      points: orig.points!.map(([a, b]) => [(orig.x + a - b0.x) * sx, (orig.y + b - b0.y) * sy] as [number, number]),
    };
  }
  if (orig.type === "text") {
    const f = handle === "n" || handle === "s" ? nb.h / b0.h : nb.w / b0.w;
    return { ...orig, x: nb.x, y: nb.y, fs: Math.max(6, (orig.fs ?? 20) * f) };
  }
  if (orig.crop) {
    // Scale the full frame so the visible part lands on the new box.
    const sx = nb.w / b0.w, sy = nb.h / b0.h;
    const w = orig.w * sx, h = orig.h * sy;
    return { ...orig, w, h, x: nb.x - orig.crop.l * w, y: nb.y - orig.crop.t * h };
  }
  return { ...orig, x: nb.x, y: nb.y, w: nb.w, h: nb.h };
}

export const canCrop = (el: El) => ["rectangle", "ellipse", "diamond", "image"].includes(el.type);

// Cmd/Ctrl + handle drag: cut away (or restore) parts of the object instead of scaling it.
export function cropElement(orig: El, b0: Box, handle: string, px: number, py: number): El {
  if (!canCrop(orig) || handle.length > 2) return resizeElement(orig, b0, handle, px, py, false);
  const full = { x: Math.min(orig.x, orig.x + orig.w), y: Math.min(orig.y, orig.y + orig.h), w: Math.abs(orig.w), h: Math.abs(orig.h) };
  if (handle.includes("n")) py += HANDLE_PAD;
  if (handle.includes("s")) py -= HANDLE_PAD;
  if (handle.includes("w")) px += HANDLE_PAD;
  if (handle.includes("e")) px -= HANDLE_PAD;
  const MIN = 4;
  let left = b0.x, right = b0.x + b0.w, top = b0.y, bottom = b0.y + b0.h;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  if (handle.includes("w")) left = clamp(px, full.x, right - MIN);
  if (handle.includes("e")) right = clamp(px, left + MIN, full.x + full.w);
  if (handle.includes("n")) top = clamp(py, full.y, bottom - MIN);
  if (handle.includes("s")) bottom = clamp(py, top + MIN, full.y + full.h);
  const crop = {
    l: (left - full.x) / full.w, t: (top - full.y) / full.h,
    r: (right - full.x) / full.w, b: (bottom - full.y) / full.h,
  };
  const none = crop.l <= 0 && crop.t <= 0 && crop.r >= 1 && crop.b >= 1;
  return { ...orig, x: full.x, y: full.y, w: full.w, h: full.h, crop: none ? undefined : crop };
}

export function bounds(el: El) {
  if (el.type === "text") {
    const lines = (el.text || "").split("\n");
    const ctx = measureCtx();
    ctx.font = fontOf(el);
    const w = Math.max(10, ...lines.map((l) => ctx.measureText(l).width));
    return { x: el.x, y: el.y, w, h: lines.length * lineH(el) };
  }
  if (el.type === "freedraw" && el.points) {
    const xs = el.points.map((p) => p[0]);
    const ys = el.points.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    return { x: el.x + minX, y: el.y + minY, w: maxX - minX, h: maxY - minY };
  }
  const x = Math.min(el.x, el.x + el.w);
  const y = Math.min(el.y, el.y + el.h);
  const w = Math.abs(el.w), h = Math.abs(el.h);
  if (el.type === "thickarrow") {
    const t = thick(el);
    return { x: x - t, y: y - t, w: w + t * 2, h: h + t * 2 };
  }
  const c = el.crop;
  if (c) return { x: x + c.l * w, y: y + c.t * h, w: (c.r - c.l) * w, h: (c.b - c.t) * h };
  return { x, y, w, h };
}

let _ctx: CanvasRenderingContext2D | null = null;
function measureCtx() {
  if (!_ctx) _ctx = document.createElement("canvas").getContext("2d")!;
  return _ctx;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function hitTest(el: El, px: number, py: number, tol = 6): boolean {
  if (el.type === "thickarrow") return distToSegment(px, py, el.x, el.y, el.x + el.w, el.y + el.h) <= thick(el) * 0.75 + tol;
  if (el.type === "line" || el.type === "arrow") {
    return distToSegment(px, py, el.x, el.y, el.x + el.w, el.y + el.h) <= tol;
  }
  if (el.type === "freedraw" && el.points) {
    for (let i = 1; i < el.points.length; i++) {
      const a = el.points[i - 1], b = el.points[i];
      if (distToSegment(px, py, el.x + a[0], el.y + a[1], el.x + b[0], el.y + b[1]) <= tol) return true;
    }
    return false;
  }
  const b = bounds(el);
  const inside = px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol;
  if (!inside) return false;
  // Unfilled shapes are only hit near their outline.
  if (el.type !== "text" && el.fill === "transparent") {
    const innerW = b.w - tol * 2, innerH = b.h - tol * 2;
    const deep = px > b.x + tol && px < b.x + tol + innerW && py > b.y + tol && py < b.y + tol + innerH;
    return !deep;
  }
  return true;
}

function drawArrowHead(ctx: CanvasRenderingContext2D, el: El) {
  const x2 = el.x + el.w, y2 = el.y + el.h;
  const ang = Math.atan2(el.h, el.w);
  const len = 12 + el.sw * 3.5;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(ang - Math.PI / 7), y2 - len * Math.sin(ang - Math.PI / 7));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(ang + Math.PI / 7), y2 - len * Math.sin(ang + Math.PI / 7));
  ctx.strokeStyle = el.stroke;
  ctx.lineWidth = el.sw;
  ctx.lineCap = "round";
  ctx.stroke();
}


function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + word : word;
      if (line && ctx.measureText(next).width > maxW) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

function drawDoc(ctx: CanvasRenderingContext2D, el: El) {
  const x = Math.min(el.x, el.x + el.w), y = Math.min(el.y, el.y + el.h);
  const w = Math.abs(el.w), h = Math.abs(el.h), pad = 14;
  const title = el.title || "Untitled doc", body = el.body || "";
  const rtl = isRTL({ dir: "auto", text: title + body });
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 10);
  ctx.shadowColor = "rgba(0,0,0,.2)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#fffdf7";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#d8d2c0";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.clip();
  ctx.fillStyle = "#6965db";
  ctx.fillRect(x, y, w, 6);
  ctx.textBaseline = "top";
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  const tx = rtl ? x + w - pad : x + pad, maxW = w - pad * 2;
  ctx.font = "bold 17px system-ui, sans-serif";
  ctx.fillStyle = "#1b1b1f";
  let t = title;
  while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1);
  ctx.fillText(t === title ? t : t.trimEnd() + "…", tx, y + 20);
  ctx.fillStyle = "#e4dfcf";
  ctx.fillRect(x + pad, y + 46, w - pad * 2, 1);
  ctx.font = "13px system-ui, sans-serif";
  if (!body.trim()) {
    ctx.fillStyle = "#aaa";
    ctx.fillText("Click to write…", tx, y + 58);
  } else {
    ctx.fillStyle = "#555";
    const lines = wrapLines(ctx, body, maxW);
    const max = Math.max(1, Math.floor((h - 62) / 18));
    lines.slice(0, max).forEach((ln, i) => {
      const last = i === max - 1 && lines.length > max;
      ctx.fillText(last ? ln + " …" : ln, tx, y + 58 + i * 18);
    });
  }
  ctx.restore();
}

export function drawElement(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, el: El) {
  const rc = rough.canvas(canvas);
  const opts = {
    stroke: el.stroke,
    strokeWidth: el.sw,
    fill: el.fill === "transparent" ? undefined : el.fill,
    fillStyle: "hachure",
    roughness: 1.2,
    seed: el.seed,
  };
  const c = el.crop;
  if (c) {
    const b = bounds(el), p = el.sw + 2; // keep the stroke on uncut sides
    ctx.save();
    ctx.beginPath();
    const l = c.l <= 0 ? p : 0, t = c.t <= 0 ? p : 0, r = c.r >= 1 ? p : 0, bt = c.b >= 1 ? p : 0;
    ctx.rect(b.x - l, b.y - t, b.w + l + r, b.h + t + bt);
    ctx.clip();
  }
  switch (el.type) {
    case "rectangle":
      rc.rectangle(el.x, el.y, el.w, el.h, opts);
      break;
    case "ellipse":
      rc.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.abs(el.w), Math.abs(el.h), opts);
      break;
    case "diamond": {
      const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
      rc.polygon(
        [[cx, el.y], [el.x + el.w, cy], [cx, el.y + el.h], [el.x, cy]],
        opts,
      );
      break;
    }
    case "line":
    case "arrow":
      rc.line(el.x, el.y, el.x + el.w, el.y + el.h, opts);
      if (el.type === "arrow") drawArrowHead(ctx, el);
      break;
    case "thickarrow": {
      const L = Math.hypot(el.w, el.h);
      if (L < 2) break;
      const ux = el.w / L, uy = el.h / L, nx = -uy, ny = ux;
      const t = thick(el), sh = t / 2;
      const bl = L - Math.min(L * 0.6, t * 1.8); // where the head starts
      const P = (a: number, b: number): [number, number] => [el.x + ux * a + nx * b, el.y + uy * a + ny * b];
      const pts = [P(0, -sh), P(bl, -sh), P(bl, -t), P(L, 0), P(bl, t), P(bl, sh), P(0, sh)];
      ctx.beginPath();
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fillStyle = el.fill === "transparent" ? el.stroke : el.fill;
      ctx.fill();
      ctx.strokeStyle = el.stroke;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
      break;
    }
    case "freedraw":
      if (el.points && el.points.length > 1) {
        ctx.beginPath();
        el.points.forEach(([px, py], i) =>
          i === 0 ? ctx.moveTo(el.x + px, el.y + py) : ctx.lineTo(el.x + px, el.y + py),
        );
        ctx.strokeStyle = el.stroke;
        ctx.lineWidth = el.sw;
        ctx.lineCap = ctx.lineJoin = "round";
        ctx.stroke();
      }
      break;
    case "doc":
      drawDoc(ctx, el);
      break;
    case "image": {
      const img = getImage(el.src!);
      if (img.complete && img.naturalWidth) ctx.drawImage(img, el.x, el.y, el.w, el.h);
      else {
        ctx.strokeStyle = "#999";
        ctx.strokeRect(el.x, el.y, el.w, el.h);
      }
      break;
    }
    case "text":
      ctx.font = fontOf(el);
      ctx.fillStyle = el.stroke;
      ctx.textBaseline = "top";
      if (isRTL(el)) {
        ctx.direction = "rtl";
        ctx.textAlign = "right";
        const right = el.x + bounds(el).w;
        (el.text || "").split("\n").forEach((line, i) => ctx.fillText(line, right, el.y + i * lineH(el) + 2));
        ctx.direction = "ltr";
        ctx.textAlign = "left";
      } else {
        (el.text || "").split("\n").forEach((line, i) => ctx.fillText(line, el.x, el.y + i * lineH(el) + 2));
      }
      break;
  }
  if (c) ctx.restore();
}

export function renderScene(
  canvas: HTMLCanvasElement,
  elements: El[],
  view: View,
  selected: Set<string>,
  dark: boolean,
  hideId?: string | null,
) {
  const ctx = canvas.getContext("2d")!;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = dark ? "#121212" : "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, -view.x * view.zoom * dpr, -view.y * view.zoom * dpr);
  for (const el of elements) {
    if (el.id === hideId) continue;
    drawElement(canvas, ctx, el);
  }
  ctx.save();
  ctx.strokeStyle = "#6965db";
  ctx.lineWidth = 1.5 / view.zoom;
  ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
  for (const el of elements) {
    if (!selected.has(el.id)) continue;
    const b = bounds(el);
    ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
  }
  ctx.setLineDash([]);
  if (selected.size === 1) {
    const el = elements.find((x) => selected.has(x.id));
    if (el) {
      const s = 8 / view.zoom;
      for (const h of getHandles(el)) {
        ctx.fillStyle = dark ? "#121212" : "#ffffff";
        ctx.fillRect(h.x - s / 2, h.y - s / 2, s, s);
        ctx.strokeRect(h.x - s / 2, h.y - s / 2, s, s);
      }
    }
  }
  ctx.restore();
}

export function exportPNG(elements: El[], dark: boolean): string | null {
  if (!elements.length) return null;
  const bs = elements.map(bounds);
  const pad = 30;
  const minX = Math.min(...bs.map((b) => b.x)) - pad;
  const minY = Math.min(...bs.map((b) => b.y)) - pad;
  const maxX = Math.max(...bs.map((b) => b.x + b.w)) + pad;
  const maxY = Math.max(...bs.map((b) => b.y + b.h)) + pad;
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = (maxX - minX) * scale;
  canvas.height = (maxY - minY) * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = dark ? "#121212" : "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
  elements.forEach((el) => drawElement(canvas, ctx, el));
  return canvas.toDataURL("image/png");
}
