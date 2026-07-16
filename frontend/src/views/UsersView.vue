<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import {
  createUser,
  getUsers,
  removeUser,
  restoreUser,
  type CreateUserInput,
  type User,
} from '../api/users';

const users = ref<User[]>([]);
const loading = ref(true);
const saving = ref(false);
const dialogVisible = ref(false);
const removalDialogVisible = ref(false);
const showArchived = ref(false);
const processingUserId = ref<string | null>(null);
const selectedUser = ref<User | null>(null);
const errorMessage = ref('');
const form = reactive<CreateUserInput>({ email: '', firstName: '', lastName: '' });

async function loadUsers(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    users.value = await getUsers(showArchived.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to load users';
  } finally {
    loading.value = false;
  }
}

async function toggleArchivedUsers(): Promise<void> {
  showArchived.value = !showArchived.value;
  await loadUsers();
}

function requestRemoval(user: User): void {
  selectedUser.value = user;
  errorMessage.value = '';
  removalDialogVisible.value = true;
}

async function confirmRemoval(): Promise<void> {
  if (!selectedUser.value) return;
  processingUserId.value = selectedUser.value.id;
  errorMessage.value = '';
  try {
    await removeUser(selectedUser.value.id);
    removalDialogVisible.value = false;
    selectedUser.value = null;
    await loadUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to remove user';
  } finally {
    processingUserId.value = null;
  }
}

async function restore(user: User): Promise<void> {
  processingUserId.value = user.id;
  errorMessage.value = '';
  try {
    await restoreUser(user.id);
    await loadUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to restore user';
  } finally {
    processingUserId.value = null;
  }
}

function userRowClass(user: User): string {
  return user.archivedAt ? 'archived-user' : '';
}

function openCreateDialog(): void {
  Object.assign(form, { email: '', firstName: '', lastName: '' });
  errorMessage.value = '';
  dialogVisible.value = true;
}

async function submitUser(): Promise<void> {
  saving.value = true;
  errorMessage.value = '';
  try {
    await createUser(form);
    dialogVisible.value = false;
    await loadUsers();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Unable to create user';
  } finally {
    saving.value = false;
  }
}

onMounted(loadUsers);
</script>

<template>
  <section class="users-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Directory</p>
        <h1>Users</h1>
        <p class="description">Manage the people who use Elderflow.</p>
      </div>
      <Button label="Add user" icon="pi pi-plus" @click="openCreateDialog" />
    </header>

    <Message v-if="errorMessage && !dialogVisible && !removalDialogVisible" severity="error" :closable="false">
      {{ errorMessage }}
    </Message>

    <div class="table-card">
      <DataTable
        :value="users"
        :loading="loading"
        data-key="id"
        striped-rows
        responsive-layout="scroll"
        :row-class="userRowClass"
        :empty-message="loading ? 'Loading users...' : 'No users yet.'"
      >
        <Column field="firstName" header="First name" />
        <Column field="lastName" header="Last name" />
        <Column field="email" header="Email" />
        <Column header="" class="actions-column">
          <template #body="{ data }">
            <Button
              v-if="data.archivedAt"
              icon="pi pi-replay"
              severity="secondary"
              text
              rounded
              :loading="processingUserId === data.id"
              :aria-label="`Restore ${data.firstName} ${data.lastName}`"
              title="Restore user"
              @click="restore(data)"
            />
            <Button
              v-else
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              :loading="processingUserId === data.id"
              :aria-label="`Delete or archive ${data.firstName} ${data.lastName}`"
              title="Delete or archive user"
              @click="requestRemoval(data)"
            />
          </template>
        </Column>
      </DataTable>
    </div>

    <Button
      class="archived-toggle"
      :label="showArchived ? 'Hide archived users' : 'Show archived users'"
      :icon="showArchived ? 'pi pi-eye-slash' : 'pi pi-eye'"
      severity="secondary"
      text
      @click="toggleArchivedUsers"
    />

    <Dialog v-model:visible="dialogVisible" modal header="Add user" :style="{ width: '30rem', maxWidth: 'calc(100vw - 2rem)' }">
      <form id="create-user-form" class="user-form" @submit.prevent="submitUser">
        <Message v-if="errorMessage" severity="error" :closable="false">{{ errorMessage }}</Message>
        <label>
          <span>First name</span>
          <InputText v-model="form.firstName" autocomplete="given-name" required maxlength="100" />
        </label>
        <label>
          <span>Last name</span>
          <InputText v-model="form.lastName" autocomplete="family-name" required maxlength="100" />
        </label>
        <label>
          <span>Email</span>
          <InputText v-model="form.email" type="email" autocomplete="email" required maxlength="320" />
        </label>
      </form>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Create user" type="submit" form="create-user-form" :loading="saving" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="removalDialogVisible"
      modal
      header="Delete or archive user?"
      :style="{ width: '32rem', maxWidth: 'calc(100vw - 2rem)' }"
    >
      <div class="removal-confirmation">
        <Message v-if="errorMessage" severity="error" :closable="false">
          {{ errorMessage }}
        </Message>
        <p>
          <strong v-if="selectedUser">
            {{ selectedUser.firstName }} {{ selectedUser.lastName }}
          </strong>
          will be permanently deleted if no data is attached. If the user is linked to any record,
          the user will be archived instead and can be restored later.
        </p>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="removalDialogVisible = false" />
        <Button
          label="Delete or archive"
          icon="pi pi-trash"
          severity="danger"
          :loading="processingUserId === selectedUser?.id"
          @click="confirmRemoval"
        />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.users-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: #5572a7;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: clamp(1.75rem, 4vw, 2.4rem);
  letter-spacing: -0.03em;
}

.description {
  margin: 0.4rem 0 0;
  color: #64748b;
}

.table-card {
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 0.85rem;
  background: #fff;
  box-shadow: 0 8px 24px rgb(31 41 55 / 5%);
}

.archived-toggle {
  margin-top: 0.65rem;
}

.removal-confirmation {
  display: grid;
  gap: 1rem;
}

.removal-confirmation p {
  margin: 0;
  color: #475569;
  line-height: 1.6;
}

:deep(.actions-column) {
  width: 4rem;
  text-align: right;
}

:deep(.archived-user) {
  color: #64748b;
  opacity: 0.72;
}

.user-form {
  display: grid;
  gap: 1rem;
  padding-top: 0.25rem;
}

.user-form label {
  display: grid;
  gap: 0.4rem;
  color: #374151;
  font-size: 0.9rem;
  font-weight: 600;
}

.user-form input {
  width: 100%;
}

@media (max-width: 600px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
