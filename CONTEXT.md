# ElderFlow

ElderFlow supports the preparation, execution, and follow-up of leadership meetings for a single installation.

## Language

**Meeting (Sitzung)**:
A scheduled leadership gathering with an agenda, assigned responsibilities, attendance, and minutes.
_Avoid_: Gathering, appointment; Treffen, Besprechung

**Completed Meeting (Abgeschlossene Sitzung)**:
A Meeting whose details, agenda composition and order, participants, Meeting topic notes, type-specific values, and Minutes entries are immutable. Reopening or correcting a Completed Meeting is a separate workflow that ElderFlow does not currently support.
_Avoid_: Archived Meeting, read-only view; Archivierte Sitzung, schreibgeschuetzte Ansicht

**Topic (Thema)**:
A long-lived matter that may be discussed across multiple meetings.
_Avoid_: Agenda item, subject; Tagesordnungspunkt, Gegenstand

**Topic type (Themenart)**:
The behavioral classification that determines a topic's domain-specific information and presentation, with the canonical types Generic, Person, New membership, and Recurring.
_Avoid_: Topic category, agenda section; Themenkategorie, Tagesordnungsabschnitt

**Generic Topic (Allgemeines Thema)**:
A Topic with the standard agenda presentation and no type-specific information or lifecycle behavior.
_Avoid_: Uncategorized Topic, default category; Unkategorisiertes Thema, Standardkategorie

**New membership Topic (Aufnahmethema)**:
A Topic that follows one person, couple, or freely named group through the church membership process and retains that type when the process is closed.
_Avoid_: Person Topic, membership record; Personenthema, Mitgliedsdatensatz

**Person Topic (Personenthema)**:
A compact Topic about the special circumstances of a freely named person, couple, or group, with one Meeting topic note for each Meeting in which it appears. A new appearance initializes its note from the most recent earlier Meeting appearance, while remaining an independently editable Meeting record.
_Avoid_: New membership Topic, person record; Aufnahmethema, Personendatensatz

**Recurrence interval (Wiederholungsintervall)**:
The positive number of weeks or calendar months between appearances of a Recurring Topic.
_Avoid_: Day count, frequency text; Tagesanzahl, Freitextfrequenz

**Recurring Topic (Wiederkehrendes Thema)**:
A Topic that becomes due from an explicit first due date and then from the date of its latest Meeting appearance plus its Recurrence interval. Automatic scheduling targets Planned Meetings only, and each appearance receives its own Meeting topic note initialized from the Topic's current Description.
_Avoid_: Repeated agenda section, recurring flag; Wiederkehrender Tagesordnungsabschnitt, Wiederholungskennzeichen

**Skipped recurrence (Übersprungene Wiederholung)**:
The explicit decision not to include a due Recurring Topic in one Meeting; it does not reset the recurrence interval and the Topic remains due for the next eligible Meeting.
_Avoid_: Deleted Topic, completed recurrence; Gelöschtes Thema, abgeschlossene Wiederholung

**Membership process status (Mitgliedschaftsprozessstatus)**:
Free-form text on a New membership Topic that describes the current state or next step of the membership process.
_Avoid_: Topic status; Themenstatus

**Membership status signal (Mitgliedschaftsstatussignal)**:
A constrained indication of overall membership-process progress, with the canonical values New, In progress, Nearly finished, Attention, and Paused.
_Avoid_: Status color; Statusfarbe

**Godparents (Paten)**:
Optional free-form names of the people who accompany prospective members through the membership process; they are not ElderFlow users or assignments.
_Avoid_: Responsible user, assignee; Verantwortlicher Benutzer, Zugewiesener

**Agenda (Tagesordnung)**:
The ordered structure of topics prepared for a meeting. The German abbreviation “TO” is acceptable where space is constrained.
_Avoid_: Schedule; Programm

**Agenda appearance source (Herkunft des Tagesordnungseintrags)**:
The origin of a Topic's appearance in a Meeting, either Manual or Recurrence; it determines whether removal deletes the appearance or records a Skipped recurrence.
_Avoid_: Topic type, creator; Themenart, Ersteller

**Meeting topic note (Sitzungsthemennotiz)**:
The single editable text attached to a Topic's appearance in one Meeting, which may be written during preparation or during the Meeting.
_Avoid_: Update, Minutes entry; Aktualisierung, Protokolleintrag

**Meeting topic snapshot (Sitzungsthemenstand)**:
The values preserved for a Topic appearance when its Meeting is completed, used to render that Meeting without later Topic changes rewriting its history.
_Avoid_: Current Topic, Update; Aktuelles Thema, Aktualisierung

**Agenda section (Tagesordnungsabschnitt)**:
A heading that groups related topics within an agenda. Use the German short form “Abschnitt” when the agenda context is already clear.
_Avoid_: Topic, agenda item; Thema, Tagesordnungspunkt

**Meeting minutes (Protokoll)**:
The complete record of a meeting.
_Avoid_: Minute; Notizen

**Minutes entry (Protokolleintrag)**:
A topic-history entry recorded as part of a meeting.
_Avoid_: Minute, update; Minute, Aktualisierung

**Update (Aktualisierung)**:
A topic-history entry recorded outside a meeting.
_Avoid_: Minutes entry; Protokolleintrag

**Topic history (Themenverlauf)**:
The chronological record of a Topic's standalone Updates, Meeting appearances, and Skipped recurrences, including Meeting topic notes, Minutes entries, and completed-Meeting snapshots where applicable.
_Avoid_: Activity log, Meeting history; Aktivitätsprotokoll, Sitzungshistorie

**Task (Aufgabe)**:
An actionable follow-up item that may be assigned to a user and completed.
_Avoid_: Action; Aktion

**User role (Benutzerrolle)**:
A user classification that determines their permissions, with the canonical English labels Superadmin, IT admin, Admin, User, and Guest, and the canonical German labels Superadministrator, IT-Administrator, Administrator, Benutzer, and Gast.
_Avoid_: Account type; Kontotyp

**Installation default language**:
The supported language an ElderFlow installation uses when no supported personal or browser preference is available, and for system-provided content created during initial setup.
_Avoid_: System language, fallback language

**User language preference**:
An optional supported language an authenticated user chooses for their own ElderFlow interface; when absent, the installation default language applies. It does not translate shared stored content.
_Avoid_: User locale, profile language
