import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecoveryView from './RecoveryView.vue';

const recovery = vi.hoisted(() => ({
  metadata: vi.fn(),
  start: vi.fn(),
  ceremony: vi.fn(),
  approve: vi.fn(),
  createCandidate: vi.fn(),
  verifyCandidate: vi.fn(),
  sessionSet: vi.fn(),
  createKeyCandidate: vi.fn(),
  startKey: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../api/domain', () => ({
  api: {
    e2eeRecoveryMetadata: recovery.metadata,
    startE2eeRecovery: recovery.start,
    e2eeRecoveryCeremony: recovery.ceremony,
    approveE2eeRecovery: recovery.approve,
    startE2eeKeyCeremony: recovery.startKey,
    e2eeKeyCeremony: vi.fn(),
    approveE2eeKeyCeremony: vi.fn(),
    activateE2eeKeyCeremony: vi.fn(),
  },
}));

vi.mock('../e2ee/crypto', () => ({
  createRecoveryCandidate: recovery.createCandidate,
  verifyRecoveryCandidate: recovery.verifyCandidate,
  createKeyCeremonyCandidate: recovery.createKeyCandidate,
  verifyKeyCeremonyCandidate: vi.fn(),
}));

vi.mock('../e2ee/recovery-session', () => ({
  recoverySession: {
    set: recovery.sessionSet,
    clear: vi.fn(),
    abort: vi.fn(),
  },
}));

const canonicalSecret = 'EFR1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const metadata = { generation: 1 };
const candidate = {
  candidateFingerprint: 'fingerprint',
  candidateSharedPassphraseSlot: 'candidate-slot',
};

const stubs = {
  Button: { props: ['label'], template: '<button>{{ label }}</button>' },
  InputText: { props: ['modelValue', 'invalid'], template: '<input :aria-invalid="invalid ? \'true\' : \'false\'" />' },
  Password: { props: ['modelValue', 'invalid'], template: '<input :aria-invalid="invalid ? \'true\' : \'false\'" />' },
  Message: { template: '<div><slot /></div>' },
};

