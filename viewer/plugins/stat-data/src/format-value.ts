import type { StatFormat, StatSchema, StatValue, StatVariable } from "./types";

const DAY = 86_400_000;
/** Day 0 of SAS and Stata dates (1960-01-01) and of SPSS seconds (1582-10-14), in Unix ms. */
const EPOCH_1960 = Date.UTC(1960, 0, 1);
const EPOCH_1582 = Date.UTC(1582, 9, 14);

type Kind = "date" | "datetime" | "time" | "month" | "quarter" | "week" | "half" | "year";
const SAS_KINDS: readonly [RegExp, Kind][] = [
  [/^(DATETIME|DATEAMPM|E8601DT|B8601DT|E8601DZ|IS8601DT|DTDATE|DTMONYY|DTYEAR|DTWKDATX|MDYAMPM|NLDATM)/, "datetime"],
  [/^(TIME|TOD|HHMM|HOUR|MMSS|E8601TM|B8601TM|NLTIME)/, "time"],
  [/^(DATE|DAY|DDMMYY|MMDDYY|YYMMDD|E8601DA|B8601DA|IS8601DA|MONYY|MMYY|YYMM|YYQ|WEEKDAT|WORDDAT|JULIAN|NLDATE|EURDF|MINGUO|NENGO|DOWNAME|WEEKDAY|MONNAME|MONTH|QTR|YEAR)/, "date"],
];
const SPSS_KINDS: readonly [RegExp, Kind][] = [
  [/^(DATETIME|YMDHMS)/, "datetime"],
  [/^(TIME|DTIME|MTIME)/, "time"],
  [/^(DATE|ADATE|EDATE|JDATE|SDATE|QYR|MOYR|WKYR)/, "date"],
];

function kindOf(format: StatFormat, pattern: string): Kind | undefined {
  const upper = pattern.toUpperCase();
  if (format === "dta") {
    const stata = /^%-?t?([cCdwmqhy])/.exec(pattern);
    if (!stata || (!pattern.includes("t") && stata[1] !== "d")) return undefined;
    return ({ c: "datetime", C: "datetime", d: "date", w: "week", m: "month", q: "quarter", h: "half", y: "year" } as const)[stata[1] as "c"];
  }
  return (format === "sav" || format === "por" ? SPSS_KINDS : SAS_KINDS).find(([regex]) => regex.test(upper))?.[1];
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0");
function isoDate(ms: number) {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  return `${year < 0 ? "-" : ""}${pad(Math.abs(year), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
function clock(ms: number) {
  const date = new Date(ms);
  const fraction = date.getUTCMilliseconds();
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}${fraction ? `.${pad(fraction, 3).replace(/0+$/, "")}` : ""}`;
}
function duration(seconds: number) {
  const sign = seconds < 0 ? "-" : "";
  const total = Math.abs(seconds);
  const whole = Math.floor(total);
  const fraction = Math.round((total - whole) * 1000);
  return `${sign}${Math.floor(whole / 3600)}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}${fraction ? `.${pad(fraction, 3).replace(/0+$/, "")}` : ""}`;
}

function temporal(format: StatFormat, kind: Kind, value: number): string | undefined {
  const spss = format === "sav" || format === "por";
  const base = spss ? EPOCH_1582 : EPOCH_1960;
  const periods = (per: number, symbol: string) => `${1960 + Math.floor(value / per)}${symbol}${(((value % per) + per) % per) + 1}`;
  switch (kind) {
    case "time": return duration(value);
    case "month": return `${1960 + Math.floor(value / 12)}-${pad((((value % 12) + 12) % 12) + 1)}`;
    case "quarter": return periods(4, "Q");
    case "half": return periods(2, "H");
    case "week": return periods(52, "W");
    case "year": return String(value);
    default: break;
  }
  // SAS and Stata dates count days; SPSS dates and SAS datetimes count seconds; Stata datetimes count ms.
  const ms = Math.floor(base + (format === "dta" ? (kind === "date" ? value * DAY : value) : spss || kind === "datetime" ? value * 1000 : value * DAY));
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return undefined;
  return kind === "date" ? isoDate(ms) : `${isoDate(ms)} ${clock(ms)}`;
}

const valueKey = (value: StatValue) => value === null ? "null" : typeof value === "object" ? `t:${value.t}` : `${typeof value}:${value}`;

/** Renders cells with dates, value labels, missing tags and the precision the file actually stores. */
export function createValueFormatter(format: StatFormat, schema: StatSchema) {
  const sets = new Map<string, Map<string, string>>();
  for (const set of schema.labels) {
    const values = sets.get(set.name) ?? new Map<string, string>();
    for (const [value, label] of set.values) values.set(valueKey(value), label);
    sets.set(set.name, values);
  }
  const sas = format === "sas7bdat" || format === "xpt";
  const plain = (value: StatValue) => value === null ? "." : typeof value === "object" ? `.${value.t}` : String(value);
  return {
    plain,
    cell(variable: StatVariable, value: StatValue): string {
      const label = sets.get(variable.labels)?.get(valueKey(value));
      if (typeof value !== "number") return label === undefined || label === value ? plain(value) : `${label} (${plain(value)})`;
      const kind = kindOf(format, variable.format);
      // Like spreadsheets, show at most 15 significant digits; SAS may also truncate doubles to 3–7 bytes.
      const precise = Number(value.toPrecision(sas && variable.storage < 8 ? Math.ceil((variable.storage * 8 - 11) * Math.log10(2)) : 15));
      const text = kind ? temporal(format, kind, value) ?? String(precise) : String(precise);
      return label === undefined ? text : `${label} (${text})`;
    },
  };
}
