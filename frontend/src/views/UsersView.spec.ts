import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UsersView from './UsersView.vue';

describe('UsersView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and displays users from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          {
            id: '7b404cf4-1df2-4ada-b163-df8734df2d4f',
            email: 'alex@example.com',
            firstName: 'Alex',
            lastName: 'Smith',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      }),
    );

    const wrapper = mount(UsersView, {
      global: {
        stubs: {
          DataTable: { template: '<div><slot /></div>' },
          Column: { props: ['field', 'header'], template: '<span />' },
          Dialog: { template: '<div><slot /></div>' },
          Button: { props: ['label'], template: '<button>{{ label }}</button>' },
          InputText: { template: '<input />' },
          Message: { template: '<div><slot /></div>' },
        },
      },
    });

    await flushPromises();

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/users', expect.any(Object));
    expect(wrapper.text()).toContain('Users');
    const view = wrapper.vm as unknown as { users: Array<{ email: string }> };
    expect(view.users).toEqual(expect.arrayContaining([expect.objectContaining({ email: 'alex@example.com' })]));
  });
});
