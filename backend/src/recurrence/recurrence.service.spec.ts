import { RecurrenceService } from './recurrence.service';

describe('RecurrenceService date arithmetic', () => {
  const service = new RecurrenceService();

  it('adds whole weeks to the actual appearance date', () => {
    expect(service.addInterval('2026-01-10', 3, 'weeks')).toBe('2026-01-31');
  });

  it('clamps calendar months to the final day of the target month', () => {
    expect(service.addInterval('2026-01-31', 1, 'months')).toBe('2026-02-28');
    expect(service.addInterval('2024-01-31', 1, 'months')).toBe('2024-02-29');
  });

  it('derives the first due date until an appearance advances cadence', () => {
    expect(service.nextDueDate({
      recurrenceFirstDueDate: '2026-03-01',
      recurrenceInterval: 2,
      recurrenceUnit: 'months',
    }, [])).toBe('2026-03-01');
  });

  it('uses the latest actual non-skipped appearance for rolling cadence', () => {
    expect(service.nextDueDate({
      recurrenceFirstDueDate: '2026-03-01',
      recurrenceInterval: 2,
      recurrenceUnit: 'months',
    }, ['2026-03-08', '2026-05-17'])).toBe('2026-07-17');
  });
});
