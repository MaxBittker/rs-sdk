/**
 * Bounded console capture for execute_code.
 *
 * Captured output used to be an unbounded array. A script that logs from a
 * tight loop (e.g. a catch block with no await, retrying a call that throws
 * synchronously) never yields, so the execution timeout can't fire and the
 * array grows until the process - and the sandbox with it - runs out of
 * memory. Keep the first `headMax` and last `tailMax` lines, clip long lines,
 * and count everything dropped in between so memory stays constant.
 */

export const CONSOLE_HEAD_LINES = 300;
export const CONSOLE_TAIL_LINES = 300;
export const CONSOLE_MAX_LINE_CHARS = 2000;

export class ConsoleCapture {
  private readonly head: string[] = [];
  private readonly tail: string[] = []; // ring buffer once full
  private tailStart = 0;
  private omitted = 0;

  constructor(
    private readonly headMax = CONSOLE_HEAD_LINES,
    private readonly tailMax = CONSOLE_TAIL_LINES,
    private readonly maxLineChars = CONSOLE_MAX_LINE_CHARS,
  ) {}

  push(line: string): void {
    if (line.length > this.maxLineChars) {
      line = `${line.slice(0, this.maxLineChars)} … [${line.length - this.maxLineChars} more chars]`;
    }
    if (this.head.length < this.headMax) {
      this.head.push(line);
    } else if (this.tail.length < this.tailMax) {
      this.tail.push(line);
    } else if (this.tailMax === 0) {
      this.omitted++;
    } else {
      this.tail[this.tailStart] = line;
      this.tailStart = (this.tailStart + 1) % this.tailMax;
      this.omitted++;
    }
  }

  /** Number of lines retained (not counting omitted ones). */
  get length(): number {
    return this.head.length + this.tail.length;
  }

  /** Total lines logged, including omitted ones. */
  get total(): number {
    return this.length + this.omitted;
  }

  lines(): string[] {
    const tail = this.tail.slice(this.tailStart).concat(this.tail.slice(0, this.tailStart));
    if (this.omitted === 0) return this.head.concat(tail);
    const marker = `… ${this.omitted} line(s) omitted - console output keeps the first ${this.headMax} and last ${this.tailMax} lines …`;
    return [...this.head, marker, ...tail];
  }
}
