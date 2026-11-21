import { decodeValue, propertiesOf, propertyOf, splitEscaped, textOf, type ContentComponent, type ContentLine } from "./parse";
import type { Contact, ContactAddress, ContactField, ContactsDocument } from "./types";

const MAX_CONTACTS = 2000;
const MAX_FIELDS = 32;

function fieldOf(line: ContentLine): ContactField {
  const types = (line.params.TYPE ?? []).filter((type) => type.toUpperCase() !== "PREF");
  const pref = (line.params.TYPE ?? []).some((type) => type.toUpperCase() === "PREF");
  const label = [...types, ...(pref ? ["PREF"] : [])].join(", ");
  return { label: label || undefined, value: decodeValue(line).trim() };
}

function propertyFields(component: ContentComponent, name: string): ContactField[] {
  return propertiesOf(component, name)
    .slice(0, MAX_FIELDS)
    .map(fieldOf)
    .filter(({ value }) => value.length > 0);
}

function readAddress(line: ContentLine): ContactAddress {
  const [poBox, extended, street, city, region, postalCode, country] = splitEscaped(decodeValue(line), ";");
  const parts = { poBox: poBox?.trim(), extended: extended?.trim(), street, city, region, postalCode, country };
  const label = (line.params.TYPE ?? []).join(", ");
  return {
    label: label || undefined,
    street: [parts.poBox, parts.extended, parts.street?.trim()].filter(Boolean).join(", ") || undefined,
    city: parts.city?.trim() || undefined,
    region: parts.region?.trim() || undefined,
    postalCode: parts.postalCode?.trim() || undefined,
    country: parts.country?.trim() || undefined,
  };
}

function readContact(card: ContentComponent): Contact {
  const formattedName = textOf(card, "FN");
  const structured = propertyOf(card, "N");
  const [family, given, additional, prefix, suffix] = structured
    ? splitEscaped(decodeValue(structured), ";")
    : [];
  const structuredName = [prefix, given, additional, family, suffix]
    .map((part) => part?.trim()).filter(Boolean).join(" ") || undefined;
  const organization = propertyOf(card, "ORG") ? splitEscaped(decodeValue(propertyOf(card, "ORG")!), ";")[0]?.trim() : undefined;
  const note = textOf(card, "NOTE");
  const categories = propertyOf(card, "CATEGORIES")
    ? splitEscaped(decodeValue(propertyOf(card, "CATEGORIES")!), ",").map((item) => item.trim()).filter(Boolean).slice(0, 16)
    : [];
  const emails = propertyFields(card, "EMAIL");
  const name = formattedName ?? structuredName ?? organization ?? emails[0]?.value ?? "";
  return {
    name,
    formattedName,
    organization: organization || undefined,
    title: textOf(card, "TITLE"),
    phones: propertyFields(card, "TEL"),
    emails,
    addresses: propertiesOf(card, "ADR").slice(0, 8).map(readAddress),
    urls: propertiesOf(card, "URL").slice(0, 8).map((line) => decodeValue(line).trim()).filter(Boolean),
    note: note && note.length > 2000 ? `${note.slice(0, 2000)}…` : note,
    birthday: textOf(card, "BDAY"),
    nickname: textOf(card, "NICKNAME"),
    categories,
    hasPhoto: Boolean(propertyOf(card, "PHOTO")),
  };
}

export function parseContacts(cards: readonly ContentComponent[]): ContactsDocument {
  const contacts = cards.slice(0, MAX_CONTACTS).map(readContact);
  return { kind: "contacts", version: cards[0] ? textOf(cards[0], "VERSION") : undefined, contacts };
}
