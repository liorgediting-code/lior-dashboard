import { describe, expect, it } from "vitest";
import { campaignActivity, formatCampaignStatus, isCampaignActive } from "../campaign-status";

describe("campaignActivity", () => {
  it("treats only ACTIVE as active", () => {
    expect(campaignActivity("ACTIVE")).toBe("active");
    expect(campaignActivity("PAUSED")).toBe("inactive");
    expect(campaignActivity("ARCHIVED")).toBe("inactive");
    expect(campaignActivity("DELETED")).toBe("inactive");
    expect(campaignActivity("PENDING_REVIEW")).toBe("inactive");
  });

  it("is case- and whitespace-insensitive, since the column has no check constraint", () => {
    expect(campaignActivity("active")).toBe("active");
    expect(campaignActivity(" Active ")).toBe("active");
  });

  it("counts a missing status as inactive rather than assuming it runs", () => {
    expect(campaignActivity(null)).toBe("inactive");
    expect(campaignActivity(undefined)).toBe("inactive");
    expect(campaignActivity("")).toBe("inactive");
  });

  it("exposes the same answer as a boolean", () => {
    expect(isCampaignActive("ACTIVE")).toBe(true);
    expect(isCampaignActive("PAUSED")).toBe(false);
  });
});

describe("formatCampaignStatus", () => {
  it("translates the statuses Meta actually returns", () => {
    expect(formatCampaignStatus("PAUSED")).toBe("מושהה");
    expect(formatCampaignStatus("ACTIVE")).toBe("פעיל");
  });

  it("falls back to the raw value for anything unmapped, rather than hiding it", () => {
    expect(formatCampaignStatus("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("renders an empty status as a dash", () => {
    expect(formatCampaignStatus(null)).toBe("—");
  });
});
