export interface CalendarMoment {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly dateOnly: boolean;
  readonly utc: boolean;
  readonly timeZone?: string;
}

export interface CalendarPerson {
  readonly address: string;
  readonly name?: string;
  readonly role?: string;
  readonly status?: string;
}

export interface CalendarEvent {
  readonly uid?: string;
  readonly summary: string;
  readonly description?: string;
  readonly location?: string;
  readonly start?: CalendarMoment;
  readonly end?: CalendarMoment;
  readonly duration?: string;
  readonly organizer?: CalendarPerson;
  readonly attendees: readonly CalendarPerson[];
  readonly status?: string;
  readonly categories: readonly string[];
  readonly url?: string;
  readonly recurrence?: string;
  readonly classification?: string;
  readonly alarms: number;
  readonly created?: CalendarMoment;
  readonly lastModified?: CalendarMoment;
}

export interface CalendarTask {
  readonly summary: string;
  readonly due?: CalendarMoment;
  readonly status?: string;
  readonly priority?: string;
  readonly description?: string;
}

export interface CalendarDocument {
  readonly kind: "calendar";
  readonly name?: string;
  readonly timeZone?: string;
  readonly productId?: string;
  readonly version?: string;
  readonly method?: string;
  readonly events: readonly CalendarEvent[];
  readonly tasks: readonly CalendarTask[];
  readonly componentCounts: readonly { readonly name: string; readonly count: number }[];
}

export interface ContactField {
  readonly label?: string;
  readonly value: string;
}

export interface ContactAddress {
  readonly label?: string;
  readonly street?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly country?: string;
}

export interface Contact {
  readonly name: string;
  readonly formattedName?: string;
  readonly organization?: string;
  readonly title?: string;
  readonly phones: readonly ContactField[];
  readonly emails: readonly ContactField[];
  readonly addresses: readonly ContactAddress[];
  readonly urls: readonly string[];
  readonly note?: string;
  readonly birthday?: string;
  readonly nickname?: string;
  readonly categories: readonly string[];
  readonly hasPhoto: boolean;
}

export interface ContactsDocument {
  readonly kind: "contacts";
  readonly version?: string;
  readonly contacts: readonly Contact[];
}

export type MailDocument = CalendarDocument | ContactsDocument;
