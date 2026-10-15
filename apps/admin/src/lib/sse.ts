import type { ChatFrame } from "./types"

/** Reads `data: {json}` frames off a text/event-stream body. */
export async function* readFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatFrame> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let cut: number
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, cut)
      buffer = buffer.slice(cut + 2)
      const data = event
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n")
      if (data) yield JSON.parse(data) as ChatFrame
    }
  }
}
