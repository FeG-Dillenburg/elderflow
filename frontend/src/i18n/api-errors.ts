export interface ApiErrorPayload {
  code?: string;
  message?: string | string[];
  params?: Record<string, unknown>;
}

export const localizeApiError = (
  payload: ApiErrorPayload | null,
  translate: (key: string, params?: Record<string, unknown>) => string,
): string => {
  if (!payload) return translate('errors.requestFailed');
  if (payload.code === 'VALIDATION_FAILED') {
    const errors = payload.params?.errors;
    if (Array.isArray(errors) && errors.length) {
      return errors.map((error) => {
        const detail = error as { field?: string; constraint?: string };
        return translate('errors.validation', {
          field: detail.field ?? '',
          constraint: detail.constraint ?? '',
        });
      }).join(' ');
    }
  }
  if (payload.code) {
    const key = `errors.codes.${payload.code}`;
    const localized = translate(key, payload.params);
    if (localized !== key) return localized;
  }
  if (Array.isArray(payload.message)) return payload.message.join(', ');
  return payload.message || translate('errors.requestFailed');
};
