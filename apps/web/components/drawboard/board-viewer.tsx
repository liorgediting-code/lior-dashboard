"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyze, isStage } from "./funnel-math";
import { FunnelSummary, StagePanel } from "./funnel-panels";
import { bounds, hitTest, renderScene, setImageLoadCallback } from "./render";
import type { El, View } from "./types";

const noop = () => {};

/**
 * Read-only board for the client portal. Same canvas renderer and funnel
 * panels as the editor, but nothing here mutates the elements or calls a
 * server action: the client can pan, zoom and open doc / stage cards.
 */
export default function BoardViewer({ name, elements }: { name: string; elements: El[] }) {
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(true);
  const [, force] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<null | { sx: number; sy: number; vx: number; vy: number }>(null);

  const analysis = useMemo(() => analyze(elements), [elements]);
  const stageEls = useMemo(() => elements.filter(isStage), [elements]);

  const fitAll = () => {
    const c = canvasRef.current;
    if (!c) return;
    if (!elements.length) return setView({ x: 0, y: 0, zoom: 1 });
    const bs = elements.map(bounds);
    const minX = Math.min(...bs.map((b) => b.x)), minY = Math.min(...bs.map((b) => b.y));
    const maxX = Math.max(...bs.map((b) => b.x + b.w)), maxY = Math.max(...bs.map((b) => b.y + b.h));
    // Leave room on the right for the summary panel when it is showing.
    const usableW = c.clientWidth - (stageEls.length > 0 && showSummary && c.clientWidth > 700 ? 340 : 0);
    const zoom = Math.min(2, Math.max(0.02, Math.min(usableW / (maxX - minX + 160), c.clientHeight / (maxY - minY + 160))));
    setView({ zoom, x: (minX + maxX) / 2 - usableW / zoom / 2, y: (minY + maxY) / 2 - c.clientHeight / zoom / 2 });
  };

  const zoomBy = (factor: number) =>
    setView((v) => {
      const c = canvasRef.current!;
      const mx = c.clientWidth / 2, my = c.clientHeight / 2;
      const zoom = Math.min(8, Math.max(0.02, v.zoom * factor));
      const wx = mx / v.zoom + v.x, wy = my / v.zoom + v.y;
      return { zoom, x: wx - mx / zoom, y: wy - my / zoom };
    });

  const focusStage = (id: string) => {
    const el = elements.find((x) => x.id === id);
    const c = canvasRef.current;
    if (!el || !c) return;
    setView((v) => ({ ...v, x: el.x + el.w / 2 - c.clientWidth / v.zoom / 2, y: el.y + el.h / 2 - c.clientHeight / v.zoom / 2 }));
  };

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
    setTimeout(fitAll, 50);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    renderScene(canvasRef.current!, elements, view, new Set(), false, null);
  });
  useEffect(() => setImageLoadCallback(() => force((n) => n + 1)), []);

  // Native wheel listener: React's onWheel is passive and can't stop the browser zooming the page.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
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
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.vx - (e.clientX - d.sx) / v.zoom, y: d.vy - (e.clientY - d.sy) / v.zoom }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= 4) return;
    // A click, not a drag: open the doc / stage card under the pointer.
    const r = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - r.left) / view.zoom + view.x, y = (e.clientY - r.top) / view.zoom + view.y;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (hitTest(el, x, y, 6 / view.zoom)) {
        if (el.type === "doc" || el.type === "funnel") setOpenId(el.id);
        return;
      }
    }
  };

  const open = openId ? elements.find((x) => x.id === openId) : null;

  return (
    <div className="drawboard viewer">
      <main className="stage">
        <div className="viewer-title" dir="auto">{name}</div>
        <canvas
          ref={canvasRef}
          style={{ cursor: "grab", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />

        {open?.type === "doc" && (
          <div className="doc-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) setOpenId(null); }}>
            <div className="doc-panel">
              <div className="doc-head">
                <input className="doc-title" dir="auto" readOnly value={open.title ?? ""} />
                <button onClick={() => setOpenId(null)} title="Close">✕</button>
              </div>
              <textarea className="doc-body" dir="auto" readOnly value={open.body ?? ""} />
            </div>
          </div>
        )}
        {open?.stage && <StagePanel el={open} readOnly onPatch={noop} onAddNext={noop} onClose={() => setOpenId(null)} />}

        {stageEls.length > 0 && showSummary && (
          <FunnelSummary analysis={analysis} stages={stageEls} readOnly onFormulas={noop} onFocus={focusStage} onAdd={noop} onClose={() => setShowSummary(false)} />
        )}

        <div className="bottombar">
          <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out">−</button>
          <button className="zl" onClick={() => setView((v) => ({ ...v, zoom: 1 }))} title="Reset zoom">{Math.round(view.zoom * 100)}%</button>
          <button onClick={() => zoomBy(1.2)} title="Zoom in">＋</button>
          <button onClick={fitAll} title="Fit all content">⤢ Fit</button>
          {stageEls.length > 0 && (
            <button className={showSummary ? "on" : ""} onClick={() => setShowSummary((x) => !x)} title="Funnel summary">Σ</button>
          )}
        </div>
      </main>
    </div>
  );
}
