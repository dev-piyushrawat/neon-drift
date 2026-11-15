import type { Track } from './track';

const RECORD_KEY = 'neon-drift:afterdark:best-ms';
// The fixed physics step moves the craft well under four metres, even under boost.
const MAX_STEP_DISTANCE = 4;

function isRecordTime(milliseconds: number): boolean {
  return Number.isSafeInteger(milliseconds) && milliseconds > 0;
}

export class PersonalBest {
  time = this.read();

  private read(): number | null {
    try {
      const stored = window.localStorage.getItem(RECORD_KEY);
      if (stored === null || !/^[1-9]\d*$/.test(stored)) return null;
      const time = Number(stored);
      return isRecordTime(time) ? time : null;
    } catch {
      return null;
    }
  }

  submit(milliseconds: number): boolean {
    if (!isRecordTime(milliseconds)) return false;
    const stored = this.read();
    if (stored !== null && (this.time === null || stored < this.time)) this.time = stored;
    if (this.time !== null && milliseconds >= this.time) return false;

    this.time = milliseconds;
    try {
      window.localStorage.setItem(RECORD_KEY, String(milliseconds));
    } catch {
      // The record is still available for this session if storage is unavailable.
    }
    return true;
  }
}

export class TimeTrial {
  cleared = 0;
  finishTime: number | null = null;
  feedback: { text: string; until: number } | null = null;
  private position: number;
  private previousDistance: number;
  private previousTime = 0;
  private accumulatedTime = 0;
  private resumedAt: number | null;

  constructor(readonly track: Track, startDistance: number, now: number) {
    this.position = startDistance;
    this.previousDistance = startDistance;
    this.resumedAt = now;
  }

  elapsed(now: number): number {
    return this.finishTime ?? (this.accumulatedTime
      + (this.resumedAt === null ? 0 : Math.max(0, now - this.resumedAt)));
  }

  pause(now: number): void {
    this.accumulatedTime = this.elapsed(now);
    this.resumedAt = null;
  }

  resume(now: number): void {
    this.previousTime = this.accumulatedTime;
    this.resumedAt = now;
  }

  advance(distance: number, now: number): void {
    if (this.finishTime !== null || this.resumedAt === null) return;

    const { length, checkpoints } = this.track;
    const difference = distance - this.previousDistance;
    const step = difference - Math.round(difference / length) * length;
    const before = this.position;
    const time = Math.max(this.previousTime, this.elapsed(now));
    this.position += step;
    this.previousDistance = distance;
    // A reverse crossing removes credit so the same sector stays required.
    while (this.cleared > 0 && this.position < checkpoints[this.cleared - 1].distance) {
      this.cleared--;
      this.feedback = null;
    }

    if (step > 0 && step <= MAX_STEP_DISTANCE) {
      const next = checkpoints[this.cleared];
      if (next && before < next.distance && this.position >= next.distance) {
        this.cleared++;
        this.feedback = {
          text: this.cleared === checkpoints.length ? 'Finish ahead' : `Checkpoint ${this.cleared} cleared`,
          until: time + 1500
        };
      }
      if (before < length && this.position >= length) {
        if (this.cleared === checkpoints.length) {
          const fraction = (length - before) / step;
          this.finishTime = Math.max(1, Math.round(this.previousTime + (time - this.previousTime) * fraction));
        } else {
          this.feedback = { text: 'Checkpoint missed', until: time + 2300 };
        }
      }
    }
    this.previousTime = time;
  }
}
