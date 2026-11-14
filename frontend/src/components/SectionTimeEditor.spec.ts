import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import SectionTimeEditor from './SectionTimeEditor.vue';

const setup = (minutes = 0, save = vi.fn().mockResolvedValue(undefined)) => mount(SectionTimeEditor, {
  props: { minutes, sectionName: 'People', save },
});

describe('inline section time', () => {
  it('deduplicates Enter and blur and accepts manually entered whole minutes', async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const editor = setup(0, save);
    expect(editor.text()).toContain('Add section time');
    await editor.get('button').trigger('click');
    await editor.get('input').setValue('17');
    await editor.get('input').trigger('keydown', { key: 'Enter' });
    await editor.get('input').trigger('blur');
    expect(save).toHaveBeenCalledExactlyOnceWith(17);
    finish();
    await vi.waitFor(() => expect(editor.find('input').exists()).toBe(false));
  });

  it('preserves a dirty draft on remote refresh, cancels without writing, and clears to zero', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const editor = setup(20, save);
    await editor.get('button').trigger('click');
    await editor.get('input').setValue('25');
    await editor.setProps({ minutes: 30 });
    expect(editor.get('input').element.value).toBe('25');
    await editor.get('input').trigger('keydown', { key: 'Escape' });
    expect(save).not.toHaveBeenCalled();
    expect(editor.text()).toContain('30 min');
    await editor.get('button').trigger('click');
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
    expect(editor.get('input').element.value).toBe('35');
    await editor.get('[role="alert"] button').trigger('click');
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
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
