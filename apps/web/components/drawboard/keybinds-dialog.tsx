"use client";

import { useEffect, useState } from "react";
import { DEFAULT_KEYBINDS, RESERVED, normKey, type Keybinds } from "./keybinds";
import { TOOLS, type ToolId } from "./types";

interface Props {
  keybinds: Keybinds;
  onChange: (k: Keybinds) => void;
  onClose: () => void;
}

export default function KeybindsDialog({ keybinds, onChange, onClose }: Props) {
  const [capturing, setCapturing] = useState<ToolId | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return setCapturing(null);
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return setError("Modifier combos are reserved for the app.");
      const key = normKey(e);
      if (RESERVED.has(key)) return setError(`"${key}" is reserved.`);
      const clash = TOOLS.find((t) => t.id !== capturing && keybinds[t.id] === key);
      if (clash) return setError(`"${key}" is already used by ${clash.label}.`);
      setError("");
      onChange({ ...keybinds, [capturing]: key });
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, keybinds, onChange]);

  const show = (k: string) => (k === "" ? "—" : k.toUpperCase());

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <p className="muted">Click a key, then press the new one. Esc cancels.</p>
        <table>
          <tbody>
            {TOOLS.map((t) => (
              <tr key={t.id}>
                <td>
                  <span className="icon">{t.icon}</span> {t.label}
                </td>
                <td>
                  <button
                    className={"key" + (capturing === t.id ? " capturing" : "")}
                    onClick={() => {
                      setError("");
                      setCapturing(t.id);
                    }}
                  >
                    {capturing === t.id ? "press a key…" : show(keybinds[t.id])}
                  </button>
                  <button
                    className="link"
                    title="Clear"
                    onClick={() => onChange({ ...keybinds, [t.id]: "" })}
                  >
                    clear
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button onClick={() => onChange({ ...DEFAULT_KEYBINDS })}>Reset to defaults</button>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
