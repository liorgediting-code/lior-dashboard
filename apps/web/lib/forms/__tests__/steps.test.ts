import { describe, expect, it } from "vitest";
import { rowToStep, serializeSteps, stepToRow } from "../steps";

describe("rowToStep", () => {
  it("converts a message row as-is", () => {
    expect(rowToStep({ type: "message", text: "היי!" })).toEqual({ type: "message", text: "היי!" });
  });

  it("converts a wait row in minutes", () => {
    expect(rowToStep({ type: "wait", amount: 30, unit: "minutes" })).toEqual({ type: "wait", wait_minutes: 30 });
  });

  it("converts a wait row in hours to minutes", () => {
    expect(rowToStep({ type: "wait", amount: 2, unit: "hours" })).toEqual({ type: "wait", wait_minutes: 120 });
  });

  it("converts a wait row in days to minutes", () => {
    expect(rowToStep({ type: "wait", amount: 1, unit: "days" })).toEqual({ type: "wait", wait_minutes: 1440 });
  });
});

describe("stepToRow", () => {
  it("picks days when the minute count divides evenly", () => {
    expect(stepToRow({ type: "wait", wait_minutes: 1440 })).toEqual({ type: "wait", amount: 1, unit: "days" });
  });

  it("picks hours when only that divides evenly", () => {
    expect(stepToRow({ type: "wait", wait_minutes: 120 })).toEqual({ type: "wait", amount: 2, unit: "hours" });
  });

  it("falls back to minutes when nothing bigger divides evenly", () => {
    expect(stepToRow({ type: "wait", wait_minutes: 90 })).toEqual({ type: "wait", amount: 90, unit: "minutes" });
  });

  it("round-trips a message step", () => {
    expect(stepToRow({ type: "message", text: "רק בודקים" })).toEqual({ type: "message", text: "רק בודקים" });
  });
});

describe("serializeSteps", () => {
  it("serializes mixed rows to the WhatsappAutomationStep JSON shape", () => {
    const json = serializeSteps([
      { type: "message", text: "היי!" },
      { type: "wait", amount: 1, unit: "days" },
    ]);
    expect(JSON.parse(json)).toEqual([
      { type: "message", text: "היי!" },
      { type: "wait", wait_minutes: 1440 },
    ]);
  });

  it("drops message rows with blank text", () => {
    const json = serializeSteps([{ type: "message", text: "   " }]);
    expect(JSON.parse(json)).toEqual([]);
  });

  it("keeps wait rows even when amount is 0", () => {
    const json = serializeSteps([{ type: "wait", amount: 0, unit: "minutes" }]);
    expect(JSON.parse(json)).toEqual([{ type: "wait", wait_minutes: 0 }]);
  });
});
