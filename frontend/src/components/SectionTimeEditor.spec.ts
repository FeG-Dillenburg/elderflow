import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import PrimeVue from 'primevue/config';
import InputNumber from 'primevue/inputnumber';
import SectionTimeEditor from './SectionTimeEditor.vue';

enableAutoUnmount(afterEach);

const setup = (minutes = 0, save = vi.fn().mockResolvedValue(undefined)) => mount(SectionTimeEditor, {
  attachTo: document.body,
  props: { minutes, sectionName: 'People', save },
  global: { plugins: [PrimeVue] },
});

describe('inline section time', () => {
  it('uses the same PrimeVue numeric control settings as Topic duration', async () => {
    const editor = setup(20);
    await editor.get('button').trigger('click');
    const control = editor.getComponent(InputNumber);
    expect(control.props()).toMatchObject({
      min: 0, step: 5, showButtons: true, size: 'small', suffix: ' min.',
    });
    expect(editor.get('input').classes()).toContain('p-inputnumber-input');
    expect(editor.get('input').attributes('aria-label')).toBe('Section time in minutes for People');
    expect(document.activeElement).toBe(editor.get('input').element);
  });

  it('steps by five through PrimeVue and saves the stepped value on blur', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const editor = setup(20, save);
    await editor.get('button').trigger('click');
    await editor.get('input').trigger('keydown', { key: 'ArrowUp', code: 'ArrowUp' });
    expect(editor.get('input').element.value).toBe('25 min.');
    expect(save).not.toHaveBeenCalled();
    await editor.get('input').trigger('blur');
    expect(save).toHaveBeenCalledExactlyOnceWith(25);
  });

  it('accepts manual whole minutes through PrimeVue keyboard input', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const editor = setup(0, save);
    await editor.get('button').trigger('click');
    await editor.get('input').trigger('keypress', { key: '1', code: 'Digit1' });
    await editor.get('input').trigger('keypress', { key: '7', code: 'Digit7' });
    expect(editor.get('input').element.value).toBe('17 min.');
    await editor.get('input').trigger('keydown', { key: 'Enter', code: 'Enter' });
    expect(save).toHaveBeenCalledExactlyOnceWith(17);
  });

  it.each([
    ['Home', 0],
    ['End', 2147483647],
  ] as const)('saves the displayed value after PrimeVue %s', async (key, expected) => {
    const save = vi.fn().mockResolvedValue(undefined);
    const editor = setup(20, save);
    await editor.get('button').trigger('click');
    await editor.get('input').trigger('keydown', { key, code: key });
    await editor.get('input').trigger('blur');
    expect(save).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('does not save an invalid draft clamped by PrimeVue on Tab', async () => {
    const save = vi.fn();
    const editor = setup(20, save);
    await editor.get('button').trigger('click');
    await editor.get('input').setValue('2147483648');
    await editor.get('input').trigger('keydown', { key: 'Tab', code: 'Tab' });
    await editor.get('input').trigger('blur');
    expect(save).not.toHaveBeenCalled();
    expect(editor.get('[role="alert"]').text()).toContain('Enter whole minutes');
    expect(editor.get('input').element.value).toBe('2147483648 min.');
  });

  it('deduplicates Enter and blur and accepts manually entered whole minutes', async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const editor = setup(0, save);
    expect(editor.text()).toContain('Add section time');
    await editor.get('button').trigger('click');
    await editor.get('input').setValue('17');
    const input = editor.get('input');
    await Promise.all([
      input.trigger('keydown', { key: 'Enter' }),
      input.trigger('blur'),
    ]);
    expect(save).toHaveBeenCalledExactlyOnceWith(17);
    expect(editor.find('input').exists()).toBe(false);
    expect(editor.get('[role="status"]').text()).toBe('Saving…');
    expect(editor.find('button').exists()).toBe(false);
    await editor.setProps({ minutes: 17 });
    finish();
    await vi.waitFor(() => expect(editor.find('[role="status"]').exists()).toBe(false));
    expect(editor.get('button').text()).toBe('Section time: 17 min');
  });

  it('preserves a dirty draft on remote refresh, cancels without writing, and clears to zero', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const editor = setup(20, save);
    await editor.get('button').trigger('click');
    await editor.get('input').setValue('25');
    await editor.setProps({ minutes: 30 });
    expect(editor.get('input').element.value).toBe('25 min.');
    await editor.get('input').trigger('keydown', { key: 'Escape' });
    expect(save).not.toHaveBeenCalled();
    expect(editor.text()).toContain('30 min');
    await editor.get('button').trigger('click');
    expect(document.activeElement).toBe(editor.get('input').element);
    await editor.get('input').setValue('');
    await editor.get('input').trigger('blur');
    expect(save).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('retains failed drafts and offers an explicit retry without blur retrying', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const editor = setup(20, save);
    await editor.get('button').trigger('click');
    await editor.get('input').setValue('35');
    await editor.get('input').trigger('keydown', { key: 'Enter' });
    await vi.waitFor(() => expect(editor.find('[role="alert"]').exists()).toBe(true));
    await editor.get('input').trigger('blur');
    expect(save).toHaveBeenCalledTimes(1);
    expect(editor.get('input').element.value).toBe('35 min.');
    await editor.get('[role="alert"] button').trigger('click');
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });

  it('retains invalid input after a failed save remounts the editor', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline'));
    const editor = setup(20, save);
    await editor.get('button').trigger('click');
    await editor.get('input').setValue('35');
    await editor.get('input').trigger('keydown', { key: 'Enter' });
    await vi.waitFor(() => expect(editor.find('[role="alert"]').exists()).toBe(true));
    await editor.get('input').setValue('-5');
    await editor.get('input').trigger('blur');
    expect(save).toHaveBeenCalledTimes(1);
    expect(editor.get('[role="alert"]').text()).toContain('Enter whole minutes');
    expect(editor.get('input').element.value).toBe('-5 min.');
  });

  it.each(['-5', '2.5', '2147483648'])('rejects invalid minutes %s and respects authorization loss', async (draft) => {
    const save = vi.fn();
    const editor = setup(20, save);
    await editor.get('button').trigger('click');
    await editor.get('input').setValue(draft);
    await editor.get('input').trigger('blur');
    expect(save).not.toHaveBeenCalled();
    expect(editor.find('[role="alert"]').exists()).toBe(true);
    await editor.get('input').setValue('25');
    await editor.setProps({ disabled: true });
    await editor.get('input').trigger('blur');
    expect(save).not.toHaveBeenCalled();
  });

  it('does not interpret an invalid empty browser value as clearing the allowance', async () => {
    const save = vi.fn();
    const editor = setup(20, save);
    await editor.get('button').trigger('click');
    Object.defineProperty(editor.get('input').element, 'validity', { value: { badInput: true } });
    await editor.get('input').setValue('');
    await editor.get('input').trigger('blur');
    await nextTick();
    expect(save).not.toHaveBeenCalled();
  });
});
