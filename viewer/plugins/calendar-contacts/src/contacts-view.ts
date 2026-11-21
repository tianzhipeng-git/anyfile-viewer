import type { Locale } from "@anyfile/viewer-protocol";

import type { Contact, ContactAddress, ContactsDocument } from "./types";
import { copyFor, filterMatches, node, styles, type MailCopy } from "./ui";

const MAX_CARDS = 500;

export interface MailView {
  readonly root: HTMLElement;
  dispose(): void;
}

function monogram(contact: Contact, copy: MailCopy): string {
  const source = contact.formattedName ?? contact.name;
  const words = source.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) return "?";
  return words.map((word) => [...word][0] ?? "").join("") || copy.unnamed.slice(0, 1);
}

function addressText(address: ContactAddress): string {
  return [address.street, address.city, address.region, address.postalCode, address.country]
    .filter(Boolean).join(", ");
}

function field(label: string, value: string | undefined) {
  if (!value) return undefined;
  const row = node("div", "anyfile-calendar-contacts__field");
  row.append(node("span", "anyfile-calendar-contacts__label", label), node("span", "anyfile-calendar-contacts__value", value));
  return row;
}

function contactCard(contact: Contact, copy: MailCopy) {
  const card = node("article", "anyfile-calendar-contacts__card");
  const who = node("div", "anyfile-calendar-contacts__who");
  who.append(node("span", "anyfile-calendar-contacts__monogram", monogram(contact, copy)));
  const identity = node("div");
  identity.append(
    node("div", "anyfile-calendar-contacts__name", contact.formattedName ?? (contact.name || copy.unnamed)),
    node("div", "anyfile-calendar-contacts__role", [contact.organization, contact.title].filter(Boolean).join(" · ")),
  );
  who.append(identity);
  card.append(who);

  const fields = node("div", "anyfile-calendar-contacts__fields");
  const add = (row: HTMLElement | undefined) => {
    if (row) fields.append(row);
  };
  for (const phone of contact.phones) add(field(phone.label ? `${copy.phone} · ${phone.label}` : copy.phone, phone.value));
  for (const email of contact.emails) add(field(email.label ? `${copy.email} · ${email.label}` : copy.email, email.value));
  for (const address of contact.addresses) {
    add(field(address.label ? `${copy.address} · ${address.label}` : copy.address, addressText(address)));
  }
  for (const url of contact.urls) add(field(copy.website, url));
  add(field(copy.nickname, contact.nickname));
  add(field(copy.birthday, contact.birthday));
  add(field(copy.categories, contact.categories.join(", ")));
  add(field(copy.note, contact.note));
  if (contact.hasPhoto) add(field(copy.photo, copy.photo));
  if (fields.childElementCount > 0) card.append(fields);

  const searchable = [
    contact.formattedName, contact.name, contact.organization, contact.title, contact.nickname, contact.note,
    contact.categories.join(" "), ...contact.phones.map(({ value }) => value),
    ...contact.emails.map(({ value }) => value), ...contact.urls,
    ...contact.addresses.map(addressText),
  ].filter(Boolean).join(" ").toLowerCase();
  card.dataset.search = searchable;
  return card;
}

export function createContactsView(options: {
  document: ContactsDocument;
  fileName: string;
  fileSize: number;
  locale: Locale;
}): MailView {
  const { document, fileName, fileSize, locale } = options;
  const copy = copyFor(locale);
  const total = document.contacts.length;
  const root = node("div", "anyfile-calendar-contacts");
  const header = node("div", "anyfile-calendar-contacts__header");
  header.append(
    node("span", "anyfile-calendar-contacts__title", fileName),
    node("span", "anyfile-calendar-contacts__meta", [
      copy.contacts,
      `${total}`,
      document.version ? `vCard ${document.version}` : undefined,
      `${copy.fileSize}: ${fileSize.toLocaleString(locale)} B`,
    ].filter(Boolean).join(" · ")),
  );

  const toolbar = node("div", "anyfile-calendar-contacts__toolbar");
  const search = node("input", "anyfile-calendar-contacts__search");
  search.type = "search";
  search.placeholder = copy.searchContacts;
  search.setAttribute("aria-label", copy.searchContacts);
  const count = node("span", "anyfile-calendar-contacts__count");
  toolbar.append(search, count);

  const viewport = node("div", "anyfile-calendar-contacts__viewport");
  const grid = node("div", "anyfile-calendar-contacts__grid");
  const cards = document.contacts.slice(0, MAX_CARDS).map((contact) => contactCard(contact, copy));
  grid.append(...cards);
  const empty = node("p", "anyfile-calendar-contacts__empty", total === 0 ? copy.noContacts : copy.noMatch);
  empty.hidden = cards.length > 0;
  viewport.append(grid, empty);
  if (total > MAX_CARDS) viewport.append(node("p", "anyfile-calendar-contacts__empty", `+ ${total - MAX_CARDS}`));

  const update = () => {
    let shown = 0;
    for (const card of cards) {
      card.hidden = !filterMatches(search.value, [card.dataset.search]);
      if (!card.hidden) shown += 1;
    }
    count.textContent = `${shown} / ${cards.length}`;
    empty.textContent = cards.length === 0 ? copy.noContacts : copy.noMatch;
    empty.hidden = shown > 0;
  };
  const onInput = () => update();
  search.addEventListener("input", onInput);
  update();

  root.append(styles(), header, toolbar, viewport);
  return {
    root,
    dispose() {
      search.removeEventListener("input", onInput);
      root.remove();
    },
  };
}
