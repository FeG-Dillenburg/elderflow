import type { MeetingTopic } from '../api/domain';
import { topicUsesPlannedDuration } from '../topics/topicTypeRegistry';

export interface SectionTime {
  sectionId: string;
  minutes: number;
}
export const MAX_SECTION_MINUTES = 2147483647;
export const validSectionMinutes = (value: number) =>
  Number.isInteger(value) && value >= 0 && value <= MAX_SECTION_MINUTES;

const topicMinutes = (items: readonly MeetingTopic[]) => items.reduce((sum, item) =>
  sum + (topicUsesPlannedDuration(item.topic?.type ?? '') ? item.plannedDuration ?? 0 : 0), 0);

export function sectionTiming(sectionId: string, items: readonly MeetingTopic[], times: readonly SectionTime[] = []) {
  const allowance = times.find((time) => time.sectionId === sectionId)?.minutes ?? 0;
  const topics = topicMinutes(items.filter((item) => item.sectionId === sectionId));
  return { allowance, topics, total: allowance + topics };
}

export const meetingMinutes = (items: readonly MeetingTopic[], times: readonly SectionTime[] = []) =>
  topicMinutes(items) + times.reduce((sum, time) => sum + time.minutes, 0);

// Scheduled times are local wall-clock values, so arithmetic must not pass through Date/UTC.
export function plannedEnd(beginTime: string, minutes: number) {
  if (!minutes) return null;
  const [hours, startMinutes] = beginTime.split(':').map(Number);
  const total = hours! * 60 + startMinutes! + minutes;
  const clock = total % 1440;
  return {
    time: `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`,
    days: Math.floor(total / 1440),
  };
}
