import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsersView from "./UsersView.vue";
import { auth } from "../auth/auth";

describe("UsersView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    auth.state.user = null;
  });

  it("hides user-management controls for an IT admin", async () => {
    auth.state.user = {
      id: "it-admin",
      email: "it@example.com",
      firstName: "Ivy",
      lastName: "Tech",
      role: "it-admin",
      permissions: {
        dashboard: "hide",
        users: "view",
        references: "hide",
        meetings: "hide",
        topics: "hide",
        tasks: "hide",
        contentSettings: "hide",
        authSettings: "manage",
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
    const wrapper = mount(UsersView, {
      global: {
        stubs: {
          DataTable: { template: "<div><slot /></div>" },
          Column: { template: "<span><slot name='body' :data='{}' /></span>" },
          Dialog: true,
          Button: { props: ["label"], template: "<button>{{ label }}</button>" },
          Message: true,
        },
      },
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain("Add user");
    expect(wrapper.text()).not.toContain("Show archived users");
  });

  it("loads and displays users from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: "7b404cf4-1df2-4ada-b163-df8734df2d4f",
              email: "alex@example.com",
              firstName: "Alex",
              lastName: "Smith",
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ]),
      }),
    );

    const wrapper = mount(UsersView, {
      global: {
        stubs: {
          DataTable: { template: "<div><slot /></div>" },
          Column: { props: ["field", "header"], template: "<span />" },
          Dialog: { template: "<div><slot /></div>" },
          Button: {
            props: ["label"],
            template: "<button>{{ label }}</button>",
          },
          InputText: { template: "<input />" },
          Message: { template: "<div><slot /></div>" },
        },
      },
    });

    await flushPromises();

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/users",
      expect.any(Object),
    );
    expect(wrapper.text()).toContain("Users");
    const view = wrapper.vm as unknown as { users: Array<{ email: string }> };
    expect(view.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: "alex@example.com" }),
      ]),
    );
  });

  it("resets the dialog, creates a user, refreshes, and restores saving state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: "user-id" }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(UsersView, {
      global: {
        stubs: {
          DataTable: true,
          Column: true,
          Dialog: true,
          Button: true,
          InputText: true,
          Message: true,
        },
      },
    });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: { email: string; firstName: string; lastName: string; role: string; password: string };
      openCreateDialog: () => void;
      submitUser: () => Promise<void>;
      dialogVisible: boolean;
      saving: boolean;
    };
    vm.form.email = "stale@example.com";
    vm.openCreateDialog();
    expect(vm.form).toEqual({ email: "", firstName: "", lastName: "", role: "user", password: "" });
    Object.assign(vm.form, {
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      role: "admin",
      password: "password123!",
    });
    await vm.submitUser();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3000/api/user",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(vm.form),
      }),
    );
    expect(vm.dialogVisible).toBe(false);
    expect(vm.saving).toBe(false);
  });

  it("keeps list errors outside the dialog and create errors inside it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: "List failed" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: "Create failed" }),
        }),
    );
    const wrapper = mount(UsersView, {
      global: {
        stubs: {
          DataTable: true,
          Column: true,
          Dialog: true,
          Button: true,
          InputText: true,
          Message: true,
        },
      },
    });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      openCreateDialog: () => void;
      submitUser: () => Promise<void>;
      errorMessage: string;
      loading: boolean;
      saving: boolean;
    };
    expect(vm.errorMessage).toBe("List failed");
    expect(vm.loading).toBe(false);
    vm.openCreateDialog();
    await vm.submitUser();
    expect(vm.errorMessage).toBe("Create failed");
    expect(vm.saving).toBe(false);
  });

  it("toggles archived users, confirms removal, and restores archived users", async () => {
    const activeUser = {
      id: "active-user",
      email: "active@example.com",
      firstName: "Active",
      lastName: "User",
      createdAt: "2026-01-01T00:00:00.000Z",
      archivedAt: null,
    };
    const archivedUser = {
      ...activeUser,
      id: "archived-user",
      email: "archived@example.com",
      firstName: "Archived",
      archivedAt: "2026-02-01T00:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([activeUser]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([activeUser, archivedUser]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ action: "archived" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([archivedUser]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(activeUser) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([activeUser]) });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(UsersView, {
      global: {
        stubs: {
          DataTable: true,
          Column: true,
          Dialog: { template: "<div><slot /><slot name='footer' /></div>" },
          Button: true,
          InputText: true,
          Message: { template: "<div><slot /></div>" },
        },
      },
    });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      showArchived: boolean;
      users: Array<typeof activeUser | typeof archivedUser>;
      selectedUser: typeof activeUser | null;
      removalDialogVisible: boolean;
      processingUserId: string | null;
      toggleArchivedUsers: () => Promise<void>;
      requestRemoval: (user: typeof activeUser) => void;
      confirmRemoval: () => Promise<void>;
      restore: (user: typeof archivedUser) => Promise<void>;
    };

    await vm.toggleArchivedUsers();
    expect(vm.showArchived).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3000/api/users?includeArchived=true",
      expect.any(Object),
    );

    vm.requestRemoval(activeUser);
    expect(vm.removalDialogVisible).toBe(true);
    expect(vm.selectedUser).toEqual(activeUser);
    expect(wrapper.text()).toContain("permanently deleted if no data is attached");
    await vm.confirmRemoval();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:3000/api/users/active-user",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(vm.removalDialogVisible).toBe(false);

    await vm.restore(archivedUser);
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "http://localhost:3000/api/users/archived-user/restore",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(vm.processingUserId).toBeNull();
  });

  it("reports remove and restore failures and clears processing state", async () => {
    const user = {
      id: "user-id",
      email: "user@example.com",
      firstName: "Test",
      lastName: "User",
      createdAt: "2026-01-01T00:00:00.000Z",
      archivedAt: null,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([user]) })
        .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ message: "Remove failed" }) })
        .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ message: "Restore failed" }) }),
    );
    const wrapper = mount(UsersView, {
      global: {
        stubs: {
          DataTable: true,
          Column: true,
          Dialog: true,
          Button: true,
          InputText: true,
          Message: true,
        },
      },
    });
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      errorMessage: string;
      processingUserId: string | null;
      requestRemoval: (value: typeof user) => void;
      confirmRemoval: () => Promise<void>;
      restore: (value: typeof user) => Promise<void>;
    };

    vm.requestRemoval(user);
    await vm.confirmRemoval();
    expect(vm.errorMessage).toBe("Remove failed");
    expect(vm.processingUserId).toBeNull();

    await vm.restore(user);
    expect(vm.errorMessage).toBe("Restore failed");
    expect(vm.processingUserId).toBeNull();
  });
});
