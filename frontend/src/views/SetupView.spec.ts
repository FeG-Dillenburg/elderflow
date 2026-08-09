import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SetupView from './SetupView.vue';
import { installation } from '../installation';
import { Decoder } from 'cbor-x';

const createInitialKeyState = vi.hoisted(() => vi.fn());
vi.mock('../e2ee/crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../e2ee/crypto')>()),
  createInitialKeyState,
}));

const generatedKeyState = {
  recoveryText: 'EFR1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
  e2ee: {
    organizationId: '00000000-0000-4000-8000-000000000001',
    orkId: '00000000-0000-4000-8000-000000000003',
    ockId: '00000000-0000-4000-8000-000000000004',
    sharedPassphraseSlot: 'shared-wrapper',
    recoverySlot: 'recovery-wrapper',
    contentKeyWrapper: 'content-wrapper',
    custodyCopiesAcknowledged: 2 as const,
  },
};

const stubs = {
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  Button: { props: ['label'], template: '<button>{{ label }}</button>' },
  InputText: { props: ['modelValue'], template: '<input />' },
  Password: { props: ['modelValue'], template: '<input />' },
  Message: { template: '<div><slot /></div>' },
};

describe('SetupView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installation.setupRequired = true;
    installation.defaultLanguage = null;
    createInitialKeyState.mockResolvedValue(generatedKeyState);
  });

  it('shows the colorful Elderflow wordmark', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ setupRequired: true, defaultLanguage: null }),
    }));
    const wrapper = mount(SetupView, { global: { stubs } });

    expect(wrapper.get('.brand-wordmark').attributes()).toMatchObject({
      alt: 'Elderflow',
      src: '/elderflow-wordmark-color.png',
    });
  });

  it('shows the required message when the system already has a user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ setupRequired: false, defaultLanguage: 'en' }),
    }));
    const wrapper = mount(SetupView, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('System already setup');
    expect(wrapper.html()).toContain('href="/login"');
  });

  it('verifies the startup password before displaying the first-user form', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ setupRequired: true, defaultLanguage: null }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ valid: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(SetupView, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('Setup password');

    const vm = wrapper.vm as unknown as { setupPassword: string; verifyPassword: () => Promise<void>; stage: string };
    vm.setupPassword = 'startup-password';
    await vm.verifyPassword();

    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:3000/api/setup/verify', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ setupPassword: 'startup-password' }),
    }));
    expect(vm.stage).toBe('user');
    expect(wrapper.text()).toContain('Create Recovery Secret');
  });

  it('creates browser key state, verifies two paper copies, and creates the initial user without a selectable role', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ setupRequired: true, defaultLanguage: null }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: 'user-id', role: 'superadmin' }) });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(SetupView, { global: { stubs } });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      stage: string;
      setupPassword: string;
      form: { email: string; firstName: string; lastName: string; password: string; passwordConfirmation: string; sharedPassphrase: string; sharedPassphraseConfirmation: string };
      prepareRecovery: () => Promise<void>;
      createUser: () => Promise<void>;
      firstCopyAcknowledged: boolean;
      secondCopyAcknowledged: boolean;
    };
    vm.stage = 'user';
    vm.setupPassword = 'startup-password';
    Object.assign(vm.form, {
      email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', password: 'password123!', passwordConfirmation: 'password123!',
      sharedPassphrase: 'correct horse battery staple', sharedPassphraseConfirmation: 'correct horse battery staple',
    });
    await vm.prepareRecovery();
    expect(createInitialKeyState).toHaveBeenCalledWith(
      'correct horse battery staple',
      expect.any(AbortSignal),
    );
    expect(vm.stage).toBe('recovery');
    expect(wrapper.text()).toContain(generatedKeyState.recoveryText);
    vm.firstCopyAcknowledged = true;
    vm.secondCopyAcknowledged = true;
    await vm.createUser();

    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:3000/api/setup', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/vnd.elderflow.e2ee+cbor;v=1' }),
    }));
    const setupBody = fetchMock.mock.calls[1][1].body as Uint8Array;
    const decoded = new Decoder({ mapsAsObjects: false, useRecords: false }).decode(setupBody) as unknown[];
    expect(decoded.slice(0, 6)).toEqual([
      'en', 'startup-password', 'ada@example.com', 'Ada', 'Lovelace', 'password123!',
    ]);
    expect((decoded[6] as unknown[]).slice(0, 3)).toEqual([
      generatedKeyState.e2ee.organizationId, generatedKeyState.e2ee.orkId, generatedKeyState.e2ee.ockId,
    ]);
    expect(vm.stage).toBe('complete');
    expect(installation.setupRequired).toBe(false);
    expect(installation.defaultLanguage).toBe('en');
    expect(wrapper.text()).toContain('Setup complete');
  });

  it('preselects a regional browser language and switches the setup screen immediately', async () => {
    vi.stubGlobal('navigator', { languages: ['de-CH', 'en'] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ setupRequired: true, defaultLanguage: null }),
    }));
    const wrapper = mount(SetupView, { global: { stubs } });
    await flushPromises();

    const vm = wrapper.vm as unknown as { defaultLanguage: string };
    expect(vm.defaultLanguage).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(wrapper.text()).toContain('Systemeinrichtung');
  });

  it('keeps the user form open when password confirmation differs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ setupRequired: true, defaultLanguage: null }),
    }));
    const wrapper = mount(SetupView, { global: { stubs } });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      stage: string;
      form: { password: string; passwordConfirmation: string };
      errorMessage: string;
      prepareRecovery: () => Promise<void>;
    };
    vm.stage = 'user';
    vm.form.password = 'password123!';
    vm.form.passwordConfirmation = 'different-password';
    await vm.prepareRecovery();
    expect(vm.errorMessage).toBe('Passwords do not match');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
