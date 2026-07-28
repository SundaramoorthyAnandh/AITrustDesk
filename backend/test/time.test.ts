import { describe, it, expect } from 'vitest';
import { isWithinWindow, daysBetween, evaluateWindow } from '../src/domain/time.js';

/**
 * Time rule (build-prompt §1.4). These must be deterministic and independent of
 * the wall clock — every assertion uses fixed dates only.
 */
describe('isWithinWindow', () => {
  it('is true when the ticket is opened inside the window', () => {
    expect(isWithinWindow('2026-06-01T00:00:00Z', '2026-06-20T00:00:00Z', 30)).toBe(true);
  });

  it('is true exactly on the last day of the window (inclusive)', () => {
    expect(isWithinWindow('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', 30)).toBe(true);
  });

  it('is false one day past the window', () => {
    expect(isWithinWindow('2026-06-01T00:00:00Z', '2026-07-02T00:00:00Z', 30)).toBe(false);
  });

  it('is false when the ticket predates the order', () => {
    expect(isWithinWindow('2026-06-01T00:00:00Z', '2026-05-31T00:00:00Z', 30)).toBe(false);
  });

  it('does not depend on Date.now — same args always give same result', () => {
    const a = isWithinWindow('2026-01-15T00:00:00Z', '2026-07-10T00:00:00Z', 365);
    const b = isWithinWindow('2026-01-15T00:00:00Z', '2026-07-10T00:00:00Z', 365);
    expect(a).toBe(true);
    expect(b).toBe(true);
  });

  it('rejects a negative window', () => {
    expect(() => isWithinWindow('2026-06-01T00:00:00Z', '2026-06-10T00:00:00Z', -1)).toThrow();
  });

  it('throws on invalid dates', () => {
    expect(() => daysBetween('not-a-date', '2026-06-10T00:00:00Z')).toThrow();
  });
});

describe('daysBetween / evaluateWindow', () => {
  it('computes whole-day elapsed differences', () => {
    expect(daysBetween('2026-06-01T00:00:00Z', '2026-06-11T00:00:00Z')).toBe(10);
  });

  it('reports the full window evaluation', () => {
    const e = evaluateWindow('2026-05-02T09:30:00Z', '2026-07-08T11:40:00Z', 30);
    expect(e.within).toBe(false);
    expect(e.elapsedDays).toBeGreaterThan(30);
    expect(e.windowDays).toBe(30);
  });
});
