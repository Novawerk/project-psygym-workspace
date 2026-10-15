// Request bodies with a size cap, for the app's routes and the admin's.
/** 80 messages × 2000 characters of CJK is ~480 KB of UTF-8; leave room for JSON. */
export const MAX_BODY_BYTES = 1024 * 1024;

/** Past MAX_BODY_BYTES we keep reading (and dropping) up to this, so the client can finish sending. */
const MAX_DRAIN_BYTES = 16 * 1024 * 1024;

export type BodyRead = { tooLarge: false; text: string } | { tooLarge: true; drained: boolean };

/**
 * Reads the request body with a size cap. An oversized body is read to its end and dropped
 * (up to MAX_DRAIN_BYTES), so the client isn't cut off mid-upload and the connection survives.
 */
export async function readBody(req: Request): Promise<BodyRead> {
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (declared > MAX_DRAIN_BYTES) {
    await req.body?.cancel().catch(() => {});
    return { tooLarge: true, drained: false };
  }
  if (!req.body) return { tooLarge: false, text: "" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DRAIN_BYTES) {
        await reader.cancel().catch(() => {});
        return { tooLarge: true, drained: false };
      }
      if (total <= MAX_BODY_BYTES) chunks.push(value);
      else chunks.length = 0;
    }
  } catch {
    return { tooLarge: true, drained: false };
  }
  if (total > MAX_BODY_BYTES) return { tooLarge: true, drained: true };
  return { tooLarge: false, text: Buffer.concat(chunks).toString("utf8") };
}
