<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Password from "primevue/password";
import Select from "primevue/select";
import {
  createUser,
  getUsers,
  removeUser,
  restoreUser,
  updateUser,
  type CreateUserInput,
  type User,
} from "../api/users";
import { auth } from "../auth/auth";
import { roleLabel, userRoleOptions } from "../auth/roles";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const users = ref<User[]>([]);
const loading = ref(true);
const saving = ref(false);
const dialogVisible = ref(false);
const removalDialogVisible = ref(false);
const showArchived = ref(false);
const processingUserId = ref<string | null>(null);
const selectedUser = ref<User | null>(null);
const errorMessage = ref("");
const editingUserId = ref<string | null>(null);
const form = reactive<CreateUserInput>({
  email: "",
  firstName: "",
  lastName: "",
  role: "user",
  password: "",
});

async function loadUsers(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    users.value = await getUsers(showArchived.value);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("users.loadFailed");
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
  errorMessage.value = "";
  removalDialogVisible.value = true;
}

async function confirmRemoval(): Promise<void> {
  if (!selectedUser.value) return;
  processingUserId.value = selectedUser.value.id;
  errorMessage.value = "";
  try {
    await removeUser(selectedUser.value.id);
    removalDialogVisible.value = false;
    selectedUser.value = null;
    await loadUsers();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("users.removeFailed");
  } finally {
    processingUserId.value = null;
  }
}

async function restore(user: User): Promise<void> {
  processingUserId.value = user.id;
  errorMessage.value = "";
  try {
    await restoreUser(user.id);
    await loadUsers();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("users.restoreFailed");
  } finally {
    processingUserId.value = null;
  }
}

function userRowClass(user: User): string {
  return user.archivedAt ? "archived-user" : "";
}

function openCreateDialog(): void {
  editingUserId.value = null;
  Object.assign(form, {
    email: "",
    firstName: "",
    lastName: "",
    role: "user",
    password: "",
  });
  errorMessage.value = "";
  dialogVisible.value = true;
}

function openEditDialog(user: User): void {
  editingUserId.value = user.id;
  Object.assign(form, {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    password: "",
  });
  errorMessage.value = "";
  dialogVisible.value = true;
}

async function submitUser(): Promise<void> {
  saving.value = true;
  errorMessage.value = "";
  try {
    if (editingUserId.value) {
      await updateUser(editingUserId.value, {
        ...form,
        password: form.password || undefined,
      } as Partial<CreateUserInput>);
    } else {
      await createUser(form);
    }
    dialogVisible.value = false;
    await loadUsers();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("users.saveFailed");
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
        <p class="eyebrow">{{ t("users.eyebrow") }}</p>
        <h1>{{ t("users.title") }}</h1>
        <p class="description">{{ t("users.description") }}</p>
      </div>
      <Button
        v-if="auth.canManage('users')"
        :label="t('users.add')"
        icon="pi pi-plus"
        @click="openCreateDialog"
      />
    </header>

    <Message
      v-if="errorMessage && !dialogVisible && !removalDialogVisible"
      severity="error"
      :closable="false"
    >
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
        :empty-message="loading ? t('users.loading') : t('users.empty')"
      >
        <Column field="firstName" :header="t('users.firstName')" />
        <Column field="lastName" :header="t('users.lastName')" />
        <Column field="email" :header="t('common.email')" />
        <Column field="role" :header="t('common.role')">
          <template #body="{ data }">{{ roleLabel(data.role) }}</template>
        </Column>
        <Column header="" class="actions-column">
          <template #body="{ data }">
            <Button
              v-if="auth.canManage('users') && data.archivedAt"
              icon="pi pi-replay"
              severity="secondary"
              text
              rounded
              :loading="processingUserId === data.id"
              :aria-label="
                t('users.restore', {
                  name: `${data.firstName} ${data.lastName}`,
                })
              "
              :title="t('users.restoreTitle')"
              @click="restore(data)"
            />
            <Button
              v-else-if="auth.canManage('users')"
              icon="pi pi-pencil"
              severity="secondary"
              text
              rounded
              :aria-label="
                t('users.edit', { name: `${data.firstName} ${data.lastName}` })
              "
              :title="t('users.editTitle')"
              @click="openEditDialog(data)"
            />
            <Button
              v-if="auth.canManage('users') && !data.archivedAt"
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              :loading="processingUserId === data.id"
              :aria-label="
                t('users.remove', {
                  name: `${data.firstName} ${data.lastName}`,
                })
              "
              :title="t('users.removeTitle')"
              @click="requestRemoval(data)"
            />
          </template>
        </Column>
      </DataTable>
    </div>

    <Button
      v-if="auth.canManage('users')"
      class="archived-toggle"
      :label="showArchived ? t('users.hideArchived') : t('users.showArchived')"
      :icon="showArchived ? 'pi pi-eye-slash' : 'pi pi-eye'"
      severity="secondary"
      text
      @click="toggleArchivedUsers"
    />

    <Dialog
      v-model:visible="dialogVisible"
      modal
      :header="editingUserId ? t('users.editTitle') : t('users.addTitle')"
      :style="{ width: '30rem', maxWidth: 'calc(100vw - 2rem)' }"
    >
      <form
        v-if="dialogVisible"
        id="create-user-form"
        class="user-form"
        @submit.prevent="submitUser"
      >
        <Message v-if="errorMessage" severity="error" :closable="false">
          {{ errorMessage }}
        </Message>
        <label>
          <span>{{ t("users.firstName") }}</span>
          <InputText
            v-model="form.firstName"
            autocomplete="given-name"
            required
            maxlength="100"
          />
        </label>
        <label>
          <span>{{ t("common.role") }}</span>
          <Select
            v-model="form.role"
            :options="userRoleOptions"
            option-label="label"
            option-value="value"
          />
        </label>
        <label>
          <span>
            {{ editingUserId ? t("users.newPassword") : t("common.password") }}
          </span>
          <Password
            v-model="form.password"
            :feedback="false"
            toggle-mask
            :required="!editingUserId"
            minlength="10"
            autocomplete="new-password"
          />
        </label>
        <label>
          <span>{{ t("users.lastName") }}</span>
          <InputText
            v-model="form.lastName"
            autocomplete="family-name"
            required
            maxlength="100"
          />
        </label>
        <label>
          <span>{{ t("common.email") }}</span>
          <InputText
            v-model="form.email"
            type="email"
            autocomplete="email"
            required
            maxlength="320"
          />
        </label>
      </form>
      <template #footer>
        <Button
          :label="t('common.cancel')"
          severity="secondary"
          text
          @click="dialogVisible = false"
        />
        <Button
          :label="editingUserId ? t('users.save') : t('users.create')"
          type="submit"
          form="create-user-form"
          :loading="saving"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="removalDialogVisible"
      modal
      :header="t('users.removeQuestion')"
      :style="{ width: '32rem', maxWidth: 'calc(100vw - 2rem)' }"
    >
      <div class="removal-confirmation">
        <Message v-if="errorMessage" severity="error" :closable="false">
          {{ errorMessage }}
        </Message>
        <p>
          {{
            t("users.removalHelp", {
              name: selectedUser
                ? `${selectedUser.firstName} ${selectedUser.lastName}`
                : "",
            })
          }}
        </p>
      </div>
      <template #footer>
        <Button
          :label="t('common.cancel')"
          severity="secondary"
          text
          @click="removalDialogVisible = false"
        />
        <Button
          :label="t('users.removeAction')"
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
  width: 7rem;
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

:deep(.p-password),
:deep(.p-password-input) {
  width: 100%;
}

@media (max-width: 600px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