describe('RecoveryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recovery.metadata.mockResolvedValue(metadata);
    recovery.createCandidate.mockImplementation((secret: string) => (
      secret === canonicalSecret
        ? Promise.resolve(candidate)
        : Promise.reject(new Error('E2EE_RECOVERY_FAILED'))
    ));
    recovery.start.mockResolvedValue({
      id: 'ceremony-id',
      state: 'pending_second_operator',
      expiresAt: '2026-08-10T20:00:00.000Z',
    });
  });

  it('starts with situation-based entry points and opens only the selected ceremony', async () => {
    const wrapper = mount(RecoveryView, { global: { stubs } });

    expect(wrapper.text()).toContain('What happened, and what do you want to do?');
    expect(wrapper.text()).toContain('We lost our shared passphrase and want to reset it.');
    expect(wrapper.text()).toContain('Someone left the team and we want to change the shared passphrase.');
    expect(wrapper.text()).toContain('Team access changed and we want to change the shared passphrase.');
    expect(wrapper.text()).toContain('Our Recovery Secret was lost and we want to replace it.');
    expect(wrapper.text()).toContain('Recovery Secret custody changed and we want to issue a new one.');
    expect(wrapper.text()).toContain('We want to rotate the Organization Root Key.');
    expect(wrapper.text()).toContain('Our shared passphrase may have been disclosed.');
    expect(wrapper.text()).toContain('Our Recovery Secret may have been disclosed.');
    expect(wrapper.text()).toContain('An encryption key may have been disclosed.');
    expect(wrapper.find('.recovery-columns').exists()).toBe(false);

    const lostPassphrase = wrapper.find('[data-situation="lost-passphrase"]');
    await lostPassphrase.trigger('click');

    expect(wrapper.find('.recovery-columns').exists()).toBe(true);
    expect(wrapper.text()).toContain('Recover shared passphrase');
  });

  it('opens a routine passphrase-change workflow with situation-specific inputs', async () => {
    const wrapper = mount(RecoveryView, { global: { stubs } });

    await wrapper.get('[data-situation="routine-passphrase"]').trigger('click');

    expect(wrapper.text()).toContain('Change the shared passphrase');
    expect(wrapper.text()).toContain('Current shared passphrase');
    expect(wrapper.text()).toContain('New shared passphrase');
    expect(wrapper.text()).not.toContain('Recovery Secret may have been disclosed');
  });

  it('exposes a distinct routine access-change workflow', async () => {
    const wrapper = mount(RecoveryView, { global: { stubs } });

    await wrapper.get('[data-situation="routine-access-change"]').trigger('click');

    expect(wrapper.text()).toContain('Change the shared passphrase after an access change');
    expect(wrapper.text()).toContain('Current shared passphrase');
    expect(wrapper.text()).toContain('New shared passphrase');
  });

  it('requires both paper copies to independently reproduce a new Recovery Secret', async () => {
    recovery.startKey.mockResolvedValue({
      id: 'key-ceremony-id',
      candidateFingerprint: 'fingerprint',
      expiresAt: '2026-08-10T20:00:00.000Z',
    });
    const wrapper = mount(RecoveryView, { global: { stubs } });
    const vm = wrapper.vm as unknown as {
      selectedSituation: string;
      preparedCandidate: {
        encodedCandidate: string;
        recoveryText: string;
      };
      custody: { firstCopy: string; secondCopy: string };
      startPreparedCeremony: () => Promise<void>;
    };
    vm.selectedSituation = 'routine-recovery-secret';
    vm.preparedCandidate = {
      encodedCandidate: 'candidate',
      recoveryText: canonicalSecret,
    };
    vm.custody.firstCopy = canonicalSecret;
    vm.custody.secondCopy = `${canonicalSecret.slice(0, -1)}A`;

    await vm.startPreparedCeremony();
    expect(recovery.startKey).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Both independently checked paper copies must exactly match');

    vm.custody.secondCopy = canonicalSecret;
    await vm.startPreparedCeremony();
    expect(recovery.startKey).toHaveBeenCalledWith('candidate');
  });

  it('normalizes clipboard whitespace before validating a Recovery Secret', async () => {
    const wrapper = mount(RecoveryView, { global: { stubs } });
    const vm = wrapper.vm as unknown as {
      startForm: { recoverySecret: string; passphrase: string; confirmation: string };
      startRecovery: () => Promise<void>;
    };
    Object.assign(vm.startForm, {
      recoverySecret: `  ${canonicalSecret}\n`,
      passphrase: 'new shared passphrase',
      confirmation: 'new shared passphrase',
    });

    await vm.startRecovery();
    await flushPromises();

    expect(recovery.createCandidate).toHaveBeenCalledWith(
      canonicalSecret,
      'new shared passphrase',
      metadata,
      expect.any(AbortSignal),
    );
    expect(recovery.start).toHaveBeenCalledWith({ expectedGeneration: 1, ...candidate });
    expect(wrapper.text()).toContain('ceremony-id');
    expect(wrapper.text()).toContain('Give the second Key operator ceremony ID ceremony-id.');
    expect(wrapper.text()).not.toContain('fingerprint');
  });

  it('identifies and highlights a Recovery Secret that cannot decrypt the current key state', async () => {
    const wrapper = mount(RecoveryView, { global: { stubs } });
    const vm = wrapper.vm as unknown as {
      startForm: { recoverySecret: string; passphrase: string; confirmation: string };
      startRecovery: () => Promise<void>;
    };
    Object.assign(vm.startForm, {
      recoverySecret: `${canonicalSecret.slice(0, -1)}A`,
      passphrase: 'new shared passphrase',
      confirmation: 'new shared passphrase',
    });

    await vm.startRecovery();
    await flushPromises();

    expect(recovery.start).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(
      'This Recovery Secret is invalid or does not match the current key state.',
    );
    expect(wrapper.get('[aria-invalid="true"]')).toBeTruthy();
  });

  it('rejects a short shared passphrase before starting a recovery ceremony', async () => {
    const wrapper = mount(RecoveryView, { global: { stubs } });
    const vm = wrapper.vm as unknown as {
      startForm: { recoverySecret: string; passphrase: string; confirmation: string };
      startRecovery: () => Promise<void>;
    };
    Object.assign(vm.startForm, {
      recoverySecret: canonicalSecret,
      passphrase: 'ef',
      confirmation: 'ef',
    });

    await vm.startRecovery();

    expect(recovery.metadata).not.toHaveBeenCalled();
    expect(recovery.createCandidate).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('The shared passphrase must be at least 12 characters.');
    expect(wrapper.get('[aria-invalid="true"]')).toBeTruthy();
  });

  it('rejects a short shared passphrase before approving a recovery ceremony', async () => {
    const wrapper = mount(RecoveryView, { global: { stubs } });
    const vm = wrapper.vm as unknown as {
      approveForm: { ceremonyId: string; recoverySecret: string; passphrase: string };
      approveRecovery: () => Promise<void>;
    };
    Object.assign(vm.approveForm, {
      ceremonyId: 'ceremony-id',
      recoverySecret: canonicalSecret,
      passphrase: 'ef',
    });

    await vm.approveRecovery();

    expect(recovery.metadata).not.toHaveBeenCalled();
    expect(recovery.verifyCandidate).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('The shared passphrase must be at least 12 characters.');
    expect(wrapper.get('[aria-invalid="true"]')).toBeTruthy();
  });
});
