"use client";

import dynamic from "next/dynamic";
import type { El } from "./types";

// Same reason as the editor loader: the canvas only exists in the browser.
const BoardViewer = dynamic(() => import("./board-viewer"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-500">טוען לוח…</div>,
});

export function BoardViewerLoader(props: { name: string; elements: El[] }) {
  return <BoardViewer {...props} />;
}
