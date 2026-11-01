# Copy a Recurring Topic's Description into each Meeting topic note

When a Recurring Topic is added to a Meeting, its current Description is copied into that appearance's Meeting topic note as editable default text. The copy is a snapshot: later Description changes affect only future appearances and never overwrite notes already customized for planned or completed Meetings.

## Postponed appearance exception (#119)

For a new appearance, the latest chronologically earlier appearance's postponement takes precedence over the Description default: copy that appearance's Preparation context, including confirmed empty content. Other Topic types with Preparation context follow the same rule. Person Topics keep their single Meeting topic note and its existing copy behavior. Meeting-minutes text is never copied.

This explicitly narrows the original unconditional Description rule. Each copied value remains independent, and later edits or reloads never reseed it. Moving an untouched Recurrence appearance retains its existing initialization and movement semantics.
