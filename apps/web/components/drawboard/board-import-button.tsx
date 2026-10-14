"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBoard } from "@/lib/actions/boards";
import { shrinkImages } from "./image-utils";
import type { El } from "./types";

/** Creates a board from a `.drawboard.json` export (the old standalone app's format). */
export function BoardImportButton({ clientId }: { clientId?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.elements)) throw new Error("bad file");
      const name = String(data.name || file.name.replace(/\.drawboard\.json$|\.json$/, "") || "Imported");
      start(async () => {
        try {
          const elements = await shrinkImages(data.elements as El[]);
          if (JSON.stringify(elements).length > 4_000_000) {
            setError("הלוח גדול מדי גם אחרי דחיסת התמונות (מעל 4MB)");
            return;
          }
          const id = await createBoard(name, clientId ?? null, elements);
          router.push(`/boards/${id}`);
        } catch {
          setError("הייבוא נכשל — נסה שוב");
        }
      });
    } catch {
      setError("לא הצלחתי לקרוא את הקובץ");
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? "מייבא…" : "ייבוא JSON"}
      </button>
      <input ref={input} type="file" accept=".json" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {error && <span className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
