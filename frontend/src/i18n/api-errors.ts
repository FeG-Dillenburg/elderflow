export interface ApiErrorPayload {
  code?: string;
  message?: string | string[];
  params?: Record<string, unknown>;
}

export const localizeApiError = (
  payload: ApiErrorPayload | null,
  translate: (key: string, params?: Record<string, unknown>) => string,
): string => {
  const localized = (key: string, fallback: string): string => {
    const value = translate(key);
    return value === key ? fallback : value;
  };
  if (!payload) return translate('errors.requestFailed');
  if (payload.code === 'VALIDATION_FAILED') {
    const errors = payload.params?.errors;
    if (Array.isArray(errors) && errors.length) {
      return errors.map((error) => {
        const detail = error as { field?: string; constraint?: string };
        const fieldParts = (detail.field ?? '').split('.').filter((part) => part && !/^\d+$/.test(part));
        const field = fieldParts
          .map((part) => localized(`errors.fields.${part}`, part))
          .join(' – ');
        const constraint = localized(
          `errors.constraints.${detail.constraint}`,
          translate('errors.constraints.invalid'),
        );
        return translate('errors.validation', {
          field,
          constraint,
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
