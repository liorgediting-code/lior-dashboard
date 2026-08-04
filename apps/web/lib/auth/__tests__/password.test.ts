import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, generateRandomPassword } from "../password";

describe("hashPassword / verifyPassword", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const hash1 = await hashPassword("same password");
    const hash2 = await hashPassword("same password");
    expect(hash1).not.toBe(hash2);
  });

  it("rejects a malformed stored hash", async () => {
    expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});

describe("generateRandomPassword", () => {
  it("generates a password of reasonable length", () => {
    expect(generateRandomPassword().length).toBeGreaterThanOrEqual(12);
  });

  it("generates different passwords each call", () => {
    expect(generateRandomPassword()).not.toBe(generateRandomPassword());
  });
});
