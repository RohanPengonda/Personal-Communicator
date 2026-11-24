import type { WordTiming } from '../types';

// The Web Speech API has no word timestamps. It does, however, emit interim
// results that grow word by word before a result is finalized. We record when
// each word first appears, then turn those observations into word ranges when
// the result becomes final. This keeps markers tied to real speech moments
// instead of fixed fractions of the recording.

const MIN_WORD_SECONDS = 0.08;

interface WordObservation {
  word: string;
  firstSeen: number;
}

export interface RecognitionResultEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0?: { transcript: string };
    };
  };
}

function tokenizeWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Build a monotonic list of word ranges from the first-seen times of each word.
 * Unknown onsets are interpolated, and words seen in the same recognition
 * event are spread across the time until the next distinct onset.
 */
export function buildWordTimings(
  words: string[],
  observed: WordObservation[],
  finalizedAt: number,
  floor: number
): WordTiming[] {
  if (!words.length) return [];

  const count = words.length;
  const boundary = Math.max(finalizedAt, floor + MIN_WORD_SECONDS * count);
  const starts = words.map((_, index) => {
    const seen = observed[index]?.firstSeen;
    return Number.isFinite(seen) && seen >= floor && seen <= boundary ? seen : Number.NaN;
  });

  // Interpolate words the browser never exposed as an interim result.
  for (let index = 0; index < count; index += 1) {
    if (!Number.isNaN(starts[index])) continue;
    let left = index - 1;
    while (left >= 0 && Number.isNaN(starts[left])) left -= 1;
    let right = index + 1;
    while (right < count && Number.isNaN(starts[right])) right += 1;

    const leftValue = left >= 0 ? starts[left] : floor;
    const rightValue = right < count ? starts[right] : boundary;
    const steps = right - left;
    starts[index] = Math.max(floor, leftValue + ((rightValue - leftValue) * (index - left)) / steps);
  }

  // Never overlap a previously finalized result.
  for (let index = 0; index < count; index += 1) {
    starts[index] = Math.max(starts[index], index === 0 ? floor : starts[index - 1]);
  }

  // Spread words that arrived together across the time before the next onset.
  const groups: { indexes: number[]; start: number }[] = [];
  starts.forEach((start, index) => {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.start - start) < 1e-4) last.indexes.push(index);
    else groups.push({ indexes: [index], start });
  });

  groups.forEach((group, groupIndex) => {
    const nextStart = groupIndex + 1 < groups.length ? groups[groupIndex + 1].start : boundary;
    const available = Math.max(0, nextStart - group.start);
    group.indexes.forEach((index, offset) => {
      starts[index] = group.start + (available * offset) / group.indexes.length;
    });
  });

  return words.map((word, index) => {
    const start = starts[index];
    const isLast = index === count - 1;
    const end = isLast
      ? Math.max(boundary, start + MIN_WORD_SECONDS)
      : starts[index + 1];
    return { word, start: round2(start), end: round2(end) };
  });
}

/** Tracks word timings across all results of a single recognition session. */
export class RecognitionTimingTracker {
  private readonly startedAt = Date.now();
  private readonly finalized = new Set<number>();
  private readonly observations = new Map<number, WordObservation[]>();
  private readonly timings: WordTiming[] = [];
  private readonly offsetSeconds: number;
  private floor = 0;

  constructor(offsetSeconds = 0) {
    this.offsetSeconds = offsetSeconds;
  }

  observe(event: RecognitionResultEventLike) {
    const now = this.offsetSeconds + (Date.now() - this.startedAt) / 1000;

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const words = tokenizeWords(result?.[0]?.transcript ?? '');

      if (result?.isFinal) {
        if (this.finalized.has(index)) continue;
        this.finalized.add(index);
        const observed = this.observations.get(index) ?? [];
        const built = buildWordTimings(words, observed, Math.max(now, this.floor), this.floor);
        this.timings.push(...built);
        if (built.length) this.floor = built[built.length - 1].end;
        this.observations.delete(index);
        continue;
      }

      const previous = this.observations.get(index) ?? [];
      this.observations.set(index, words.map((word, wordIndex) => ({
        word,
        firstSeen: previous[wordIndex]?.word === word ? previous[wordIndex].firstSeen : now
      })));
    }
  }

  getTimings(): WordTiming[] {
    return this.timings.map((timing) => ({ ...timing }));
  }
}

/** Offset local S2T timings onto a conversation's shared timeline. */
export function offsetWordTimings(timings: WordTiming[], offsetSeconds: number): WordTiming[] {
  const offset = Math.max(0, offsetSeconds);
  return timings.map((timing) => ({
    word: timing.word,
    start: round2(timing.start + offset),
    end: round2(timing.end + offset)
  }));
}
