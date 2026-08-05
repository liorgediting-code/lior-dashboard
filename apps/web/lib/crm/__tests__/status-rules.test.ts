import { describe, expect, it } from "vitest";
import { computeStatusChangePatch, planStatusDeletion } from "../status-rules";
import type { LeadStatus } from "@dashboard-lior/shared";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("computeStatusChangePatch", () => {
  it("clears closed_at and deal_value when reverting to an open status", () => {
    expect(computeStatusChangePatch("open", null, NOW)).toEqual({ closed_at: null, deal_value: null });
  });

  it("sets closed_at for a won status with no deal value", () => {
    expect(computeStatusChangePatch("won", null, NOW)).toEqual({ closed_at: NOW.toISOString() });
  });

  it("sets closed_at and deal_value for a won status with a deal value", () => {
    expect(computeStatusChangePatch("won", 3200, NOW)).toEqual({ closed_at: NOW.toISOString(), deal_value: 3200 });
  });

  it("sets closed_at but not deal_value for a lost status", () => {
    expect(computeStatusChangePatch("lost", 3200, NOW)).toEqual({ closed_at: NOW.toISOString() });
  });
});

function makeStatus(overrides: Partial<LeadStatus>): LeadStatus {
  return { id: "id", client_id: "client", label: "label", kind: "open", sort_order: 0, is_default: false, ...overrides };
}

describe("planStatusDeletion", () => {
  it("throws when the status doesn't exist", () => {
    expect(() => planStatusDeletion([], "missing")).toThrow();
  });

  it("throws when trying to delete a won status", () => {
    const statuses = [makeStatus({ id: "s1", kind: "won" })];
    expect(() => planStatusDeletion(statuses, "s1")).toThrow();
  });

  it("throws when trying to delete a lost status", () => {
    const statuses = [makeStatus({ id: "s1", kind: "lost" })];
    expect(() => planStatusDeletion(statuses, "s1")).toThrow();
  });

  it("throws when it's the last remaining open status", () => {
    const statuses = [makeStatus({ id: "s1", kind: "open" }), makeStatus({ id: "s2", kind: "won" })];
    expect(() => planStatusDeletion(statuses, "s1")).toThrow();
  });

  it("reassigns to the other open status's default when deleting a non-default open status", () => {
    const statuses = [
      makeStatus({ id: "s1", kind: "open", is_default: false }),
      makeStatus({ id: "s2", kind: "open", is_default: true }),
    ];
    expect(planStatusDeletion(statuses, "s1")).toEqual({ reassignToStatusId: "s2" });
  });

  it("promotes another open status to default when deleting the current default", () => {
    const statuses = [
      makeStatus({ id: "s1", kind: "open", is_default: true }),
      makeStatus({ id: "s2", kind: "open", is_default: false }),
    ];
    expect(planStatusDeletion(statuses, "s1")).toEqual({ reassignToStatusId: "s2", newDefaultStatusId: "s2" });
  });
});
