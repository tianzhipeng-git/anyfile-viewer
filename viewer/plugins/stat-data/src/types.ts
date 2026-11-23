export const RUNTIME_BASE = "/vendor/readstat/1.1.9-anyfile.1/";
/** Matches the adapter's format switch in `tools/readstat-build/adapter.c`. */
export const STAT_FORMATS = { sav: 0, por: 1, dta: 2, sas7bdat: 3, xpt: 4 } as const;
export type StatFormat = keyof typeof STAT_FORMATS;
export type ErrorCode = "invalid-file" | "resource-limit" | "unsupported-environment";

/** A cell: number, string, system missing (`null`) or tagged missing such as Stata `.a`. */
export type StatValue = number | string | null | { readonly t: string };
export type StatVariable = {
  readonly name: string;
  readonly label: string;
  readonly format: string;
  readonly labels: string;
  readonly string: boolean;
  readonly storage: number;
  readonly display: number;
  readonly measure: number;
  readonly missing: readonly (readonly [StatValue, StatValue])[];
};
export type StatSchema = {
  readonly meta: {
    readonly rows: number;
    readonly variables: number;
    readonly created: number;
    readonly modified: number;
    readonly version: number;
    readonly compression: number;
    readonly table: string;
    readonly label: string;
    readonly encoding: string;
  };
  readonly variables: readonly StatVariable[];
  readonly labels: readonly { readonly name: string; readonly values: readonly (readonly [StatValue, string])[] }[];
  readonly notes: readonly string[];
  readonly incomplete?: true;
};

export type Request =
  | { id: number; type: "init"; baseUrl: string }
  | { id: number; type: "open"; file: Blob; format: StatFormat }
  | { id: number; type: "rows"; offset: number; limit: number; firstColumn: number; lastColumn: number };
export type Response =
  | { id: number; type: "ready" }
  | { id: number; type: "schema"; schema: StatSchema }
  | { id: number; type: "rows"; rows: StatValue[][] }
  | { id: number; type: "error"; code: ErrorCode; message: string };
