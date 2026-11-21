import { selectMessages, type Locale } from "@anyfile/viewer-protocol";

import type { CalendarMoment } from "./types";

export function copyFor(locale: Locale) {
  return selectMessages(locale, {
    en: {
      calendar: "Calendar", contacts: "Contacts", events: "events", tasks: "Tasks", search: "Search", noTitle: "Untitled event",
      searchCalendar: "Filter by title, place, description or category", searchContacts: "Filter by name, organization, email or phone",
      noMatch: "Nothing matches this filter.", noEvents: "This calendar has no events.", noContacts: "This file has no contacts.",
      unscheduled: "No start time", allDay: "All day", organizer: "Organizer", attendees: "Attendees", details: "Details",
      description: "Description", recurrence: "Repeats", alarms: "Reminders", status: "Status", categories: "Categories",
      link: "Link", due: "Due", timezone: "Time zone", version: "Version", product: "Produced by", fileSize: "File size", contents: "Contents",
      phone: "Phone", email: "Email", address: "Address", website: "Website", note: "Note", birthday: "Birthday", nickname: "Nickname",
      organization: "Organization", title: "Job title", photo: "This card contains a photo, which is not displayed.", unnamed: "Unnamed contact",
    },
    "zh-CN": {
      calendar: "日历", contacts: "联系人", events: "个日程", tasks: "任务", search: "搜索", noTitle: "无标题日程",
      searchCalendar: "按标题、地点、描述或分类筛选", searchContacts: "按姓名、组织、邮箱或电话筛选",
      noMatch: "没有匹配的内容。", noEvents: "该日历没有日程。", noContacts: "该文件没有联系人。",
      unscheduled: "没有开始时间", allDay: "全天", organizer: "组织者", attendees: "参与者", details: "详情",
      description: "描述", recurrence: "重复规则", alarms: "提醒", status: "状态", categories: "分类",
      link: "链接", due: "截止", timezone: "时区", version: "版本", product: "生成程序", fileSize: "文件大小", contents: "内容",
      phone: "电话", email: "邮箱", address: "地址", website: "网址", note: "备注", birthday: "生日", nickname: "昵称",
      organization: "组织", title: "职位", photo: "该名片包含照片，未在此显示。", unnamed: "未命名联系人",
    },
  });
}

export type MailCopy = ReturnType<typeof copyFor>;

