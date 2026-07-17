import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App.vue';
import { auth } from './auth/auth';

const stubs = {
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  RouterView: true,
};
const permissions = {
  dashboard: 'manage', users: 'manage', references: 'view', meetings: 'manage', topics: 'manage', tasks: 'manage', contentSettings: 'manage', authSettings: 'hide',
} as const;

describe('App', () => {
  afterEach(() => { auth.state.user = null; });

  it('renders the current user and permitted navigation destinations', () => {
    auth.state.user = {
      id: 'user', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', role: 'admin', permissions,
    };
    const wrapper = mount(App, { global: { stubs } });
    expect(wrapper.text()).toContain('Ada Lovelace');
    expect(wrapper.text()).toContain('Admin');
    for (const path of ['/', '/meetings', '/topics', '/tasks', '/users', '/agenda-sections', '/profile']) {
      expect(wrapper.html()).toContain(`href="${path}"`);
    }
  });

  it('hides forbidden content navigation for an IT admin', () => {
    auth.state.user = {
      id: 'it', email: 'it@example.com', firstName: 'Ivy', lastName: 'Tech', role: 'it-admin',
      permissions: { ...permissions, dashboard: 'hide', users: 'view', meetings: 'hide', topics: 'hide', tasks: 'hide', contentSettings: 'hide', authSettings: 'manage' },
    };
    const wrapper = mount(App, { global: { stubs } });
    expect(wrapper.text()).toContain('IT admin');
    expect(wrapper.html()).toContain('href="/users"');
    expect(wrapper.html()).not.toContain('href="/meetings"');
  });

  it('hides the user directory navigation for a guest', () => {
    auth.state.user = {
      id: 'guest', email: 'guest@example.com', firstName: 'Grace', lastName: 'Guest', role: 'guest',
      permissions: { ...permissions, dashboard: 'view', users: 'hide', meetings: 'view', topics: 'view', tasks: 'view', contentSettings: 'hide' },
    };
    const wrapper = mount(App, { global: { stubs } });
    expect(wrapper.html()).not.toContain('href="/users"');
    expect(wrapper.html()).toContain('href="/meetings"');
    expect(wrapper.html()).toContain('href="/topics"');
  });

  it('renders only the route outlet while signed out', () => {
    const wrapper = mount(App, { global: { stubs } });
    expect(wrapper.find('.current-user').exists()).toBe(false);
    expect(wrapper.find('.app-shell').exists()).toBe(false);
  });
});
