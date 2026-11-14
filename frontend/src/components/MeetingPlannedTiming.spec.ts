import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage, formatTime } from '../i18n';
import type { Meeting } from '../api/domain';
import MeetingPlannedTiming from './MeetingPlannedTiming.vue';
import SectionTimeTotal from './SectionTimeTotal.vue';

afterEach(() => setLanguage('en'));

describe('planned Meeting timing presentation', () => {
  it.each(['en', 'de'] as const)('shows the scheduled multi-day end and planned label in %s', async (language) => {
    setLanguage(language);
    const meeting = { beginTime: '23:45', agenda: [], sectionTimes: [{ sectionId: 'empty', minutes: 1470 }] } as unknown as Meeting;
    const wrapper = mount(MeetingPlannedTiming, { props: { meeting } });
    expect(wrapper.text()).toContain(`${formatTime('23:45')}–${formatTime('00:15')}`);
    expect(wrapper.text()).toContain(language === 'de' ? '(+2 Tage)' : '(+2 days)');
    expect(wrapper.text()).toContain(language === 'de' ? '1470 Min. geplant' : '1470 min planned');
    await wrapper.setProps({ meeting: { ...meeting, sectionTimes: [] } });
    expect(wrapper.text()).not.toContain('–');
    expect(wrapper.text()).toContain(language === 'de' ? '0 Min. geplant' : '0 min planned');
    wrapper.unmount();
  });

  it('shows the formula in a native tooltip with a keyboard-accessible description', () => {
    const wrapper = mount(SectionTimeTotal, { props: { timing: { allowance: 20, topics: 15, total: 35 } } });
    const total = wrapper.get('.section-time-total');
    expect(total.text()).toBe('35 min.');
    expect(total.attributes('title')).toBe('20 min section time + 15 min Topic time');
    expect(total.attributes('aria-description')).toBe(total.attributes('title'));
    expect(total.attributes('tabindex')).toBe('0');
    expect(wrapper.find('button, input, i').exists()).toBe(false);
    wrapper.unmount();
  });
});
