import { reactive } from 'vue';
import type { MeetingSuggestion, MeetingTopic } from '../api/domain';
import type { TourStep } from './registry';

export const meetingPractice = reactive({
  topicId: null as string | null,
  appearanceId: null as string | null,
  path: 'existing' as 'existing' | 'new',
  person: false,
  duration: true,
});

export function resetMeetingPractice(): void {
  Object.assign(meetingPractice, { topicId: null, appearanceId: null, path: 'existing', person: false, duration: true });
}

/** Select only normally available Topics with ordinary manual removal semantics. */
export function chooseMeetingPractice(suggestions: MeetingSuggestion[], agenda: MeetingTopic[]): MeetingSuggestion | undefined {
  const available = suggestions.filter((topic) => !agenda.some((item) => item.topicId === topic.id)
    && topic.type !== 'recurring');
  const topic = available.find((topic) => topic.type !== 'person') ?? available[0];
  meetingPractice.topicId = topic?.id ?? null;
  meetingPractice.person = topic?.type === 'person';
  meetingPractice.path = topic ? 'existing' : 'new';
  return topic;
}

export const meetingPreparationSteps: readonly TourStep[] = [
  { id: 'create-basics', target: 'meeting-create-basics', mode: 'explanation', descriptionKey: 'tours.meetingSteps.create-basics', side: 'top', skippable: false, interactive: true },
  { id: 'create-date', target: 'meeting-create-date', mode: 'action', descriptionKey: 'tours.meetingSteps.create-date', side: 'top', skippable: false, interactive: true },
  { id: 'create-leader', target: 'meeting-create-leader', mode: 'action', descriptionKey: 'tours.meetingSteps.create-leader', side: 'top', skippable: false, interactive: true },
  { id: 'create-minute-taker', target: 'meeting-create-minute-taker', mode: 'action', descriptionKey: 'tours.meetingSteps.create-minute-taker', side: 'top', skippable: false, interactive: true },
  { id: 'create-submit', target: 'meeting-create-submit', mode: 'action', descriptionKey: 'tours.meetingSteps.create-submit', side: 'top', skippable: false, interactive: true },
  { id: 'agenda-overview', target: 'preparation-agenda', mode: 'explanation', descriptionKey: 'tours.meetingSteps.agenda-overview', side: 'top', skippable: false, interactive: true },
  { id: 'section-time', target: 'preparation-section-time', mode: 'explanation', descriptionKey: 'tours.meetingSteps.section-time', side: 'top', skippable: false, interactive: true },
  { id: 'sidebar-overview', target: 'preparation-topic-sidebar', mode: 'explanation', descriptionKey: 'tours.meetingSteps.sidebar-overview', side: 'top', skippable: false, interactive: true },
  { id: 'practice-create-open', target: 'preparation-create-topic', mode: 'action', descriptionKey: 'tours.meetingSteps.practice-create-open', side: 'top', skippable: false, interactive: true },
  { id: 'practice-create-name', target: 'preparation-topic-name', mode: 'action', descriptionKey: 'tours.meetingSteps.practice-create-name', side: 'top', skippable: false, interactive: true },
  { id: 'practice-create-section', target: 'preparation-topic-section', mode: 'explanation', descriptionKey: 'tours.meetingSteps.practice-create-section', side: 'top', skippable: false, interactive: true },
  { id: 'practice-create-description', target: 'preparation-topic-description', mode: 'explanation', descriptionKey: 'tours.meetingSteps.practice-create-description', side: 'top', skippable: false, interactive: true },
  { id: 'practice-create-submit', target: 'preparation-topic-create-submit', mode: 'action', descriptionKey: 'tours.meetingSteps.practice-create-submit', side: 'top', skippable: false, interactive: true },
  { id: 'practice-preview', target: 'preparation-practice-preview', mode: 'action', descriptionKey: 'tours.meetingSteps.practice-preview', side: 'top', skippable: false, interactive: true },
  { id: 'practice-select', target: 'preparation-practice-select', mode: 'action', descriptionKey: 'tours.meetingSteps.practice-select', side: 'top', skippable: false, interactive: true },
  { id: 'practice-scroll-selection', target: 'preparation-topic-sidebar', mode: 'action', descriptionKey: 'tours.meetingSteps.practice-scroll-selection', side: 'top', skippable: false, interactive: true },
  { id: 'practice-add-selection', target: 'preparation-add-selected', mode: 'action', descriptionKey: 'tours.meetingSteps.practice-add-selection', side: 'top', skippable: false, interactive: true },
  { id: 'practice-duration', target: 'preparation-practice-duration', mode: 'explanation', descriptionKey: 'tours.meetingSteps.practice-duration', side: 'top', skippable: false, interactive: true },
  { id: 'practice-history-area', target: 'preparation-practice-history', mode: 'explanation', descriptionKey: 'tours.meetingSteps.practice-history-area', side: 'top', skippable: false, interactive: true },
  { id: 'practice-context', target: 'preparation-practice-context', mode: 'explanation', descriptionKey: 'tours.meetingSteps.practice-context', side: 'top', skippable: false, interactive: true },
  { id: 'practice-drag', target: 'preparation-practice-drag', mode: 'explanation', descriptionKey: 'tours.meetingSteps.practice-drag', side: 'top', skippable: false, interactive: true },
  { id: 'practice-remove', target: 'preparation-practice-remove', mode: 'action', descriptionKey: 'tours.meetingSteps.practice-remove', side: 'top', skippable: false, interactive: true },
  { id: 'practice-reselect', target: 'preparation-practice-select', mode: 'action', descriptionKey: 'tours.meetingSteps.practice-reselect', side: 'top', skippable: false, interactive: true },
  { id: 'practice-readd', target: 'preparation-add-selected', mode: 'action', descriptionKey: 'tours.meetingSteps.practice-readd', side: 'top', skippable: false, interactive: true },
  { id: 'details-open', target: 'preparation-edit-details', mode: 'action', descriptionKey: 'tours.meetingSteps.details-open', side: 'top', skippable: false, interactive: true },
  { id: 'details-schedule', target: 'preparation-details-schedule', mode: 'explanation', descriptionKey: 'tours.meetingSteps.details-schedule', side: 'top', skippable: false, interactive: true },
  { id: 'details-roles', target: 'preparation-details-roles', mode: 'explanation', descriptionKey: 'tours.meetingSteps.details-roles', side: 'top', skippable: false, interactive: true },
  { id: 'details-general-notes', target: 'preparation-details-general-notes', mode: 'explanation', requiresInput: true, descriptionKey: 'tours.meetingSteps.details-general-notes', side: 'top', skippable: false, interactive: true },
  { id: 'details-save', target: 'preparation-details-save', mode: 'action', descriptionKey: 'tours.meetingSteps.details-save', side: 'top', skippable: false, interactive: true },
  { id: 'details-result', target: 'preparation-general-notes-display', mode: 'explanation', descriptionKey: 'tours.meetingSteps.details-result', side: 'top', skippable: false, interactive: true },
];

