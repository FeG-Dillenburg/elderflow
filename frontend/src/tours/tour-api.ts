import { request } from '../api/domain';
import type { TourId } from './registry';

export interface TourProgress {
  tourId: TourId;
  version: number;
  state: 'unseen' | 'started' | 'skipped' | 'completed';
  completedAt: string | null;
}
export interface TourEvent {
  tourId: TourId;
  version: number;
  event: 'start' | 'step' | 'skip' | 'complete';
  stepId?: string;
}
const boundedSignal = (signal?: AbortSignal): AbortSignal => signal
  ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
  : AbortSignal.timeout(5000);
export const tourApi = {
  list: (signal?: AbortSignal) => request<TourProgress[]>('/api/tours', { signal: boundedSignal(signal) }),
  record: (event: TourEvent, signal?: AbortSignal) => request<TourProgress>('/api/tours/events', {
    method: 'POST', body: JSON.stringify(event), signal: boundedSignal(signal),
  }),
};
