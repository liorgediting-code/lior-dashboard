export type ToolId =
  | "select"
  | "hand"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "thickarrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "doc"
  | "funnel"
  | "eraser";

export type TextDir = "auto" | "ltr" | "rtl";

export type StageKind = "traffic" | "lead" | "call" | "meeting_booked" | "meeting_held" | "closed" | "other";

export interface StageField { id: string; label: string; value: string }
export interface StageFormula { id: string; name: string; expr: string }

export interface StageData {
  name: string;
  kind: StageKind;
  volume: number | null; // people in this stage
  cost: number | null; // spend attributed to this stage
  dealValue: number | null; // per closed deal ("closed" stages)
  from?: string; // ISO date, period start
  to?: string; // ISO date, period end
  notes?: string; // hypothesis / what to improve
  custom: StageField[];
  benchMin?: number; // expected conversion INTO this stage, in %
  benchMax?: number;
  formulas?: StageFormula[]; // funnel-wide; kept identical on every stage of a funnel
}

export interface El {
  id: string;
  type: Exclude<ToolId, "select" | "hand" | "eraser">;
  x: number;
  y: number;
  w: number; // for line/arrow: delta to end point
  h: number;
  points?: [number, number][]; // freedraw, relative to x,y
  text?: string;
  crop?: { l: number; t: number; r: number; b: number }; // visible fraction of the box
  src?: string; // image data URL
  fs?: number; // font size for text
  dir?: TextDir; // text direction
  title?: string; // doc card title
  body?: string; // doc card contents
  stage?: StageData; // funnel stage card data
  stroke: string;
  fill: string; // "transparent" for none
  sw: number;
  seed: number;
}

export interface View {
  x: number;
  y: number;
  zoom: number;
}

export const TOOLS: { id: ToolId; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "↖" },
  { id: "hand", label: "Pan", icon: "✋" },
  { id: "rectangle", label: "Rectangle", icon: "▭" },
  { id: "diamond", label: "Diamond", icon: "◇" },
  { id: "ellipse", label: "Ellipse", icon: "◯" },
  { id: "arrow", label: "Arrow", icon: "→" },
  { id: "thickarrow", label: "Thick arrow", icon: "➡" },
  { id: "line", label: "Line", icon: "╱" },
  { id: "freedraw", label: "Draw", icon: "✎" },
  { id: "text", label: "Text", icon: "A" },
  { id: "image", label: "Image", icon: "🖼" },
  { id: "doc", label: "Doc", icon: "📄" },
  { id: "funnel", label: "Funnel stage", icon: "⏷" },
  { id: "eraser", label: "Eraser", icon: "⌫" },
];

export const uid = () => Math.random().toString(36).slice(2, 10);