// Both adaptive paths converge at the same details sequence and completion step.
const following: Record<string, string> = {
  'create-basics': 'create-date',
  'create-date': 'create-leader',
  'create-leader': 'create-minute-taker',
  'create-minute-taker': 'create-submit',
  'create-submit': 'agenda-overview',
  'agenda-overview': 'section-time',
  'section-time': 'sidebar-overview',
  'practice-create-open': 'practice-create-name',
  'practice-create-name': 'practice-create-section',
  'practice-create-section': 'practice-create-description',
  'practice-create-description': 'practice-create-submit',
  'practice-create-submit': 'practice-duration',
  'practice-preview': 'practice-select',
  'practice-select': 'practice-scroll-selection',
  'practice-scroll-selection': 'practice-add-selection',
  'practice-duration': 'practice-history-area',
  'practice-history-area': 'practice-context',
  'practice-context': 'practice-drag',
  'practice-drag': 'practice-remove',
  'practice-reselect': 'practice-readd',
  'practice-readd': 'details-open',
  'details-open': 'details-schedule',
  'details-schedule': 'details-roles',
  'details-roles': 'details-general-notes',
  'details-general-notes': 'details-save',
  'details-save': 'details-result',
};
export function nextMeetingStep(id: string): string | undefined {
  if (id === 'sidebar-overview') return meetingPractice.path === 'existing' ? 'practice-preview' : 'practice-create-open';
  if (id === 'practice-add-selection') return meetingPractice.path === 'existing'
    ? (meetingPractice.person ? 'practice-context'
      : meetingPractice.duration ? 'practice-duration' : 'practice-history-area') : 'details-open';
  if (id === 'practice-remove') return meetingPractice.path === 'existing' ? 'practice-reselect' : 'practice-preview';
  return following[id];
}
