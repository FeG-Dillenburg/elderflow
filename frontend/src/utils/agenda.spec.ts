import { describe, expect, it } from 'vitest';
import { buildNumberedAgenda } from './agenda';
import type { AgendaSection, MeetingTopic } from '../api/domain';

describe('buildNumberedAgenda', () => {
  it('numbers sections and topics according to their stored positions', () => {
    const sections = [
      { id: 'urgent', name: 'Urgent', position: 2, isDefault: true },
      { id: 'opening', name: 'Opening', position: 1, isDefault: true },
    ] as AgendaSection[];
    const agenda = [
      { id: 'second', sectionId: 'opening', position: 2 },
      { id: 'first', sectionId: 'opening', position: 1 },
    ] as MeetingTopic[];

    const result = buildNumberedAgenda(sections, agenda);

    expect(result.map((group) => group.section.id)).toEqual(['opening', 'urgent']);
    expect(result[0].items.map((item) => [item.id, item.displayNumber])).toEqual([
      ['first', '1.1'],
      ['second', '1.2'],
    ]);
  });
});
