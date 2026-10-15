// Some models, now and then, write the end_session call into the reply as text
// ("<end_session>\n\n我想今天先到这里。</end_session>") instead of calling the tool. The app would show
// the tags and the session would never end. EndTagFilter takes those tags out of the stream and
// remembers that it saw one; the server then ends the session as if the tool had been called.
//
// Variants: half- and full-width angle brackets, a slash at either end, spaces inside, any case,
// "end_session" / "end session" / "endsession". A tag can be split across deltas, so text that may
// still turn into a tag is held back until it can't.

const TAG = /[<＜]\s*\/?\s*end[\s_]?session\s*\/?\s*[>＞]/gi;
const OPEN = /[<＜]/g;
/** Longer than any tag we strip ("＜ / end_session / ＞" with a few spaces). */
const MAX_TAG = 32;

export class EndTagFilter {
  private held = "";
  private started = false;
  /** True once a tag has been seen. */
  found = false;

  /** Takes one delta; returns the text that is safe to send now (maybe ""). */
  push(text: string): string {
    this.held += text;
    this.strip();
    // Hold back from the last bracket that could still open a tag.
    let cut = this.held.length;
    for (const m of this.held.matchAll(OPEN)) {
      const tail = this.held.slice(m.index);
      if (tail.length < MAX_TAG && !/[>＞]/.test(tail) && couldBeTag(tail)) {
        cut = m.index;
        break;
      }
    }
    const out = this.held.slice(0, cut);
    this.held = this.held.slice(cut);
    return this.emit(out);
  }

  /** At the end of the stream: whatever is left. */
  flush(): string {
    this.strip();
    const out = this.held;
    this.held = "";
    return this.emit(out);
  }

  private strip() {
    const before = this.held;
    this.held = this.held.replace(TAG, "");
    if (this.held !== before) this.found = true;
  }

  /** A removed opening tag leaves blank lines in front of the reply; drop them. */
  private emit(out: string): string {
    if (!this.started) {
      out = out.replace(/^\s+/, "");
      if (out) this.started = true;
    }
    return out;
  }
}

/** Could `tail` (starting at a bracket, no closing bracket yet) still become a tag? */
function couldBeTag(tail: string): boolean {
  const word = tail
    .slice(1)
    .replace(/[\s/]/g, "")
    .replace(/_/g, "")
    .toLowerCase();
  return "endsession".startsWith(word);
}
