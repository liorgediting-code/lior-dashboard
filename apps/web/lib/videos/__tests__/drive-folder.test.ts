import { describe, expect, it } from "vitest";
import { InvalidDriveFolderError, parseDriveFolderId } from "../drive-folder";

const ID = "1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuV";

describe("parseDriveFolderId", () => {
  it("keeps a bare id as-is", () => {
    expect(parseDriveFolderId(ID)).toBe(ID);
  });

  it("strips the ?usp=sharing that 'Get link' always appends", () => {
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID);
  });

  it("handles the /u/0/ multi-account address-bar shape", () => {
    expect(parseDriveFolderId(`https://drive.google.com/drive/u/0/folders/${ID}`)).toBe(ID);
  });

  it("handles the legacy open?id= shape, which has no folders segment", () => {
    expect(parseDriveFolderId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
  });

  it("ignores a trailing hash", () => {
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${ID}#grid`)).toBe(ID);
  });

  it("trims whitespace that survives a copy-paste", () => {
    expect(parseDriveFolderId(`  ${ID}  `)).toBe(ID);
  });

  // Null, not "": a cleared field has to read as unconfigured everywhere,
  // and `"" != null` would leave `hasFolder` disagreeing with the sync.
  it("returns null for empty and whitespace-only input", () => {
    expect(parseDriveFolderId("")).toBeNull();
    expect(parseDriveFolderId("   ")).toBeNull();
    expect(parseDriveFolderId(null)).toBeNull();
    expect(parseDriveFolderId(undefined)).toBeNull();
  });

  // Rejecting loudly matters more than it looks: a stored non-id makes
  // files.list return an empty list, so the sync says "0 videos" instead
  // of failing, and the folder looks empty rather than misconfigured.
  it("rejects a file link rather than storing a non-folder id", () => {
    expect(() => parseDriveFolderId(`https://drive.google.com/file/d/${ID}/view`)).toThrow(InvalidDriveFolderError);
  });

  it("rejects a word typed by mistake", () => {
    expect(() => parseDriveFolderId("videos")).toThrow(InvalidDriveFolderError);
  });

  it("rejects a non-Drive URL", () => {
    expect(() => parseDriveFolderId("https://example.com/whatever")).toThrow(InvalidDriveFolderError);
  });
});
