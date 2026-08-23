import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecoverySecretPrintSheet from './RecoverySecretPrintSheet.vue';
import printSheetSource from './RecoverySecretPrintSheet.vue?raw';

const recoverySecret = 'EFR1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';

const stubs = {
  Button: {
    props: ['label'],
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')">{{ label }}</button>',
  },
};

describe('RecoverySecretPrintSheet', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a reusable branded print sheet with the instance URL', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const wrapper = mount(RecoverySecretPrintSheet, {
      props: { recoverySecret },
      global: { stubs },
    });

    const printDocument = document.body.querySelector('.recovery-secret-print-document');
    expect(printDocument?.querySelector('.print-wordmark')?.getAttribute('src')).toBe(
      '/elderflow-wordmark-color.png',
    );
    expect(printDocument?.querySelector('.print-wordmark')?.getAttribute('alt')).toBe('Elderflow');
    expect(printDocument?.querySelector('.print-instance-url')?.textContent).toContain(
      window.location.origin,
    );
    expect(wrapper.get('.recovery-secret').text()).toContain(recoverySecret);
    expect(printDocument?.querySelector('.printed-recovery-secret')?.textContent).toContain(
      recoverySecret,
    );

    await wrapper.get('button').trigger('click');

    expect(print).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('defines a print-only document that removes the surrounding application UI from layout', () => {
    expect(printSheetSource).toContain('@media print');
    expect(printSheetSource).toContain('<Teleport to="body">');
    expect(printSheetSource).toContain('body > *:not(.recovery-secret-print-document)');
    expect(printSheetSource).toContain('display: none !important');
    expect(printSheetSource).not.toContain('visibility: hidden');
  });
});
