"use client";

import dynamic from "next/dynamic";
import type { BoardEditorProps } from "./board-editor";

// The editor touches canvas / window / fullscreen on mount, so it only ever
// renders in the browser. `ssr: false` has to live in a client component.
const BoardEditor = dynamic(() => import("./board-editor"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-500">טוען לוח…</div>,
});

export function BoardEditorLoader(props: BoardEditorProps) {
  return <BoardEditor {...props} />;
}
