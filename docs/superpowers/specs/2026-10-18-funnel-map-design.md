# Funnel Map on Boards — Design

Date: 2026-10-18
Status: design approved in chat; spec awaiting review

## Goal

Add a funnel-map tool to the boards (drawboard). The user builds a funnel
for a client on a board, one stage at a time, records data per stage, and
sees conversion, drop-off, CAC, cost per meeting and the bottleneck, inspired
by Funnelytics. Boards already belong to a client (`boards.client_id`), so a
funnel is attached to a client by living on that client's board.

## Non-goals (first version)

- No automatic data from Meta or the CRM. Data is typed in by hand. The data
  shape is structured so a later import can fill the same fields.
- No month-vs-month comparison. A stage stores one period (from/to).
- No new tables and no migration. Everything lives in `boards.elements` (jsonb).

## Data model

New tool id `funnel` and element type `funnel` in `types.ts`. A funnel stage
is an `El` of type `funnel` with one new optional field:

```ts
stage?: {
  name: string;
  kind: "traffic" | "lead" | "call" | "meeting_booked" | "meeting_held" | "closed" | "other";
  volume: number | null;        // people in this stage
  cost: number | null;          // spend attributed to this stage
  dealValue: number | null;     // per closed deal, kind "closed" only
  from?: string; to?: string;   // ISO dates for the period
  notes?: string;               // hypothesis / what to improve
  custom: { id: string; label: string; value: string }[]; // user fields
}
```

Stage order is derived from arrows. An arrow element whose start touches a
stage card and whose end touches another defines `from -> to`. A stage with
no incoming arrow is a root. Branching is allowed: a stage may have several
outgoing arrows, and conversion is computed per edge.

## Stage card (canvas)

Rendered in `render.ts` like the Doc card. Shows the stage name, volume, and
conversion from the previous stage. Color of the conversion by comparison to
the benchmark: green at or above, yellow within 20% below, red below that. The
stage with the largest absolute leak gets a "bottleneck" badge. Click opens the
data panel (same pattern as `openDocById`).

## Data panel

Opened from a stage card, modeled on the Doc panel (`doc-backdrop`,
`doc-panel`):

- Fixed fields: name, kind, volume, cost, period, deal value (closed only).
- Custom fields: add/remove rows of label + value.
- Notes / hypothesis: free text.

## Summary panel

A side panel computed from the stages connected on the board:

- Per edge: conversion %, drop-off %. Per stage: cumulative conversion from
  its root.
- CAC = total cost of all stages / volume of `closed` stages.
- Cost per lead, cost per meeting (kind `meeting_held`), cost per meeting
  booked (kind `meeting_booked`): cumulative cost of the stage and every
  stage before it on its path, divided by that stage's volume.
- Revenue = closed volume x deal value; ROI = (revenue - total cost) / total
  cost.
- Custom formulas: user-defined rows of name + expression, evaluated by a
  small safe parser (numbers, `+ - * / ( )`, identifiers). Identifiers are
  `cost`, `vol.<stage-slug>`, `cost.<stage-slug>`, and custom-field slugs. No
  `eval`. An invalid or divide-by-zero formula shows "—".
- Benchmarks: default lead->call 20–40%, call->close 15–25%, editable per
  funnel. Below-range edges are flagged.
- Recommendation: names the edge with the largest absolute leak (lost people,
  not lowest percent) and lists three editable hypotheses.

Formulas and benchmarks are stored on the funnel as a small config object on
the first stage element of the funnel, or a dedicated hidden `funnel-config`
element, to keep everything in `elements`.

## Template

A "New funnel" action places a starter chain with arrows:
traffic -> lead -> call -> meeting_booked -> closed, ready to fill in.

## Code layout

- `components/drawboard/funnel-math.ts`: pure functions (graph from arrows,
  conversion, cumulative cost, CAC, formula parser/evaluator, bottleneck).
  No React, no canvas. Unit tested.
- `components/drawboard/render.ts`: draw the stage card and badge.
- `components/drawboard/board-editor.tsx`: tool, click-to-open, data panel,
  summary panel, template action.
- `components/drawboard/types.ts`, `keybinds.ts`: new tool and keybind.
- `app/globals.css`: panel styles next to the Doc panel styles.

## Error handling

- Missing volume or cost leaves the dependent metric as "—", never 0 or NaN.
- Cycles in arrows are ignored for ordering (the back-edge is skipped).
- Existing boards load unchanged; `stage` is optional.

## Testing

- Unit tests for `funnel-math.ts`: conversion on a linear and a branched
  funnel, CAC and cost-per-meeting attribution, divide-by-zero, cycle,
  formula parsing (valid, invalid, injection attempts), bottleneck choice.
- Manual check in the browser: add a stage, fill data, connect with an
  arrow, confirm card colors, badge and summary numbers, reload and confirm
  persistence, import/export round trip, and copy/paste of a stage.
