import type { ToolId } from "./types";

export type Keybinds = Record<ToolId, string>;

export const DEFAULT_KEYBINDS: Keybinds = {
  select: "v",
  hand: "h",
  rectangle: "r",
  diamond: "d",
  ellipse: "o",
  arrow: "a",
  thickarrow: "k",
  line: "l",
  freedraw: "p",
  text: "t",
  image: "i",
  eraser: "e",
};

const KEY = "drawboard:keybinds";

export function loadKeybinds(): Keybinds {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULT_KEYBINDS, ...saved };
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

export function saveKeybinds(k: Keybinds) {
  try {
    localStorage.setItem(KEY, JSON.stringify(k));
  } catch {
    /* ignore */
  }
}

// Keys reserved for built-in actions.
export const RESERVED = new Set(["delete", "backspace", "escape", " ", "enter"]);

// Use the physical key for letters/digits so non-Latin layouts (e.g. Hebrew) still match.
export const normKey = (e: KeyboardEvent) => {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  return e.key.toLowerCase();
};
