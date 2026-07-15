import type { AgendaSection, MeetingTopic } from '../api/domain';

export interface NumberedAgendaGroup {
  section: AgendaSection;
  number: number;
  items: Array<MeetingTopic & { displayNumber: string }>;
}

export function buildNumberedAgenda(sections: AgendaSection[], agenda: MeetingTopic[]): NumberedAgendaGroup[] {
  return [...sections]
    .sort((left, right) => left.position - right.position)
    .map((section, sectionIndex) => ({
      section,
      number: sectionIndex + 1,
      items: agenda
        .filter((item) => item.sectionId === section.id)
        .sort((left, right) => left.position - right.position)
        .map((item, itemIndex) => ({ ...item, displayNumber: `${sectionIndex + 1}.${itemIndex + 1}` })),
    }));
}
