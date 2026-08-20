import { describe, expect, it } from "vitest";
import { buildStreamResponseInit, isDriveFailure, mapDriveFailureStatus, normaliseVideoContentType } from "../stream-response";

function driveHeaders(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("buildStreamResponseInit", () => {
  it("passes a 206 through as 206 with its Content-Range intact", () => {
    const { status, headers } = buildStreamResponseInit(
      206,
      driveHeaders({
        "content-type": "video/mp4",
        "content-length": "100",
        "content-range": "bytes 0-99/52428800",
      }),
      null
    );

    expect(status).toBe(206);
    expect(headers.get("Content-Range")).toBe("bytes 0-99/52428800");
    expect(headers.get("Content-Length")).toBe("100");
    expect(headers.get("Content-Type")).toBe("video/mp4");
  });

  // Without this the browser never sends a Range request in the first
  // place, so seeking is dead before the 206 path is ever reached.
  it("advertises Accept-Ranges even on a full 200 response", () => {
    const { status, headers } = buildStreamResponseInit(200, driveHeaders({ "content-type": "video/mp4" }), null);
    expect(status).toBe(200);
    expect(headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("advertises Accept-Ranges on a 206 too", () => {
    const { headers } = buildStreamResponseInit(206, driveHeaders({ "content-range": "bytes 5-9/10" }), null);
    expect(headers.get("Accept-Ranges")).toBe("bytes");
  });

  // Uses an already-playable type so this stays a test of the FALLBACK and
  // not of the quicktime relabelling, which is covered separately below.
  it("falls back to the stored mime type when Drive omits content-type", () => {
    const { headers } = buildStreamResponseInit(200, driveHeaders({}), "video/webm");
    expect(headers.get("Content-Type")).toBe("video/webm");
  });

  it("omits Content-Type entirely when neither source has one", () => {
    const { headers } = buildStreamResponseInit(200, driveHeaders({}), null);
    expect(headers.get("Content-Type")).toBeNull();
  });

  it("omits Content-Range on a full response rather than inventing one", () => {
    const { headers } = buildStreamResponseInit(200, driveHeaders({ "content-type": "video/mp4" }), null);
    expect(headers.get("Content-Range")).toBeNull();
  });

  // The whitelist is the point: Drive's own auth/CORS/encoding headers must
  // not reach the browser. content-encoding especially — it would describe
  // a body the runtime already decoded.
  it("drops every header outside the whitelist", () => {
    const { headers } = buildStreamResponseInit(
      206,
      driveHeaders({
        "content-type": "video/mp4",
        "content-range": "bytes 0-9/10",
        "content-encoding": "gzip",
        "set-cookie": "SID=secret",
        "access-control-allow-origin": "*",
        "x-goog-hash": "crc32c=abc",
      }),
      null
    );

    expect(headers.get("Content-Encoding")).toBeNull();
    expect(headers.get("Set-Cookie")).toBeNull();
    expect(headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(headers.get("x-goog-hash")).toBeNull();
    expect([...headers.keys()].sort()).toEqual(["accept-ranges", "content-range", "content-type"]);
  });
});

describe("isDriveFailure", () => {
  // A 206 read as a failure is exactly how Range support gets switched off
  // by accident — the route would 502 every seek.
  it("does not treat 206 as a failure", () => {
    expect(isDriveFailure(206)).toBe(false);
  });

  it("does not treat 200 as a failure", () => {
    expect(isDriveFailure(200)).toBe(false);
  });

  it("treats 403 and 404 as failures", () => {
    expect(isDriveFailure(403)).toBe(true);
    expect(isDriveFailure(404)).toBe(true);
  });

  it("treats a 302 as a failure — a redirect body is not video bytes", () => {
    expect(isDriveFailure(302)).toBe(true);
  });
});

describe("mapDriveFailureStatus", () => {
  it("keeps a missing file as 404", () => {
    expect(mapDriveFailureStatus(404)).toBe(404);
  });

  it("reports any other upstream problem as 502", () => {
    expect(mapDriveFailureStatus(403)).toBe(502);
    expect(mapDriveFailureStatus(500)).toBe(502);
  });
});

describe("normaliseVideoContentType", () => {
  // Drive reports every .mov export as video/quicktime, which some playback
  // paths refuse outright — before decoding a byte, so it looks identical
  // to a broken stream.
  it("relabels quicktime as mp4", () => {
    expect(normaliseVideoContentType("video/quicktime")).toBe("video/mp4");
    expect(normaliseVideoContentType("video/x-quicktime")).toBe("video/mp4");
  });

  it("matches case-insensitively, since header casing is not guaranteed", () => {
    expect(normaliseVideoContentType("Video/QuickTime")).toBe("video/mp4");
  });

  it("keeps parameters attached to the relabelled type", () => {
    expect(normaliseVideoContentType("video/quicktime; charset=binary")).toBe("video/mp4; charset=binary");
  });

  it("leaves an already-playable type completely alone", () => {
    expect(normaliseVideoContentType("video/mp4")).toBe("video/mp4");
    expect(normaliseVideoContentType("video/webm")).toBe("video/webm");
  });

  it("passes null through rather than inventing a type", () => {
    expect(normaliseVideoContentType(null)).toBeNull();
  });
});

describe("buildStreamResponseInit + quicktime", () => {
  it("relabels a quicktime response on the way to the browser", () => {
    const { headers } = buildStreamResponseInit(206, new Headers({ "content-type": "video/quicktime" }), null);
    expect(headers.get("Content-Type")).toBe("video/mp4");
  });

  it("relabels the stored fallback type too, not just Drive's header", () => {
    const { headers } = buildStreamResponseInit(200, new Headers({}), "video/quicktime");
    expect(headers.get("Content-Type")).toBe("video/mp4");
  });
});
