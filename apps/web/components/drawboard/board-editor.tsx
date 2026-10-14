"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveBoardElements, renameBoard, setBoardClient } from "@/lib/actions/boards";
import KeybindsDialog from "./keybinds-dialog";
import { loadKeybinds, normKey, saveKeybinds, type Keybinds } from "./keybinds";
import { bounds, exportPNG, cropElement, getHandles, hitTest, isRTL, renderScene, resizeElement, setImageLoadCallback } from "./render";
import { shrinkDataUrl, shrinkImages } from "./image-utils";
import { TOOLS, uid, type El, type TextDir, type ToolId, type View } from "./types";

const STROKES = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#ffffff"];
const FILLS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99", "#d0bfff"];
const WIDTHS = [1, 2, 4, 7, 11];
const SAVE_DEBOUNCE_MS = 1000;

interface Editing { id: string | null; x: number; y: number; w: number; value: string; fs: number; dir: TextDir }
type SaveState = "saved" | "saving" | "error";

export interface BoardEditorProps {
  boardId: string;
  initialName: string;
  initialClientId: string | null;
  initialElements: El[];
  clients: { id: string; name: string }[];
  /** Open straight into presentation mode (the client tab's "Present" button). */
  autoPresent?: boolean;
  backHref: string;
}

export default function BoardEditor({ boardId, initialName, initialClientId, initialElements, clients, autoPresent, backHref }: BoardEditorProps) {
  const [name, setName] = useState(initialName);
  const [clientId, setClientId] = useState<string | null>(initialClientId);
  const [elements, setElements] = useState<El[]>(initialElements);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<ToolId>("select");
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [stroke, setStroke] = useState(STROKES[0]);
  const [fill, setFill] = useState("transparent");
  const [sw, setSw] = useState(2);
  const [textDir, setTextDir] = useState<TextDir>("auto");
  const [keybinds, setKeybinds] = useState<Keybinds>(loadKeybinds);
  const [showKeys, setShowKeys] = useState(false);
  const [dark, setDark] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [, force] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [present, setPresent] = useState(false);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const docBefore = useRef<El[] | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const elsRef = useRef(elements);
  elsRef.current = elements;
  const undo = useRef<El[][]>([]);
  const redo = useRef<El[][]>([]);
  const drag = useRef<null | {
    kind: "draw" | "move" | "pan" | "erase" | "box" | "resize";
    sx: number; sy: number; before: El[]; id?: string;
    orig?: Map<string, { x: number; y: number }>; vx?: number; vy?: number;
    handle?: string; origEl?: El; b0?: { x: number; y: number; w: number; h: number };
    cx?: number; cy?: number; docId?: string;
  }>(null);
  const spaceDown = useRef(false);

  const commit = useCallback((next: El[], before: El[]) => {
    undo.current.push(before);
    if (undo.current.length > 200) undo.current.shift();
    redo.current = [];
    setElements(next);
  }, []);

  const doUndo = () => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(elsRef.current);
    setElements(prev);
    setSelected(new Set());
  };
  const doRedo = () => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(elsRef.current);
    setElements(next);
    setSelected(new Set());
  };

  // ---- persistence ----
  // Saves are serialised: while one is in flight a newer edit just marks the
  // board dirty again and is picked up by the loop, so a slow save can never
  // overwrite a newer one that finished first.
  const savedRef = useRef<El[]>(initialElements);
  const inFlight = useRef(false);
  const flushSave = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      while (savedRef.current !== elsRef.current) {
        const snapshot = elsRef.current;
        setSaveState("saving");
        const res = await saveBoardElements(boardId, snapshot).catch(() => ({ ok: false }));
        if (!res.ok) { setSaveState("error"); return; }
        savedRef.current = snapshot;
      }
      setSaveState("saved");
    } finally {
      inFlight.current = false;
    }
  }, [boardId]);

  useEffect(() => {
    if (elements === savedRef.current) return;
    const t = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [elements, flushSave]);

  // Flush on leaving the page (SPA navigation) and warn on a hard close while dirty.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (savedRef.current !== elsRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (savedRef.current !== elsRef.current) void flushSave();
    };
  }, [flushSave]);

  useEffect(() => saveKeybinds(keybinds), [keybinds]);

  const commitName = () => {
    const next = name.trim();
    if (!next) return setName(initialName);
    void renameBoard(boardId, next);
  };
  const changeClient = (value: string) => {
    const next = value || null;
    setClientId(next);
    void setBoardClient(boardId, next);
  };

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify({ name, elements }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.drawboard.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJSON = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.elements)) throw new Error("bad file");
        if (!confirm("Replace this board's content with the imported file? (Undo works.)")) return;
        commit(await shrinkImages(data.elements as El[]), elsRef.current);
        setSelected(new Set());
      } catch {
        alert("Couldn't read that file.");
      }
    };
    input.click();
  };

  const downloadPNG = () => {
    const url = exportPNG(elements, dark);
    if (!url) return alert("Nothing to export yet.");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "drawing"}.png`;
    a.click();
  };

  // ---- coordinates ----
  const toWorld = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / view.zoom + view.x, y: (e.clientY - r.top) / view.zoom + view.y };
  };

  // ---- rendering ----
  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      force((n) => n + 1);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    renderScene(canvasRef.current!, elements, view, present ? new Set() : selected, dark, editing?.id);
  });

  // ---- keyboard ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || showKeys) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = normKey(e);
      if (mod && key === "enter") { e.preventDefault(); return present ? exitPresent() : enterPresent(); }
      if (present) { if (key === "escape") exitPresent(); return; }
      if (mod && key === "z") { e.preventDefault(); return e.shiftKey ? doRedo() : doUndo(); }
      if (mod && key === "y") { e.preventDefault(); return doRedo(); }
      if (mod && key === "a") { e.preventDefault(); return setSelected(new Set(elsRef.current.map((x) => x.id))); }
      if (mod && key === "d") {
        e.preventDefault();
        const copies = elsRef.current
          .filter((x) => selected.has(x.id))
          .map((x) => ({ ...x, id: uid(), x: x.x + 20, y: x.y + 20, seed: Math.floor(Math.random() * 1e6) }));
        if (copies.length) {
          commit([...elsRef.current, ...copies], elsRef.current);
          setSelected(new Set(copies.map((c) => c.id)));
        }
        return;
      }
      if (mod || e.altKey) return;
      if (key === " ") { spaceDown.current = true; e.preventDefault(); return; }
      if (key === "delete" || key === "backspace") {
        if (selected.size) {
          commit(elsRef.current.filter((x) => !selected.has(x.id)), elsRef.current);
          setSelected(new Set());
        }
        return;
      }
      if (key === "escape") { setSelected(new Set()); return setTool("select"); }
      const match = TOOLS.find((tl) => keybinds[tl.id] && keybinds[tl.id] === key);
      if (match) chooseTool(match.id);
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === " ") spaceDown.current = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  // ---- pointer ----
  const topHit = (x: number, y: number) => {
    const els = elsRef.current;
    for (let i = els.length - 1; i >= 0; i--) if (hitTest(els[i], x, y, 6 / view.zoom)) return els[i];
    return null;
  };

  const finishText = () => {
    if (!editing) return;
    const value = editing.value;
    const before = elsRef.current;
    if (editing.id) {
      const next = value.trim()
        ? before.map((el) => (el.id === editing.id ? { ...el, text: value, dir: editing.dir } : el))
        : before.filter((el) => el.id !== editing.id);
      commit(next, before);
    } else if (value.trim()) {
      commit(
        [...before, { id: uid(), type: "text", x: editing.x, y: editing.y, w: 0, h: 0, text: value, stroke, fill: "transparent", sw, seed: 1, fs: 20, dir: editing.dir }],
        before,
      );
    }
    setEditing(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (editing) { finishText(); return; }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toWorld(e);
    const before = elsRef.current;

    if (present) {
      const hit = topHit(p.x, p.y);
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, before, vx: view.x, vy: view.y, docId: hit?.type === "doc" ? hit.id : undefined };
      return;
    }
    if (tool === "doc") {
      const w = 240, h = 160;
      const el: El = { id: uid(), type: "doc", x: p.x - w / 2, y: p.y - h / 2, w, h, title: "Untitled doc", body: "", stroke, fill: "#fffdf7", sw: 1, seed: 1 };
      commit([...before, el], before);
      setSelected(new Set([el.id]));
      setTool("select");
      docBefore.current = elsRef.current;
      setOpenDoc(el.id);
      e.preventDefault();
      return;
    }

    if (tool === "hand" || spaceDown.current || e.button === 1) {
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, before, vx: view.x, vy: view.y };
      return;
    }
    if (tool === "text") {
      setEditing({ id: null, x: p.x, y: p.y, w: 0, value: "", fs: 20, dir: textDir });
      e.preventDefault();
      return;
    }
    if (tool === "eraser") {
      drag.current = { kind: "erase", sx: p.x, sy: p.y, before };
      const hit = topHit(p.x, p.y);
      if (hit) setElements(before.filter((x) => x.id !== hit.id));
      return;
    }
    if (tool === "select") {
      if (selected.size === 1) {
        const sel = before.find((x) => selected.has(x.id));
        const tol = 8 / view.zoom;
        const h = sel && getHandles(sel).find((hd) => Math.abs(hd.x - p.x) <= tol && Math.abs(hd.y - p.y) <= tol);
        if (sel && h) {
          drag.current = { kind: "resize", sx: p.x, sy: p.y, before, id: sel.id, handle: h.id, origEl: sel, b0: bounds(sel) };
          return;
        }
      }
      const hit = topHit(p.x, p.y);
      if (hit) {
        const sel = selected.has(hit.id) ? selected : new Set([hit.id]);
        setSelected(sel);
        const orig = new Map<string, { x: number; y: number }>();
        before.forEach((el) => sel.has(el.id) && orig.set(el.id, { x: el.x, y: el.y }));
        drag.current = { kind: "move", sx: p.x, sy: p.y, before, orig, docId: hit.type === "doc" ? hit.id : undefined, cx: e.clientX, cy: e.clientY };
      } else {
        setSelected(new Set());
        drag.current = { kind: "box", sx: p.x, sy: p.y, before };
      }
      return;
    }
    const el: El = {
      id: uid(), type: tool, x: p.x, y: p.y, w: 0, h: 0, stroke, fill, sw: tool === "thickarrow" ? Math.max(sw, 7) : sw,
      seed: Math.floor(Math.random() * 1e6),
      points: tool === "freedraw" ? [[0, 0]] : undefined,
    };
    drag.current = { kind: "draw", sx: p.x, sy: p.y, before, id: el.id };
    setElements([...before, el]);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      setView((v) => ({
        ...v,
        x: d.vx! - (e.clientX - d.sx) / v.zoom,
        y: d.vy! - (e.clientY - d.sy) / v.zoom,
      }));
      return;
    }
    const p = toWorld(e);
    if (d.kind === "resize") {
      setElements(d.before.map((el) => (el.id === d.id ? (e.metaKey || e.ctrlKey ? cropElement(d.origEl!, d.b0!, d.handle!, p.x, p.y) : resizeElement(d.origEl!, d.b0!, d.handle!, p.x, p.y, e.shiftKey)) : el)));
    } else if (d.kind === "erase") {
      const hit = topHit(p.x, p.y);
      if (hit) setElements(elsRef.current.filter((x) => x.id !== hit.id));
    } else if (d.kind === "move") {
      const dx = p.x - d.sx, dy = p.y - d.sy;
      setElements(d.before.map((el) => {
        const o = d.orig!.get(el.id);
        return o ? { ...el, x: o.x + dx, y: o.y + dy } : el;
      }));
    } else if (d.kind === "box") {
      const x1 = Math.min(d.sx, p.x), x2 = Math.max(d.sx, p.x);
      const y1 = Math.min(d.sy, p.y), y2 = Math.max(d.sy, p.y);
      setSelected(new Set(d.before.filter((el) => {
        const b = bounds(el);
        return b.x >= x1 && b.y >= y1 && b.x + b.w <= x2 && b.y + b.h <= y2;
      }).map((el) => el.id)));
    } else if (d.kind === "draw") {
      setElements(d.before.concat(
        elsRef.current.filter((el) => el.id === d.id).map((el) => {
          if (el.type === "freedraw") return { ...el, points: [...el.points!, [p.x - el.x, p.y - el.y] as [number, number]] };
          let w = p.x - el.x, h = p.y - el.y;
          if (e.shiftKey && el.type !== "line" && el.type !== "arrow" && el.type !== "thickarrow") {
            const m = Math.max(Math.abs(w), Math.abs(h));
            w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m;
          }
          return { ...el, w, h };
        }),
      ));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // A click (no real drag) on a doc card opens it.
    if (d.docId && (d.kind === "move" || d.kind === "pan")) {
      const moved = d.kind === "move" ? Math.hypot(e.clientX - d.cx!, e.clientY - d.cy!) : Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
      if (moved < 4) {
        if (d.kind === "move") setElements(d.before);
        return openDocById(d.docId);
      }
    }
    const cur = elsRef.current;
    if (d.kind === "draw") {
      const el = cur.find((x) => x.id === d.id);
      const tiny = el && el.type !== "freedraw" && Math.abs(el.w) < 3 && Math.abs(el.h) < 3;
      if (!el || tiny) return setElements(d.before);
      undo.current.push(d.before);
      redo.current = [];
      setSelected(new Set([el.id]));
      setTool("select");
    } else if (d.kind === "move" || d.kind === "erase" || d.kind === "resize") {
      if (cur !== d.before) { undo.current.push(d.before); redo.current = []; }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (present) return;
    const p = toWorld(e);
    const hit = topHit(p.x, p.y);
    if (hit?.type === "text") {
      setEditing({ id: hit.id, x: hit.x, y: hit.y, w: hit.w, value: hit.text || "", fs: hit.fs ?? 20, dir: hit.dir ?? "auto" });
    }
  };

  // Native wheel listener: React's onWheel is passive, so it can't stop the browser zooming the page.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = canvas.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        setView((v) => {
          const zoom = Math.min(8, Math.max(0.02, v.zoom * Math.exp(-e.deltaY * 0.01)));
          const wx = mx / v.zoom + v.x, wy = my / v.zoom + v.y;
          return { zoom, x: wx - mx / zoom, y: wy - my / zoom };
        });
      } else {
        setView((v) => ({ ...v, x: v.x + e.deltaX / v.zoom, y: v.y + e.deltaY / v.zoom }));
      }
    };
    // Block pinch/ctrl+wheel page zoom everywhere (toolbars, sidebar), and Safari pinch gestures.
    const blockPageZoom = (e: WheelEvent) => { if (e.ctrlKey) e.preventDefault(); };
    const blockGesture = (e: Event) => e.preventDefault();
    canvas.addEventListener("wheel", onWheelNative, { passive: false });
    document.addEventListener("wheel", blockPageZoom, { passive: false });
    document.addEventListener("gesturestart", blockGesture);
    document.addEventListener("gesturechange", blockGesture);
    return () => {
      canvas.removeEventListener("wheel", onWheelNative);
      document.removeEventListener("wheel", blockPageZoom);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
    };
  }, []);

  // ---- images ----
  useEffect(() => setImageLoadCallback(() => force((n) => n + 1)), []);

  const addImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const nw = img.naturalWidth || 300, nh = img.naturalHeight || 300;
        const k = Math.min(1, 1000 / Math.max(nw, nh));
        const c = document.createElement("canvas");
        c.width = Math.round(nw * k);
        c.height = Math.round(nh * k);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        const src = await shrinkDataUrl(c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.85));
        const w = Math.min(400, c.width), h = (w * c.height) / c.width;
        const v = viewRef.current, cv = canvasRef.current!;
        const el: El = {
          id: uid(), type: "image", src, w, h, stroke, fill: "#ffffff", sw: 1, seed: 1,
          x: v.x + cv.clientWidth / v.zoom / 2 - w / 2,
          y: v.y + cv.clientHeight / v.zoom / 2 - h / 2,
        };
        commit([...elsRef.current, el], elsRef.current);
        setSelected(new Set([el.id]));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const pickImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => Array.from(input.files ?? []).forEach(addImage);
    input.click();
  };

  const chooseTool = (id: ToolId) => {
    setSelected(new Set());
    if (id === "image") { setTool("select"); pickImage(); } else setTool(id);
  };

  // ---- copy / cut / paste of board elements ----
  // Elements travel through the system clipboard as tagged JSON, so they paste
  // across boards and tabs, and plain text / images pasted from elsewhere still work.
  const CLIP_TAG = "drawboard/elements:";
  const pasteCount = useRef(0);
  const clipHandlers = useRef<{ copy: (e: ClipboardEvent, cut: boolean) => void; paste: (e: ClipboardEvent) => void }>();
  clipHandlers.current = {
    copy: (e, cut) => {
      const sel = elsRef.current.filter((el) => selected.has(el.id));
      if (!sel.length || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", CLIP_TAG + JSON.stringify(sel));
      pasteCount.current = 0;
      if (cut) {
        commit(elsRef.current.filter((el) => !selected.has(el.id)), elsRef.current);
        setSelected(new Set());
      }
    },
    paste: (e) => {
      if (present) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) { e.preventDefault(); files.forEach(addImage); return; }
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;
      e.preventDefault();
      const cv = canvasRef.current!, v = viewRef.current;
      const vw = cv.clientWidth / v.zoom, vh = cv.clientHeight / v.zoom;
      let made: El[];
      if (text.startsWith(CLIP_TAG)) {
        let src: El[];
        try { src = JSON.parse(text.slice(CLIP_TAG.length)); } catch { return; }
        if (!Array.isArray(src) || !src.length) return;
        // Each paste lands 20px further down-right, so repeated pastes cascade.
        pasteCount.current += 1;
        const off = 20 * pasteCount.current;
        const bs = src.map(bounds);
        const gx = Math.min(...bs.map((b) => b.x)) + off, gy = Math.min(...bs.map((b) => b.y)) + off;
        const gw = Math.max(...bs.map((b) => b.x + b.w)) - Math.min(...bs.map((b) => b.x));
        const gh = Math.max(...bs.map((b) => b.y + b.h)) - Math.min(...bs.map((b) => b.y));
        const visible = gx < v.x + vw && gx + gw > v.x && gy < v.y + vh && gy + gh > v.y;
        // If the copied group is off-screen (other board, panned away), drop it in view.
        const dx = visible ? off : v.x + vw / 2 - gw / 2 - (gx - off);
        const dy = visible ? off : v.y + vh / 2 - gh / 2 - (gy - off);
        made = src.map((el) => ({ ...el, id: uid(), x: el.x + dx, y: el.y + dy, seed: Math.floor(Math.random() * 1e6) }));
      } else {
        const clean = text.replace(/\r\n?/g, "\n").slice(0, 5000);
        made = [{ id: uid(), type: "text", x: v.x + vw / 2 - 100, y: v.y + vh / 2 - 20, w: 0, h: 0, text: clean, stroke, fill: "transparent", sw, seed: 1, fs: 20, dir: textDir }];
      }
      commit([...elsRef.current, ...made], elsRef.current);
      setSelected(new Set(made.map((m) => m.id)));
    },
  };

  useEffect(() => {
    const editable = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const onPaste = (e: ClipboardEvent) => { if (!editable(e.target)) clipHandlers.current!.paste(e); };
    const onCopy = (e: ClipboardEvent) => { if (!editable(e.target)) clipHandlers.current!.copy(e, false); };
    const onCut = (e: ClipboardEvent) => { if (!editable(e.target)) clipHandlers.current!.copy(e, true); };
    window.addEventListener("paste", onPaste);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCut);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCut);
    };
  }, []);

  // Apply style changes to selected elements.
  const applyStyle = (patch: Partial<El>) => {
    if (!selected.size) return;
    commit(elsRef.current.map((el) => (selected.has(el.id) ? { ...el, ...patch } : el)), elsRef.current);
  };

  const scaleSelected = (factor: number) => {
    if (!selected.size) return;
    const sel = elsRef.current.filter((el) => selected.has(el.id));
    const bs = sel.map(bounds);
    const cx = (Math.min(...bs.map((b) => b.x)) + Math.max(...bs.map((b) => b.x + b.w))) / 2;
    const cy = (Math.min(...bs.map((b) => b.y)) + Math.max(...bs.map((b) => b.y + b.h))) / 2;
    commit(
      elsRef.current.map((el) => {
        if (!selected.has(el.id)) return el;
        const n = { ...el, x: cx + (el.x - cx) * factor, y: cy + (el.y - cy) * factor };
        if (el.type !== "text" && el.type !== "image") n.sw = Math.max(1, el.sw * factor); // arrowheads grow with width
        if (el.type === "text") { n.fs = Math.max(6, (el.fs ?? 20) * factor); if (el.w > 0) n.w = el.w * factor; }
        else if (el.type === "freedraw") n.points = el.points!.map(([px, py]) => [px * factor, py * factor]);
        else { n.w = el.w * factor; n.h = el.h * factor; }
        return n;
      }),
      elsRef.current,
    );
  };

  const zoomBy = (factor: number) =>
    setView((v) => {
      const c = canvasRef.current!;
      const mx = c.clientWidth / 2, my = c.clientHeight / 2;
      const zoom = Math.min(8, Math.max(0.02, v.zoom * factor));
      const wx = mx / v.zoom + v.x, wy = my / v.zoom + v.y;
      return { zoom, x: wx - mx / zoom, y: wy - my / zoom };
    });

  const fitAll = () => {
    const c = canvasRef.current!;
    if (!elements.length) return setView({ x: 0, y: 0, zoom: 1 });
    const bs = elements.map(bounds);
    const minX = Math.min(...bs.map((b) => b.x)), minY = Math.min(...bs.map((b) => b.y));
    const maxX = Math.max(...bs.map((b) => b.x + b.w)), maxY = Math.max(...bs.map((b) => b.y + b.h));
    const zoom = Math.min(2, Math.max(0.02, Math.min(c.clientWidth / (maxX - minX + 160), c.clientHeight / (maxY - minY + 160))));
    setView({
      zoom,
      x: (minX + maxX) / 2 - c.clientWidth / zoom / 2,
      y: (minY + maxY) / 2 - c.clientHeight / zoom / 2,
    });
  };

  const setDir = (d: TextDir) => {
    setTextDir(d);
    if (editing) setEditing({ ...editing, dir: d });
    if (selected.size) {
      commit(
        elsRef.current.map((el) => (selected.has(el.id) && el.type === "text" ? { ...el, dir: d } : el)),
        elsRef.current,
      );
    }
  };

  // ---- docs ----
  const openDocById = (id: string) => {
    docBefore.current = elsRef.current;
    setEditing(null);
    setOpenDoc(id);
  };
  const closeDoc = () => {
    const before = docBefore.current;
    if (before && before !== elsRef.current) { undo.current.push(before); redo.current = []; }
    docBefore.current = null;
    setOpenDoc(null);
  };
  const patchDoc = (id: string, patch: Partial<El>) =>
    setElements(elsRef.current.map((el) => (el.id === id ? { ...el, ...patch } : el)));

  const enterPresent = () => {
    finishText();
    setSelected(new Set());
    setPresent(true);
    rootRef.current?.requestFullscreen?.().catch(() => {});
    setTimeout(fitAll, 150);
  };
  const exitPresent = () => {
    setPresent(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  useEffect(() => {
    if (autoPresent) setTimeout(enterPresent, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setPresent(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const cursor = present ? "grab" : tool === "hand" ? "grab" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";

  return (
    <div ref={rootRef} className={"drawboard" + (dark ? " dark" : "") + (present ? " present" : "")}>
      {sidebar && (
        <aside className="sidebar">
          <div className="side-head">
            <Link href={backHref} className="back-link">← Back</Link>
            <span className={"save-state " + saveState}>
              {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}
            </span>
          </div>
          <div className="side-body">
            <label>Board name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
            <label>Client</label>
            <select value={clientId ?? ""} onChange={(e) => changeClient(e.target.value)}>
              <option value="">No client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="side-foot">
            <button onClick={enterPresent}>▶ Present</button>
            <button onClick={importJSON}>Import JSON</button>
            <button onClick={downloadJSON}>Export JSON</button>
            <button onClick={downloadPNG}>Export PNG</button>
          </div>
        </aside>
      )}

      <main
        className="stage"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
          if (dropped.length) { e.preventDefault(); dropped.forEach(addImage); }
        }}
      >
        {saveState === "error" && (
          <div className="banner">
            Couldn't save to the server (very large images?). Export JSON to keep your work, then retry by editing again.
          </div>
        )}
        <div className="toolbar">
          <button className="plain" onClick={() => setSidebar((s) => !s)} title="Toggle files">☰</button>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? "tool on" : "tool"}
              onClick={() => chooseTool(t.id)}
              title={`${t.label}${keybinds[t.id] ? ` (${keybinds[t.id].toUpperCase()})` : ""}`}
            >
              <span className="icon">{t.icon}</span>
              {keybinds[t.id] && <sub>{keybinds[t.id].toUpperCase()}</sub>}
            </button>
          ))}
          <span className="sep" />
          <button className="plain" onClick={doUndo} title="Undo (Ctrl+Z)">↶</button>
          <button className="plain" onClick={doRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
          <span className="sep" />
          <button className="plain" onClick={enterPresent} title="Present (Ctrl/⌘+Enter)">▶</button>
          <button className="plain" onClick={() => setShowKeys(true)} title="Keyboard shortcuts">⌨</button>
          <button className="plain" onClick={() => setDark((d) => !d)} title="Dark mode">{dark ? "☀" : "☾"}</button>
        </div>

        <div className="props">
          <div className="title">{name}</div>
          <label>Stroke</label>
          <div className="swatches">
            {STROKES.map((c) => (
              <button key={c} className={"sw" + (c === stroke ? " on" : "")} style={{ background: c }}
                onClick={() => { setStroke(c); applyStyle({ stroke: c }); }} />
            ))}
          </div>
          <label>Fill</label>
          <div className="swatches">
            {FILLS.map((c) => (
              <button key={c} className={"sw" + (c === fill ? " on" : "") + (c === "transparent" ? " none" : "")}
                style={{ background: c === "transparent" ? undefined : c }}
                onClick={() => { setFill(c); applyStyle({ fill: c }); }} />
            ))}
          </div>
          <label>Text direction</label>
          <div className="seg">
            {(["auto", "ltr", "rtl"] as TextDir[]).map((d) => (
              <button key={d} className={d === textDir ? "on" : ""} onClick={() => setDir(d)}>
                {d === "auto" ? "Auto" : d.toUpperCase()}
              </button>
            ))}
          </div>
          <label>Width</label>
          <div className="swatches">
            {WIDTHS.map((w) => (
              <button key={w} className={"wd" + (w === sw ? " on" : "")}
                onClick={() => { setSw(w); applyStyle({ sw: w }); }}>
                <i style={{ height: w + 1 }} />
              </button>
            ))}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
        />

        {editing && (
          <textarea
            className="text-edit"
            autoFocus
            dir={editing.dir === "auto" ? "auto" : editing.dir}
            value={editing.value}
            style={{
              left: (editing.x - view.x) * view.zoom,
              top: (editing.y - view.y) * view.zoom,
              fontSize: editing.fs * view.zoom,
              ...(editing.w > 0 ? { width: editing.w * view.zoom } : {}),
              lineHeight: `${editing.fs * 1.3 * view.zoom}px`,
              color: stroke,
              textAlign: isRTL({ dir: editing.dir, text: editing.value }) ? "right" : "left",
            }}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onBlur={finishText}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") finishText();
            }}
          />
        )}

        {openDoc && (() => {
          const doc = elements.find((x) => x.id === openDoc);
          if (!doc) return null;
          return (
            <div className="doc-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) closeDoc(); }}>
              <div className="doc-panel">
                <div className="doc-head">
                  <input
                    className="doc-title"
                    dir="auto"
                    value={doc.title ?? ""}
                    placeholder="Untitled doc"
                    onChange={(e) => patchDoc(doc.id, { title: e.target.value })}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") closeDoc(); }}
                  />
                  <button onClick={closeDoc} title="Close (Esc)">✕</button>
                </div>
                <textarea
                  className="doc-body"
                  dir="auto"
                  autoFocus
                  value={doc.body ?? ""}
                  placeholder="Start writing…"
                  onChange={(e) => patchDoc(doc.id, { body: e.target.value })}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") closeDoc(); }}
                />
              </div>
            </div>
          );
        })()}

        <div className="bottombar">
          <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out">−</button>
          <button className="zl" onClick={() => setView((v) => ({ ...v, zoom: 1 }))} title="Reset zoom">
            {Math.round(view.zoom * 100)}%
          </button>
          <button onClick={() => zoomBy(1.2)} title="Zoom in">＋</button>
          <button onClick={fitAll} title="Fit all content">⤢ Fit</button>
          <span className="sep" />
          <button disabled={!selected.size} onClick={() => scaleSelected(1 / 1.15)} title="Make selected smaller">
            Smaller
          </button>
          <button disabled={!selected.size} onClick={() => scaleSelected(1.15)} title="Make selected bigger">
            Bigger
          </button>
        </div>

        <div className="sidebtns">
          <button disabled={!selected.size} onClick={() => scaleSelected(1.15)} title="Bigger">⊕</button>
          <button disabled={!selected.size} onClick={() => scaleSelected(1 / 1.15)} title="Smaller">⊖</button>
          <button
            disabled={!selected.size}
            title="Delete selected"
            onClick={() => {
              commit(elsRef.current.filter((x) => !selected.has(x.id)), elsRef.current);
              setSelected(new Set());
            }}
          >
            🗑
          </button>
        </div>

        {present && (
          <button className="exit-present" onClick={exitPresent} title="Exit presentation (Esc)">
            ✕ Exit
          </button>
        )}

        <div className="hint">
          Scroll to pan · Ctrl/⌘ + scroll to zoom · Hold Space to drag · Double-click text to edit · Click a doc to open it · Hold ⌘/Ctrl while dragging a handle to crop
        </div>
      </main>

      {showKeys && <KeybindsDialog keybinds={keybinds} onChange={setKeybinds} onClose={() => setShowKeys(false)} />}
    </div>
  );
}
