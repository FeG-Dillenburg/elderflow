import { describe, expect, it } from 'vitest';
import type { MeetingTopic } from '../api/domain';
import { sectionTiming, meetingMinutes, plannedEnd } from './agenda-timing';

const items = [
  { sectionId: 'people', topic: { type: 'person' }, plannedDuration: 99 },
  { sectionId: 'people', topic: { type: 'generic' }, plannedDuration: 15 },
  { sectionId: 'other', topic: { type: 'recurring' }, plannedDuration: 40 },
  { sectionId: 'other', topic: { type: 'new_membership' }, plannedDuration: null },
] as MeetingTopic[];

describe('Agenda planned timing', () => {
  it('adds allowances once, including empty sections, and ignores untimed Topic types', () => {
    const timings = [{ sectionId: 'people', minutes: 20 }, { sectionId: 'empty', minutes: 10 }];
    expect(sectionTiming('people', items, timings)).toEqual({ allowance: 20, topics: 15, total: 35 });
    expect(sectionTiming('empty', items, timings).total).toBe(10);
    expect(sectionTiming('missing', [], []).total).toBe(0);
    expect(meetingMinutes(items, timings)).toBe(85);
    expect(meetingMinutes(items.map((item) => ({ ...item, sectionId: 'other' })), timings)).toBe(85);
  });
});

describe('scheduled wall-clock end', () => {
  it('handles midnight and multiple days using minutes without timezone conversion', () => {
    expect(plannedEnd('19:30:00', 95)).toEqual({ time: '21:05', days: 0 });
    expect(plannedEnd('23:45', 30)).toEqual({ time: '00:15', days: 1 });
    expect(plannedEnd('23:45', 2910)).toEqual({ time: '00:15', days: 3 });
    expect(plannedEnd('19:30', 0)).toBeNull();
  });
});
