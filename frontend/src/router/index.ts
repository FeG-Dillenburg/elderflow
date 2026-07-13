import { createRouter, createWebHistory } from 'vue-router';
import UsersView from '../views/UsersView.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/users' },
    { path: '/users', name: 'users', component: UsersView },
  ],
});

