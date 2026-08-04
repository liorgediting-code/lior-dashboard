import { beforeEach, describe, expect, it } from "vitest";
import { signClientSession, verifyClientSession } from "../client-session";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

describe("signClientSession / verifyClientSession", () => {
  it("verifies a session it just signed", () => {
    const token = signClientSession("client-123");
    expect(verifyClientSession(token)).toEqual({ clientId: "client-123" });
  });

  it("rejects a tampered token", () => {
    const token = signClientSession("client-123");
    const tampered = token.replace("client-123", "client-456");
    expect(verifyClientSession(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signClientSession("client-123", new Date(Date.now() - 1000));
    expect(verifyClientSession(token)).toBeNull();
  });

  it("rejects a missing token", () => {
    expect(verifyClientSession(undefined)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyClientSession("not.a.valid.token.at.all")).toBeNull();
  });

  it("returns null instead of throwing when SESSION_SECRET is unset", () => {
    const token = signClientSession("client-123");
    delete process.env.SESSION_SECRET;
    expect(() => verifyClientSession(token)).not.toThrow();
    expect(verifyClientSession(token)).toBeNull();
  });
});
