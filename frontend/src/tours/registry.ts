import type { AuthUser } from '../api/domain';
import type { TopicType } from '../topics/topicTypes';
import { isProtectedTextReader } from '../e2ee/roles';

export type TourId = 'first-login' | 'new-topic-dialog';
export interface TourStep {
  id: string;
  target?: string;
  titleKey?: string;
  descriptionKey: string;
  side: 'top' | 'left' | 'right';
  skippable: boolean;
  topicType?: TopicType;
}
export interface TourDefinition {
  id: TourId;
  version: number;
  nameKey: string;
  audience(user: AuthUser): boolean;
  steps: readonly TourStep[];
}
const firstSteps = [
  ['welcome', undefined, 'welcomeTitle', 'right', false],
  ['protected-text-encryption', 'unlock-dialog', 'encryptionTitle', 'left', false],
  ['protected-text-passphrase', 'unlock-passphrase', 'passphraseTitle', 'left', false],
  ['dashboard-overview', 'dashboard-heading', undefined, 'right', true],
  ['meetings-navigation', 'nav-meetings', undefined, 'right', true],
  ['topics-navigation', 'nav-topics', undefined, 'right', true],
  ['mentions-navigation', 'nav-my-mentions', undefined, 'right', true],
  ['profile-settings', 'nav-profile', undefined, 'top', true],
  ['sign-out', 'nav-sign-out', undefined, 'top', false],
] as const;
export const tourRegistry: Record<TourId, TourDefinition> = {
  'first-login': {
    id: 'first-login', version: 1, nameKey: 'tours.firstLogin',
    audience: (user) => isProtectedTextReader(user) && user.permissions.dashboard !== 'hide',
    steps: firstSteps.map(([id, target, title, side, skippable]) => ({
      id, target, titleKey: title ? `tours.${title}` : undefined,
      descriptionKey: `tours.steps.${id}`, side, skippable,
    })),
  },
  'new-topic-dialog': {
    id: 'new-topic-dialog', version: 1, nameKey: 'tours.newTopic',
    audience: (user) => isProtectedTextReader(user) && user.permissions.topics === 'manage',
    steps: (['generic', 'person', 'new_membership', 'recurring'] as const).flatMap((topicType): TourStep[] => {
      const typeStep: TourStep = {
        id: `topic-type-${topicType.replace('_', '-')}`,
        target: `topic-type-${topicType.replace('_', '-')}`,
        titleKey: `tours.topicTitles.${topicType}`,
        descriptionKey: `tours.steps.topic-type-${topicType.replace('_', '-')}`,
        side: 'top', skippable: true, topicType,
      };
      return topicType === 'new_membership' ? [typeStep, {
        id: 'topic-godparents', target: 'topic-godparents',
        titleKey: 'tours.godparentsTitle', descriptionKey: 'tours.steps.topic-godparents',
        side: 'top', skippable: true, topicType,
      }] : [typeStep];
    }),
  },
};
