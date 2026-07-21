import type { CSSProperties } from "vue";
import type { MembershipStatusSignal } from "../../../api/domain";

export const membershipSignalIcons: Record<MembershipStatusSignal, string> = {
  new: "pi pi-star-fill",
  in_progress: "pi pi-cog",
  nearly_finished: "pi pi-check",
  attention: "pi pi-exclamation-triangle",
  paused: "pi pi-pause",
};

export const membershipSignalStyles: Record<MembershipStatusSignal, CSSProperties> = {
  new: { background: "#c74646", color: "#ffffff" },
  in_progress: { background: "#4878c1", color: "#ffffff" },
  nearly_finished: { background: "#3b9562", color: "#ffffff" },
  attention: { background: "#f2c94c", color: "#2f2b1f" },
  paused: { background: "#d97931", color: "#ffffff" },
};
