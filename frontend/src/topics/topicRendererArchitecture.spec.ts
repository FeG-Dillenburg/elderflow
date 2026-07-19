import { describe, expect, it } from "vitest";
import topicEditSource from "../components/TopicEditDialog.vue?raw";
import agendaSource from "../views/MeetingAgendaView.vue?raw";
import detailSource from "../views/TopicDetailView.vue?raw";
import preparationSource from "../views/MeetingPreparationView.vue?raw";
import topicsSource from "../views/TopicsView.vue?raw";
import dispatcherSource from "./TopicTypeRenderer.vue?raw";
import typeRadioGroupSource from "./components/TopicTypeRadioGroup.vue?raw";
import genericAgendaSource from "./types/generic/GenericTopicAgenda.vue?raw";
import genericDetailSource from "./types/generic/GenericTopicDetail.vue?raw";
import genericFormSource from "./types/generic/GenericTopicFormFields.vue?raw";
import genericListSource from "./types/generic/GenericTopicList.vue?raw";
import genericPreparationSource from "./types/generic/GenericTopicPreparation.vue?raw";
import genericModuleSource from "./types/generic/index.ts?raw";
import personAgendaSource from "./types/person/PersonTopicAgenda.vue?raw";
import personDetailSource from "./types/person/PersonTopicDetail.vue?raw";
import personFormSource from "./types/person/PersonTopicFormFields.vue?raw";
import personListSource from "./types/person/PersonTopicList.vue?raw";
import personNoteSource from "./types/person/PersonTopicNote.vue?raw";
import personPreparationSource from "./types/person/PersonTopicPreparation.vue?raw";
import personModuleSource from "./types/person/index.ts?raw";

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
      personFormSource,
      personPreparationSource,
      personAgendaSource,
      personDetailSource,
      personListSource,
      personNoteSource,
    ]) {
      expect(source).not.toMatch(/\bapi\s*\./);
    }
  });

  it("keeps type-specific renderer imports behind the type module interface", () => {
    expect(dispatcherSource).not.toContain("GenericTopic");
    for (const context of ["form", "preparation", "agenda", "detail", "list"]) {
      expect(genericModuleSource).toContain(`${context}: GenericTopic`);
      expect(personModuleSource).toContain(`${context}: PersonTopic`);
    }
  });

  it("keeps Person presentation decisions out of parent views", () => {
    for (const source of [agendaSource, preparationSource, detailSource, topicsSource]) {
      expect(source).not.toMatch(/\.type\s*===\s*["']person["']/);
    }
    expect(agendaSource).not.toContain('class="number"');
    expect(personAgendaSource).not.toContain("agendaNumber");
    expect(personAgendaSource).not.toContain("recentUpdates");
    expect(personAgendaSource).not.toContain("item.topic?.tasks");
    expect(personAgendaSource).toContain("@media (max-width: 700px)");
    expect(personPreparationSource).toMatch(/\.person-preparation\s*\{[^}]*min-width: 0;[^}]*width: 100%;/s);
    expect(personNoteSource).toMatch(/\.note-editor\s*\{[^}]*min-width: 0;[^}]*width: 100%;/s);
    expect(preparationSource).toMatch(/\.item-actions\s*\{[^}]*display: flex;[^}]*justify-content: flex-end;/s);
  });

  it("selects the Topic type before the name in both creation flows", () => {
    for (const [source, formId] of [
      [topicsSource, 'id="topic-form"'],
      [preparationSource, 'id="new-topic"'],
    ]) {
      const form = source.slice(source.indexOf(formId));
      expect(form.indexOf("<TopicTypeRadioGroup")).toBeLessThan(
        form.indexOf("topicNameTranslationKey(form.type)"),
      );
      expect(form.indexOf("topicNameTranslationKey(form.type)")).toBeLessThan(
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

  it("puts the shared type radio group first when editing a Topic", () => {
    const form = topicEditSource.slice(topicEditSource.indexOf('id="edit-topic"'));
    expect(form.indexOf("<TopicTypeRadioGroup")).toBeLessThan(
      form.indexOf("topicNameTranslationKey(form.type)"),
    );
    expect(topicEditSource).toContain(':types="editableTopicTypes"');
  });
});
