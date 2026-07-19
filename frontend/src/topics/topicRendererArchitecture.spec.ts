import { describe, expect, it } from "vitest";
import topicEditSource from "../components/TopicEditDialog.vue?raw";
import agendaSource from "../views/MeetingAgendaView.vue?raw";
import detailSource from "../views/TopicDetailView.vue?raw";
import preparationSource from "../views/MeetingPreparationView.vue?raw";
import topicsSource from "../views/TopicsView.vue?raw";
import genericAgendaSource from "./components/GenericTopicAgenda.vue?raw";
import genericDetailSource from "./components/GenericTopicDetail.vue?raw";
import genericFormSource from "./components/GenericTopicFormFields.vue?raw";
import genericListSource from "./components/GenericTopicList.vue?raw";
import genericPreparationSource from "./components/GenericTopicPreparation.vue?raw";

describe("Topic renderer architecture", () => {
  it("routes every parent context through the shared dispatcher", () => {
    expect(topicEditSource).toContain('context="form"');
    expect(preparationSource).toContain('context="preparation"');
    expect(agendaSource).toContain('context="agenda"');
    expect(detailSource).toContain('context="detail"');
    expect(topicsSource).toContain('context="list"');
  });

  it("keeps API persistence out of every renderer child", () => {
    for (const source of [
      genericFormSource,
      genericPreparationSource,
      genericAgendaSource,
      genericDetailSource,
      genericListSource,
    ]) {
      expect(source).not.toMatch(/\bapi\s*\./);
    }
  });
});
