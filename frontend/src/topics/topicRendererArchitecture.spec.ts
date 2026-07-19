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
import typeRadioGroupSource from "./components/TopicTypeRadioGroup.vue?raw";

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

  it("selects the Topic type before the name in both creation flows", () => {
    for (const [source, formId] of [
      [topicsSource, 'id="topic-form"'],
      [preparationSource, 'id="new-topic"'],
    ]) {
      const form = source.slice(source.indexOf(formId));
      expect(form.indexOf("<TopicTypeRadioGroup")).toBeLessThan(
        form.indexOf('t("common.name")'),
      );
      expect(form.indexOf('t("common.name")')).toBeLessThan(
        form.indexOf('context="form"'),
      );
    }
  });

  it("uses a shared single-click radio group for creatable Topic types", () => {
    expect(typeRadioGroupSource).toContain("<RadioButton");
    expect(typeRadioGroupSource).toContain("v-model=\"model\"");
    expect(typeRadioGroupSource).toContain("creatableTopicTypes()");
    expect(topicsSource).toContain("<TopicTypeRadioGroup");
    expect(preparationSource).toContain("<TopicTypeRadioGroup");
  });
});
