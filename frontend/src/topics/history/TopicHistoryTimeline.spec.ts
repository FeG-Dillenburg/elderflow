import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { TopicHistoryEntry } from '../../api/domain';
import TopicHistoryTimeline from './TopicHistoryTimeline.vue';

const meeting = {
  id: 'meeting',
  title: 'Council',
  date: '2026-07-15',
  beginTime: '20:00:00',
  status: 'completed',
  minuteTakerDisplayName: 'Ada Lovelace',
};

describe('TopicHistoryTimeline', () => {
  const options = {
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
  };

  it('renders mixed semantic entries in contract order and keeps Meeting contents together', () => {
    const longNote = `<p>${'Long historical context '.repeat(30)}</p>`;
    const entries: TopicHistoryEntry[] = [
      {
        id: 'update',
        kind: 'standalone_update',
        effectiveAt: '2026-07-16T09:00:00Z',
        updateId: 'update',
        text: '<p>Standalone progress</p>',
        createdByDisplayName: 'Ada Lovelace',
      },
      {
        id: 'appearance',
        kind: 'meeting_appearance',
        effectiveAt: '2026-07-15T20:00:00',
        deferredAt: null,
        appearanceId: 'appearance',
        meeting,
        section: { id: 'section', name: 'People' },
        topic: {
          type: 'new_membership',
          name: 'Recorded family',
          responsibleUserDisplayName: 'Grace Hopper',
          membershipProcessStatus: 'Welcome planned',
          membershipStatusSignal: 'nearly_finished',
          godparents: 'Alex and Robin',
        },
        preparationContext: longNote,
        personNote: null,
        legacyMinutesEntries: [
          { id: 'first', effectiveAt: '2026-07-15T20:10:00Z', text: '<p>First minute</p>', createdByDisplayName: null },
        ],
        meetingMinutes: { id: 'second', effectiveAt: '2026-07-15T20:20:00Z', text: '<p>Second minute</p>', createdByDisplayName: 'Ada Lovelace' },
      },
      {
        id: 'skip',
        kind: 'skipped_recurrence',
        effectiveAt: '2026-07-01T20:00:00',
        skippedRecurrenceId: 'skip',
        meeting: { ...meeting, id: 'skipped', title: null, date: '2026-07-01' },
      },
    ];

    const wrapper = mount(TopicHistoryTimeline, { props: { entries }, ...options });
    const text = wrapper.text();

    expect(text.indexOf('Standalone progress')).toBeLessThan(text.indexOf('Council'));
    expect(text.indexOf('Council')).toBeLessThan(text.indexOf('Skipped recurrence'));
    expect(text.indexOf('Long historical context')).toBeLessThan(text.indexOf('First minute'));
    expect(text.indexOf('First minute')).toBeLessThan(text.indexOf('Second minute'));
    expect(text).toContain('Minute taker: Ada Lovelace');
    expect(text).not.toContain('Preparation context');
    expect(wrapper.find('h3').exists()).toBe(false);
    expect(text).toContain('Recorded family');
    expect(text).toContain('Welcome planned');
    expect(text).toContain('Alex and Robin');
    const topicSnapshot = wrapper.get('.topic-snapshot');
    const statusPill = topicSnapshot.get('.membership-signal');
    expect(topicSnapshot.text()).toContain('Grace Hopper');
    expect(statusPill.text()).toBe('Welcome planned');
    expect(statusPill.get('.p-tag-icon').classes()).toContain('pi-check');
    expect(statusPill.attributes('aria-label')).toContain('Nearly finished');
    expect(wrapper.get('.membership-snapshot').text()).toBe('Godparent(s)Alex and Robin');
    expect(wrapper.findAll('.history-entry')).toHaveLength(3);
  });

  it('prominently marks a deferred Meeting and omits its responsible person', () => {
    const entries: TopicHistoryEntry[] = [{
      id: 'deferred-appearance',
      kind: 'meeting_appearance',
      effectiveAt: '2026-07-15T20:00:00',
      appearanceId: 'deferred-appearance',
      deferredAt: '2026-07-15T20:30:00.000Z',
      meeting,
      section: null,
      topic: {
        type: 'generic',
        name: 'Deferred topic',
        responsibleUserDisplayName: 'Grace Hopper',
        membershipProcessStatus: null,
        membershipStatusSignal: null,
        godparents: null,
      },
      preparationContext: null,
      personNote: null,
      meetingMinutes: null,
      legacyMinutesEntries: [],
    }];

    const wrapper = mount(TopicHistoryTimeline, {
      props: { entries, currentTopicName: 'Deferred topic' },
      ...options,
    });

    expect(wrapper.get('.deferred-marker').text()).toBe('Deferred');
    expect(wrapper.text()).toContain('No preparation context recorded');
    expect(wrapper.text()).toContain('No Meeting minutes recorded');
    expect(wrapper.text()).not.toContain('Responsible');
    expect(wrapper.text()).not.toContain('Grace Hopper');
    expect(wrapper.find('.topic-snapshot').exists()).toBe(false);
  });

  it.each([
    'generic',
    'person',
    'recurring',
  ] as const)('renders the %s Meeting appearance without section titles', (type) => {
    const entries: TopicHistoryEntry[] = [{
      id: type,
      kind: 'meeting_appearance',
      effectiveAt: '2026-07-15T20:00:00',
      appearanceId: type,
      deferredAt: null,
      meeting,
      section: null,
      topic: {
        type,
        name: 'Historical topic',
        responsibleUserDisplayName: null,
        membershipProcessStatus: null,
        membershipStatusSignal: null,
        godparents: null,
      },
      preparationContext: type === 'person' ? null : '<p>One appearance note</p>',
      personNote: type === 'person' ? '<p>One appearance note</p>' : null,
      meetingMinutes: null,
      legacyMinutesEntries: [],
    }];

    const wrapper = mount(TopicHistoryTimeline, { props: { entries }, ...options });

    expect(wrapper.text().match(/One appearance note/g)).toHaveLength(1);
    expect(wrapper.text()).not.toContain('Preparation context');
    expect(wrapper.text()).not.toContain('Meeting topic note');
    expect(wrapper.find('h3').exists()).toBe(false);
    expect(wrapper.findAll('.meeting-content + .minutes-list')).toHaveLength(
      type === 'person' ? 0 : 1,
    );
  });

  it('keeps legacy Meeting-linked Minutes visible for a Person appearance', () => {
    const entries: TopicHistoryEntry[] = [{
      id: 'person',
      kind: 'meeting_appearance',
      effectiveAt: '2026-07-15T20:00:00',
      appearanceId: 'person',
      deferredAt: null,
      meeting,
      section: null,
      topic: {
        type: 'person',
        name: 'Historical person',
        responsibleUserDisplayName: null,
        membershipProcessStatus: null,
        membershipStatusSignal: null,
        godparents: null,
      },
      preparationContext: null,
      personNote: '<p>One Person note</p>',
      meetingMinutes: null,
      legacyMinutesEntries: [{
        id: 'legacy',
        effectiveAt: '2026-07-15T20:10:00Z',
        text: '<p>Preserved legacy Minutes</p>',
        createdByDisplayName: null,
      }],
    }];

    const wrapper = mount(TopicHistoryTimeline, { props: { entries }, ...options });

    expect(wrapper.text()).toContain('One Person note');
    expect(wrapper.text()).toContain('Preserved legacy Minutes');
  });

  it('shows the historical Topic name only when it differs from the current name', async () => {
    const entries: TopicHistoryEntry[] = [{
      id: 'appearance',
      kind: 'meeting_appearance',
      effectiveAt: '2026-07-15T20:00:00',
      appearanceId: 'appearance',
      deferredAt: null,
      meeting,
      section: null,
      topic: {
        type: 'generic',
        name: 'Historical topic',
        responsibleUserDisplayName: null,
        membershipProcessStatus: null,
        membershipStatusSignal: null,
        godparents: null,
      },
      preparationContext: null,
      personNote: null,
      meetingMinutes: null,
      legacyMinutesEntries: [],
    }];
    const wrapper = mount(TopicHistoryTimeline, {
      props: {
        entries,
        currentTopicName: 'Historical topic',
      },
      ...options,
    });

    expect(wrapper.text()).not.toContain('Topic at this Meeting');
    expect(wrapper.text()).not.toContain('Historical topic');

    await wrapper.setProps({ currentTopicName: 'Renamed topic' });

    expect(wrapper.text()).toContain('Topic at this Meeting');
    expect(wrapper.text()).toContain('Historical topic');
  });

  it('renders localized loading and empty states', async () => {
    const wrapper = mount(TopicHistoryTimeline, {
      props: { entries: [], loading: true },
    });
    expect(wrapper.text()).toContain('Loading Topic history');

    await wrapper.setProps({ loading: false });
    expect(wrapper.text()).toContain('No Topic history has been recorded');

    await wrapper.setProps({ error: 'Unable to load Topic history' });
    expect(wrapper.get('[role="alert"]').text()).toContain('Unable to load Topic history');
  });
});
