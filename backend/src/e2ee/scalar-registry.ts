export const SCALAR_AGGREGATES = {
  topic: 256,
  update: 257,
} as const;

export const TOPIC_SCALAR_FIELDS = {
  name: {
    fieldId: 1,
    envelopeProperty: "nameEnvelope",
    revisionProperty: "nameCommitRevision",
  },
  description: {
    fieldId: 2,
    envelopeProperty: "descriptionEnvelope",
    revisionProperty: "descriptionCommitRevision",
  },
  membershipProcessStatus: {
    fieldId: 3,
    envelopeProperty: "membershipProcessStatusEnvelope",
    revisionProperty: "membershipProcessStatusCommitRevision",
  },
  godparents: {
    fieldId: 4,
    envelopeProperty: "godparentsEnvelope",
    revisionProperty: "godparentsCommitRevision",
  },
} as const;

export const UPDATE_SCALAR_FIELDS = {
  text: 1,
} as const;

export type ScalarAggregateType = (typeof SCALAR_AGGREGATES)[keyof typeof SCALAR_AGGREGATES];
export type TopicScalarField = (typeof TOPIC_SCALAR_FIELDS)[keyof typeof TOPIC_SCALAR_FIELDS];
export type TopicScalarFieldId = TopicScalarField["fieldId"];
export type UpdateScalarFieldId = (typeof UPDATE_SCALAR_FIELDS)[keyof typeof UPDATE_SCALAR_FIELDS];

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
    };
