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
  sessionClear: vi.fn(),
  createKeyCandidate: vi.fn(),
  startKey: vi.fn(),
  active: vi.fn(),
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
    e2eeActiveKeyCeremony: recovery.active,
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
    clear: recovery.sessionClear,
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
  InputText: { props: ['modelValue', 'invalid', 'readonly'], template: '<input :aria-invalid="invalid ? \'true\' : \'false\'" :readonly="readonly" />' },
  Password: { props: ['modelValue', 'invalid'], template: '<input :aria-invalid="invalid ? \'true\' : \'false\'" />' },
  Message: { template: '<div><slot /></div>' },
};

describe('RecoveryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recovery.metadata.mockResolvedValue(metadata);
    recovery.active.mockResolvedValue(null);
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
    await flushPromises();

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
    expect(wrapper.text()).toContain('Possibly disclosed');
    expect(wrapper.text()).toContain('Other options');
    const situationCards = wrapper.findAll('.situation-card');
    expect(situationCards.at(-1)?.attributes('data-situation')).toBe('root-rotation');
    const chooserText = wrapper.get('.situation-list').text();
    expect(chooserText.indexOf('Possibly disclosed')).toBeLessThan(
      chooserText.indexOf('Our shared passphrase may have been disclosed.'),
    );
    expect(chooserText.indexOf('Other options')).toBeLessThan(
      chooserText.indexOf('We want to rotate the Organization Root Key.'),
    );
    expect(chooserText.indexOf('An encryption key may have been disclosed.')).toBeLessThan(
      chooserText.indexOf('Other options'),
    );
    expect(wrapper.find('.recovery-columns').exists()).toBe(false);

    const lostPassphrase = wrapper.find('[data-situation="lost-passphrase"]');
    await lostPassphrase.trigger('click');

    expect(wrapper.find('.recovery-columns').exists()).toBe(true);
    expect(wrapper.findAll('.recovery-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('Recover shared passphrase');
    expect(wrapper.text()).not.toContain('Second-operator approval');
    expect(wrapper.get('header').text()).toContain('This uses your Recovery Secret');
    expect(wrapper.get('header').text()).not.toContain('Two distinct Key operators');
    expect(wrapper.get('.ceremony-requirements').text()).toContain('Two distinct Key operators');
    expect(wrapper.html().indexOf('recovery-card')).toBeLessThan(
      wrapper.html().indexOf('ceremony-requirements'),
    );
  });

  it.each([
    ['lost-passphrase', 'uses your Recovery Secret to create a new shared passphrase'],
    ['routine-passphrase', 'replaces the shared passphrase after someone leaves'],
    ['routine-access-change', 'replaces the shared passphrase after team access changes'],
    ['lost-recovery-secret', 'creates a new Recovery Secret and invalidates the lost one'],
    ['routine-recovery-secret', 'replaces the Recovery Secret because responsibility for its paper copies changed'],
    ['root-rotation', 'renews the organization’s internal protection'],
    ['disclosed-passphrase', 'replaces the disclosed passphrase, Recovery Secret, and encryption keys'],
    ['disclosed-recovery-secret', 'replaces the disclosed Recovery Secret, shared passphrase, and encryption keys'],
    ['disclosed-encryption-key', 'New changes use new keys'],
  ])('explains the consequences of the %s situation', async (situation, explanation) => {
    const wrapper = mount(RecoveryView, { global: { stubs } });
    await flushPromises();

    await wrapper.get(`[data-situation="${situation}"]`).trigger('click');

    expect(wrapper.get('header').text()).toContain(explanation);
  });

  it.each([
    'lost-recovery-secret',
    'routine-recovery-secret',
    'disclosed-passphrase',
    'disclosed-recovery-secret',
    'disclosed-encryption-key',
  ])('explains the paper-copy requirement for %s', async (situation) => {
    const wrapper = mount(RecoveryView, { global: { stubs } });
    await flushPromises();

    await wrapper.get(`[data-situation="${situation}"]`).trigger('click');

    expect(wrapper.get('header').text()).toContain(
      'verify and safely store two separate paper copies',
    );
  });

  it('opens a routine passphrase-change workflow with situation-specific inputs', async () => {
    const wrapper = mount(RecoveryView, { global: { stubs } });
    await flushPromises();

    await wrapper.get('[data-situation="routine-passphrase"]').trigger('click');

    expect(wrapper.text()).toContain('Change the shared passphrase');
    expect(wrapper.text()).toContain('Current shared passphrase');
    expect(wrapper.text()).toContain('New shared passphrase');
    expect(wrapper.text()).not.toContain('Recovery Secret may have been disclosed');
  });

  it('exposes a distinct routine access-change workflow', async () => {
    const wrapper = mount(RecoveryView, { global: { stubs } });
    await flushPromises();

    await wrapper.get('[data-situation="routine-access-change"]').trigger('click');

    expect(wrapper.text()).toContain('Change the shared passphrase after an access change');
    expect(wrapper.text()).toContain('Current shared passphrase');
    expect(wrapper.text()).toContain('New shared passphrase');
  });

  it('shows only the matching approval panel when another operator has an active ceremony', async () => {
    recovery.active.mockResolvedValue({
      id: 'active-ceremony-id',
      operation: 'change_passphrase',
      reasonCode: 'team_member_left',
      state: 'pending_second_operator',
      expiresAt: '2026-08-10T20:00:00.000Z',
      participantRole: null,
    });
    const wrapper = mount(RecoveryView, { global: { stubs } });

    await flushPromises();

    expect(wrapper.findAll('.recovery-card')).toHaveLength(1);
    expect(wrapper.text()).toContain('Second-operator approval');
    expect(wrapper.text()).toContain('Proposed new shared passphrase');
    expect(wrapper.text()).not.toContain('Prepare candidate');
    expect(wrapper.find('input[readonly]').exists()).toBe(true);
    const vm = wrapper.vm as unknown as {
      genericApproveForm: { ceremonyId: string };
    };
    expect(vm.genericApproveForm.ceremonyId).toBe('active-ceremony-id');
  });

  it('does not flash the ceremony chooser while active state is loading', async () => {
    let resolveActive!: (value: null) => void;
    recovery.active.mockReturnValue(new Promise((resolve) => {
      resolveActive = resolve;
    }));
    const wrapper = mount(RecoveryView, { global: { stubs } });

    expect(wrapper.find('.situation-list').exists()).toBe(false);

    resolveActive(null);
    await flushPromises();

    expect(wrapper.find('.situation-list').exists()).toBe(true);
  });

  it('does not resume a ceremony when the active lookup finishes after unmount', async () => {
    let resolveActive!: (value: {
      id: string;
      operation: 'change_passphrase';
      reasonCode: 'team_member_left';
      state: 'pending_second_operator';
      expiresAt: string;
      participantRole: 'initiator';
    }) => void;
    recovery.active.mockReturnValue(new Promise((resolve) => {
      resolveActive = resolve;
    }));
    const wrapper = mount(RecoveryView, { global: { stubs } });

    wrapper.unmount();
    resolveActive({
      id: 'late-ceremony-id',
      operation: 'change_passphrase',
      reasonCode: 'team_member_left',
      state: 'pending_second_operator',
      expiresAt: '2026-08-10T20:00:00.000Z',
      participantRole: 'initiator',
    });
    await flushPromises();

    expect(recovery.sessionSet).not.toHaveBeenCalled();
  });

  it('refreshes an already-open page when another operator starts a ceremony', async () => {
    recovery.active
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'new-ceremony-id',
        operation: 'change_passphrase',
        reasonCode: 'routine_access_change',
        state: 'pending_second_operator',
        expiresAt: '2026-08-10T20:00:00.000Z',
        participantRole: null,
      });
    const wrapper = mount(RecoveryView, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find('.situation-list').exists()).toBe(true);

    const vm = wrapper.vm as unknown as {
      refreshActiveCeremony: () => Promise<void>;
    };
    await vm.refreshActiveCeremony();

    expect(wrapper.find('.situation-list').exists()).toBe(false);
    expect(wrapper.text()).toContain('Second-operator approval');
  });

  it('clears participant state when the active ceremony disappears', async () => {
    recovery.active
      .mockResolvedValueOnce({
        id: 'expiring-ceremony-id',
        operation: 'change_passphrase',
        reasonCode: 'team_member_left',
        state: 'pending_second_operator',
        expiresAt: '2026-08-10T20:00:00.000Z',
        participantRole: 'initiator',
      })
      .mockResolvedValueOnce(null);
    const wrapper = mount(RecoveryView, { global: { stubs } });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      refreshActiveCeremony: () => Promise<void>;
      activeCeremonyId: string | null;
      selectedSituation: string | null;
    };

    await vm.refreshActiveCeremony();

    expect(recovery.sessionClear).toHaveBeenCalled();
    expect(vm.activeCeremonyId).toBeNull();
    expect(vm.selectedSituation).toBeNull();
    expect(wrapper.find('.situation-list').exists()).toBe(true);
  });

  it('does not offer approval to a third operator after approval is complete', async () => {
    recovery.active.mockResolvedValue({
      id: 'ready-ceremony-id',
      operation: 'change_passphrase',
      reasonCode: 'team_member_left',
      state: 'ready_to_activate',
      expiresAt: '2026-08-10T20:00:00.000Z',
      participantRole: null,
    });
    const wrapper = mount(RecoveryView, { global: { stubs } });
    await flushPromises();

    expect(wrapper.find('.recovery-card').exists()).toBe(false);
    expect(wrapper.text()).toContain('This ceremony already has two operators');
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
    await flushPromises();
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
    recovery.active.mockResolvedValue({
      id: 'ceremony-id',
      operation: 'lost_passphrase',
      reasonCode: 'passphrase_lost',
      state: 'pending_second_operator',
      expiresAt: '2026-08-10T20:00:00.000Z',
      participantRole: null,
    });
    const wrapper = mount(RecoveryView, { global: { stubs } });
    await flushPromises();
    expect(wrapper.find('input[readonly]').exists()).toBe(true);
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
