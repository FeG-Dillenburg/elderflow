import { onMounted, ref } from "vue";
import { api } from "../api/domain";
import { auth } from "../auth/auth";
import { assignableUsers } from "../auth/roles";
import { translate } from "../i18n";
import type { MentionEditorOptions, MentionUser } from "./editor";

export function useMentions(): MentionEditorOptions {
  const users = ref<MentionUser[]>([]);
  onMounted(async () => {
    try { users.value = assignableUsers(await api.userDirectory()); }
    catch { users.value = []; }
  });
  return {
    users: () => users.value,
    viewer: () => auth.state.user?.id,
    label: () => translate("mentions.suggestions"),
  };
}
