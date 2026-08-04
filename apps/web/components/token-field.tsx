"use client";

import { useState } from "react";

export function TokenField({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex gap-2">
      <input className="input font-mono" type={visible ? "text" : "password"} name={name} defaultValue={defaultValue} />
      <button type="button" className="btn btn-secondary" onClick={() => setVisible((v) => !v)}>
        {visible ? "הסתר" : "הצג"}
      </button>
    </div>
  );
}
