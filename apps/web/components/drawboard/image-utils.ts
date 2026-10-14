import type { El } from "./types";

const BIG = 250 * 1024; // data-URL length above which an image is recompressed
const MAX_EDGE = 1400;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Re-encodes a large image data URL as a downscaled JPEG; small ones pass through. */
export async function shrinkDataUrl(src: string): Promise<string> {
  if (src.length <= BIG) return src;
  try {
    const img = await load(src);
    const k = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; // JPEG has no alpha
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/jpeg", 0.82);
    return out.length < src.length ? out : src;
  } catch {
    return src;
  }
}

export async function shrinkImages(elements: El[]): Promise<El[]> {
  return Promise.all(elements.map(async (el) => (el.type === "image" && el.src ? { ...el, src: await shrinkDataUrl(el.src) } : el)));
}
