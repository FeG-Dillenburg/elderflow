import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, type AuthUser } from './api/domain';
import App from './App.vue';
import { auth } from './auth/auth';
import { protectedText } from './e2ee/protected-text';
import { setLanguage } from './i18n';

const stubs = {
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
  RouterView: true,
  UnlockDialog: true,
};
const permissions = {
  dashboard: 'manage', users: 'manage', references: 'view', meetings: 'manage', topics: 'manage', tasks: 'manage', contentSettings: 'manage', authSettings: 'hide',
} as const;
const contentUser: AuthUser = {
  id: 'user', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', role: 'admin', language: null, permissions,
};

describe('App', () => {
  afterEach(() => {
    auth.state.user = null;
    protectedText.lock('explicit', false);
    vi.restoreAllMocks();
  });

  it('renders the current user and permitted navigation destinations', () => {
    auth.state.user = contentUser;
    const wrapper = mount(App, { global: { stubs } });
    expect(wrapper.text()).toContain('Ada Lovelace');
    expect(wrapper.text()).toContain('Admin');
    for (const path of ['/', '/meetings', '/topics', '/tasks', '/users', '/agenda-sections', '/profile']) {
      expect(wrapper.html()).toContain(`href="${path}"`);
    }
    const navigation = wrapper.get('nav');
    const navigationHtml = navigation.html();
    expect(navigationHtml).toContain('href="/key-recovery"');
    expect(navigationHtml.indexOf('href="/key-recovery"')).toBeGreaterThan(
      navigationHtml.indexOf('href="/agenda-sections"'),
    );
    expect(wrapper.get('.current-user').html()).not.toContain('href="/key-recovery"');
    expect(wrapper.get('.brand-icon').attributes('src')).toMatch(
      /^(?:\/elderflow-logo\.svg|data:image\/svg\+xml)/,
    );
    expect(wrapper.get('.brand-wordmark').attributes()).toMatchObject({
      alt: 'Elderflow',
      src: '/elderflow-wordmark-white.png',
    });
    expect(getComputedStyle(wrapper.get('.nav-link').element).cursor).toBe('pointer');
  });

  it('hides forbidden content navigation for an IT admin', () => {
    auth.state.user = {
      id: 'it', email: 'it@example.com', firstName: 'Ivy', lastName: 'Tech', role: 'it-admin', language: null,
      permissions: { ...permissions, dashboard: 'hide', users: 'view', meetings: 'hide', topics: 'hide', tasks: 'hide', contentSettings: 'hide', authSettings: 'manage' },
    };
    const wrapper = mount(App, { global: { stubs } });
    expect(wrapper.text()).toContain('IT admin');
    expect(wrapper.html()).toContain('href="/users"');
    expect(wrapper.html()).toContain('href="/authentication-settings"');
    expect(wrapper.html()).not.toContain('href="/meetings"');
    expect(wrapper.html()).not.toContain('href="/key-recovery"');
  });

  it('hides the user directory navigation for a guest', () => {
    auth.state.user = {
      id: 'guest', email: 'guest@example.com', firstName: 'Grace', lastName: 'Guest', role: 'guest', language: null,
      permissions: { ...permissions, dashboard: 'view', users: 'hide', meetings: 'view', topics: 'view', tasks: 'view', contentSettings: 'hide' },
    };
    const wrapper = mount(App, { global: { stubs } });
    expect(wrapper.html()).not.toContain('href="/users"');
    expect(wrapper.html()).toContain('href="/meetings"');
    expect(wrapper.html()).toContain('href="/topics"');
    expect(wrapper.html()).not.toContain('href="/key-recovery"');
  });

  it('renders only the route outlet while signed out', () => {
    const wrapper = mount(App, { global: { stubs } });
    expect(wrapper.find('.current-user').exists()).toBe(false);
    expect(wrapper.find('.app-shell').exists()).toBe(false);
  });

  it('offers a right-aligned closed-lock control for locked Protected text', async () => {
    vi.spyOn(api, 'e2eeKeyState').mockResolvedValue({ organizationId: 'organization' } as any);
    await protectedText.offerUnlock(contentUser, false);
    auth.state.user = contentUser;
    const wrapper = mount(App, { global: { stubs } });
    const control = wrapper.get('.protected-text-control');

    expect(control.find('.pi-lock').exists()).toBe(true);
    expect(control.text()).toBe('locked');
    expect(control.attributes('aria-label')).toBe('Unlock Protected text');
    expect(wrapper.get('.protected-text-status').element).toBe(
      wrapper.get('.meeting-status-bar').element.lastElementChild,
    );

    await control.trigger('mouseenter');
    expect(control.text()).toBe('unlock');
    await control.trigger('click');
    expect(protectedText.state.promptVisible).toBe(true);
  });

  it('offers an open-lock control that locks unlocked Protected text', async () => {
    auth.state.user = contentUser;
    protectedText.state.status = 'unlocked';
    const wrapper = mount(App, { global: { stubs } });
    const control = wrapper.get('.protected-text-control');

    expect(control.find('.pi-lock-open').exists()).toBe(true);
    expect(control.text()).toBe('unlocked');
    expect(control.attributes('aria-label')).toBe('Lock Protected text');

    await control.trigger('mouseenter');
    expect(control.text()).toBe('lock');
    await control.trigger('click');
    expect(protectedText.state.status).toBe('locked');
  });

  it('uses the requested German status and hover labels', async () => {
    setLanguage('de');
    auth.state.user = contentUser;
    protectedText.state.status = 'locked';
    const wrapper = mount(App, { global: { stubs } });
    const control = wrapper.get('.protected-text-control');

    expect(control.text()).toBe('gesperrt');
    await control.trigger('mouseenter');
    expect(control.text()).toBe('entsperren');
    await control.trigger('mouseleave');

    protectedText.state.status = 'unlocked';
    await wrapper.vm.$nextTick();
    expect(control.text()).toBe('entsperrt');
    await control.trigger('mouseenter');
    expect(control.text()).toBe('sperren');
  });
});
