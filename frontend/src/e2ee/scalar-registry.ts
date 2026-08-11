export const SCALAR_AGGREGATES = {
  topic: 256,
  update: 257,
  task: 258,
} as const;

export const TOPIC_SCALAR_FIELDS = {
  name: {
    fieldId: 1,
    plaintextProperty: "name",
    envelopeProperty: "nameEnvelope",
    revisionProperty: "nameCommitRevision",
  },
  description: {
    fieldId: 2,
    plaintextProperty: "description",
    envelopeProperty: "descriptionEnvelope",
    revisionProperty: "descriptionCommitRevision",
  },
  membershipProcessStatus: {
    fieldId: 3,
    plaintextProperty: "membershipProcessStatus",
    envelopeProperty: "membershipProcessStatusEnvelope",
    revisionProperty: "membershipProcessStatusCommitRevision",
  },
  godparents: {
    fieldId: 4,
    plaintextProperty: "godparents",
    envelopeProperty: "godparentsEnvelope",
    revisionProperty: "godparentsCommitRevision",
  },
} as const;

export const UPDATE_SCALAR_FIELDS = {
  text: 1,
} as const;

export const TASK_SCALAR_FIELDS = {
  title: {
    fieldId: 1,
    plaintextProperty: "title",
    envelopeProperty: "titleEnvelope",
    revisionProperty: "titleCommitRevision",
  },
  description: {
    fieldId: 2,
    plaintextProperty: "description",
    envelopeProperty: "descriptionEnvelope",
    revisionProperty: "descriptionCommitRevision",
  },
} as const;

export type TopicScalarName = keyof typeof TOPIC_SCALAR_FIELDS;
export type TopicScalarField = (typeof TOPIC_SCALAR_FIELDS)[TopicScalarName];
export type TopicScalarFieldId = TopicScalarField["fieldId"];
export type UpdateScalarFieldId = (typeof UPDATE_SCALAR_FIELDS)[keyof typeof UPDATE_SCALAR_FIELDS];
export type TaskScalarField = (typeof TASK_SCALAR_FIELDS)[keyof typeof TASK_SCALAR_FIELDS];
export type TaskScalarFieldId = TaskScalarField["fieldId"];

export type ScalarFieldContext =
  | {
      aggregateType: typeof SCALAR_AGGREGATES.topic;
      recordId: string;
      fieldId: TopicScalarFieldId;
    }
  | {
      aggregateType: typeof SCALAR_AGGREGATES.update;
      recordId: string;
      fieldId: UpdateScalarFieldId;
    }
  | {
      aggregateType: typeof SCALAR_AGGREGATES.task;
      recordId: string;
      fieldId: TaskScalarFieldId;
    };
