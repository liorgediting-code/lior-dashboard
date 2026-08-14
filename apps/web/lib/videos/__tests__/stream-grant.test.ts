import { describe, it, expect, beforeAll } from "vitest";
import { signVideoGrant, verifyVideoGrant } from "../stream-grant";

const VIDEO = "11111111-1111-1111-1111-111111111111";
const OTHER_VIDEO = "22222222-2222-2222-2222-222222222222";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-for-video-grants";
});

describe("video stream grants", () => {
  it("accepts a grant it just issued for that video", () => {
    expect(verifyVideoGrant(signVideoGrant(VIDEO), VIDEO)).toBe(true);
  });

  // The whole point of the grant: it unlocks ONE video, so a client entitled
  // to their own footage cannot replay the token against someone else's.
  it("rejects a valid grant presented for a different video", () => {
    expect(verifyVideoGrant(signVideoGrant(VIDEO), OTHER_VIDEO)).toBe(false);
  });

  it("rejects an expired grant", () => {
    expect(verifyVideoGrant(signVideoGrant(VIDEO, Date.now() - 1000), VIDEO)).toBe(false);
  });

  it("accepts a grant that has not quite expired", () => {
    expect(verifyVideoGrant(signVideoGrant(VIDEO, Date.now() + 60_000), VIDEO)).toBe(true);
  });

  // Absence of a token must never read as permission — this is the exact
  // inversion the grant exists to prevent.
  it.each([null, undefined, ""])("rejects a missing grant (%s)", (token) => {
    expect(verifyVideoGrant(token, VIDEO)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = signVideoGrant(VIDEO);
    const [expiry, signature] = [token.slice(0, token.indexOf(".")), token.slice(token.indexOf(".") + 1)];
    const flipped = (signature[0] === "a" ? "b" : "a") + signature.slice(1);
    expect(verifyVideoGrant(`${expiry}.${flipped}`, VIDEO)).toBe(false);
  });

  // Pushing the expiry out is the obvious forgery attempt: the timestamp is
  // in plaintext, so it must be part of the signed payload.
  it("rejects an extended expiry re-signed with the original signature", () => {
    const token = signVideoGrant(VIDEO, Date.now() + 1000);
    const signature = token.slice(token.indexOf(".") + 1);
    expect(verifyVideoGrant(`${Date.now() + 999_999_999}.${signature}`, VIDEO)).toBe(false);
  });

  it.each(["", "garbage", "no-separator", "123.", ".abc"])("rejects malformed token %s", (token) => {
    expect(verifyVideoGrant(token, VIDEO)).toBe(false);
  });

  it("rejects a non-numeric expiry without throwing", () => {
    expect(verifyVideoGrant("notanumber.deadbeef", VIDEO)).toBe(false);
  });
});
