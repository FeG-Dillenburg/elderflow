import { mount } from '@vue/test-utils';
import PrimeVue, { usePrimeVue } from 'primevue/config';
import DatePicker from 'primevue/datepicker';
import { defineComponent, nextTick, onUnmounted } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindPrimeVueLocale, primeVueLocale, setLanguage } from '.';

describe('PrimeVue DatePicker locale synchronization', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setLanguage('en');
  });

  it('updates weekday and month labels without remounting', async () => {
    vi.stubGlobal('matchMedia', () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 17));
    setLanguage('de');
    const wrapper = mount(defineComponent({
      components: { DatePicker },
      setup() {
        const primeVue = usePrimeVue();
        onUnmounted(bindPrimeVueLocale(primeVue.config.locale!));
      },
      template: '<DatePicker inline />',
    }), {
      global: {
        plugins: [[PrimeVue, { locale: primeVueLocale }]],
      },
    });

    expect(wrapper.text()).toContain('Juli');
    expect(wrapper.text()).toContain('So');

    setLanguage('en');
    await nextTick();

    expect(wrapper.text()).toContain('July');
    expect(wrapper.text()).toContain('Su');
    expect(wrapper.text()).not.toContain('Juli');
    expect(wrapper.text()).not.toContain('So');
    wrapper.unmount();
  });
});
