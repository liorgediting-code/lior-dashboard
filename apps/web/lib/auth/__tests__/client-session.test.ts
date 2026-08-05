import { beforeEach, describe, expect, it } from "vitest";
import { signClientSession, verifyClientSession } from "../client-session";

const HASH_PREFIX = "testhashprefix";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

describe("signClientSession / verifyClientSession", () => {
  it("verifies a session it just signed", () => {
    const token = signClientSession("client-123", HASH_PREFIX);
    expect(verifyClientSession(token)).toEqual({ clientId: "client-123", passwordHashPrefix: HASH_PREFIX });
  });

  it("returns the exact passwordHashPrefix it was signed with, so callers can compare it to the live hash", () => {
    const token = signClientSession("client-123", "0123456789abcdef");
    expect(verifyClientSession(token)?.passwordHashPrefix).toBe("0123456789abcdef");
  });

  it("rejects a tampered token", () => {
    const token = signClientSession("client-123", HASH_PREFIX);
    const tampered = token.replace("client-123", "client-456");
    expect(verifyClientSession(tampered)).toBeNull();
  });

  it("rejects a token whose passwordHashPrefix was tampered with", () => {
    const token = signClientSession("client-123", HASH_PREFIX);
    const tampered = token.replace(HASH_PREFIX, "otherhashprefx");
    expect(verifyClientSession(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signClientSession("client-123", HASH_PREFIX, new Date(Date.now() - 1000));
    expect(verifyClientSession(token)).toBeNull();
  });

  it("rejects a missing token", () => {
    expect(verifyClientSession(undefined)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyClientSession("not.a.valid.token.at.all")).toBeNull();
  });

  it("rejects an old-format 3-part token", () => {
    expect(verifyClientSession("client-123.9999999999999.deadbeef")).toBeNull();
  });

  it("returns null instead of throwing when SESSION_SECRET is unset", () => {
    const token = signClientSession("client-123", HASH_PREFIX);
    delete process.env.SESSION_SECRET;
    expect(() => verifyClientSession(token)).not.toThrow();
    expect(verifyClientSession(token)).toBeNull();
  });
});
