import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView },
    { path: '/meetings', name: 'meetings', component: () => import('../views/MeetingsView.vue') },
    { path: '/meetings/:id', name: 'meeting', component: () => import('../views/MeetingAgendaView.vue') },
    { path: '/meetings/:id/prepare', name: 'meeting-prepare', component: () => import('../views/MeetingPreparationView.vue') },
    { path: '/topics', name: 'topics', component: () => import('../views/TopicsView.vue') },
    { path: '/topics/:id', name: 'topic', component: () => import('../views/TopicDetailView.vue') },
    { path: '/tasks', name: 'tasks', component: () => import('../views/TasksView.vue') },
    { path: '/agenda-sections', name: 'agenda-sections', component: () => import('../views/AgendaSectionsView.vue') },
    { path: '/users', name: 'users', component: () => import('../views/UsersView.vue') },
  ],
});