export function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function styles() {
  const style = node("style");
  style.textContent = `
    .anyfile-calendar-contacts { box-sizing:border-box; display:flex; height:100%; min-height:0; width:100%; flex-direction:column; overflow:hidden; background:var(--viewer-background,#fff); color:var(--viewer-foreground,#111); font-family:var(--viewer-font-family,system-ui); }
    .anyfile-calendar-contacts * { box-sizing:border-box; }
    .anyfile-calendar-contacts__header { flex:none; padding:14px 18px 10px; border-bottom:1px solid var(--viewer-border,#ddd); }
    .anyfile-calendar-contacts__title { display:block; overflow:hidden; font-size:17px; text-overflow:ellipsis; white-space:nowrap; }
    .anyfile-calendar-contacts__meta { display:block; margin-top:3px; color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); font-size:12px; overflow-wrap:anywhere; }
    .anyfile-calendar-contacts__toolbar { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:9px 18px; border-bottom:1px solid var(--viewer-border,#ddd); }
    .anyfile-calendar-contacts__search { box-sizing:border-box; width:min(360px,100%); height:32px; border:1px solid var(--viewer-border,#ccc); border-radius:7px; padding:0 10px; background:var(--viewer-background,#fff); color:inherit; font:inherit; font-size:13px; }
    .anyfile-calendar-contacts__count { color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); font-size:12px; }
    .anyfile-calendar-contacts__viewport { min-height:0; flex:1; overflow:auto; padding:14px 18px 28px; }
    .anyfile-calendar-contacts__empty { padding:24px 0; color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); font-size:13px; }
    .anyfile-calendar-contacts__section-title { margin:18px 0 8px; font-size:13px; font-weight:600; letter-spacing:.02em; color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); text-transform:uppercase; }
    .anyfile-calendar-contacts__event { display:flex; gap:14px; max-width:1000px; border-bottom:1px solid var(--viewer-border,#eee); padding:10px 0; }
    .anyfile-calendar-contacts__when { flex:none; width:150px; font-size:12px; line-height:1.45; color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); font-variant-numeric:tabular-nums; }
    .anyfile-calendar-contacts__body { min-width:0; flex:1; }
    .anyfile-calendar-contacts__summary { margin:0; font-size:14px; font-weight:600; overflow-wrap:anywhere; }
    .anyfile-calendar-contacts__line { margin:4px 0 0; font-size:13px; line-height:1.5; overflow-wrap:anywhere; }
    .anyfile-calendar-contacts__muted { color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); }
    .anyfile-calendar-contacts__chips { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
    .anyfile-calendar-contacts__chip { border:1px solid var(--viewer-border,#ccc); border-radius:999px; padding:1px 8px; font-size:11px; color:color-mix(in srgb, var(--viewer-foreground,#111) 78%, transparent); }
    .anyfile-calendar-contacts__details { margin-top:8px; font-size:13px; }
    .anyfile-calendar-contacts__details summary { cursor:pointer; color:var(--viewer-accent,#2563eb); font-size:12px; }
    .anyfile-calendar-contacts__panel { margin-top:8px; display:grid; grid-template-columns:minmax(90px,140px) 1fr; gap:6px 14px; }
    .anyfile-calendar-contacts__panel dt { color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); }
    .anyfile-calendar-contacts__panel dd { margin:0; min-width:0; overflow-wrap:anywhere; white-space:pre-wrap; }
    .anyfile-calendar-contacts__grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; max-width:1200px; }
    .anyfile-calendar-contacts__card { border:1px solid var(--viewer-border,#ddd); border-radius:10px; padding:12px 14px; background:color-mix(in srgb, var(--viewer-foreground,#111) 2%, transparent); }
    .anyfile-calendar-contacts__who { display:flex; align-items:center; gap:10px; min-width:0; }
    .anyfile-calendar-contacts__monogram { flex:none; display:flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:50%; background:color-mix(in srgb, var(--viewer-accent,#2563eb) 16%, transparent); color:inherit; font-size:13px; font-weight:600; text-transform:uppercase; }
    .anyfile-calendar-contacts__name { min-width:0; overflow:hidden; font-size:14px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
    .anyfile-calendar-contacts__role { min-width:0; overflow:hidden; color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
    .anyfile-calendar-contacts__fields { display:grid; grid-template-columns:auto; gap:4px; margin:10px 0 0; font-size:12.5px; }
    .anyfile-calendar-contacts__field { display:flex; gap:8px; min-width:0; }
    .anyfile-calendar-contacts__label { flex:none; width:66px; color:color-mix(in srgb, var(--viewer-foreground,#111) 66%, transparent); }
    .anyfile-calendar-contacts__value { min-width:0; overflow-wrap:anywhere; }
    @media (max-width:520px) {
      .anyfile-calendar-contacts__event { flex-direction:column; gap:4px; }
      .anyfile-calendar-contacts__when { width:auto; }
    }
  `;
  return style;
}

function momentDate(moment: CalendarMoment): Date {
  return new Date(Date.UTC(moment.year, moment.month - 1, moment.day, moment.hour, moment.minute, moment.second));
}

export function formatDate(moment: CalendarMoment, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(momentDate(moment));
}

export function formatMoment(moment: CalendarMoment, locale: Locale): string {
  const date = momentDate(moment);
  const dateText = formatDate(moment, locale);
  if (moment.dateOnly) return dateText;
  const timeText = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(date);
  const zone = moment.utc ? "UTC" : moment.timeZone;
  return zone ? `${dateText} ${timeText} ${zone}` : `${dateText} ${timeText}`;
}

export function timeOf(moment: CalendarMoment, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" })
    .format(momentDate(moment));
}

export function sameDay(left: CalendarMoment, right: CalendarMoment): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

export function filterMatches(query: string, texts: readonly (string | undefined)[]): boolean {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return texts.some((text) => text?.toLowerCase().includes(needle));
}
