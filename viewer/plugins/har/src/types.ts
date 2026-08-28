export type HarNameValue = {
  readonly name: string;
  readonly value: string;
};

export type HarPostData = {
  readonly mimeType?: string;
  readonly text?: string;
  readonly params: readonly HarNameValue[];
};

export type HarEntry = {
  readonly startedDateTime?: string;
  readonly time: number;
  readonly serverIPAddress?: string;
  readonly connection?: string;
  readonly request: {
    readonly method: string;
    readonly url: string;
    readonly httpVersion?: string;
    readonly headers: readonly HarNameValue[];
    readonly queryString: readonly HarNameValue[];
    readonly headersSize?: number;
    readonly bodySize?: number;
    readonly postData?: HarPostData;
  };
  readonly response: {
    readonly status: number;
    readonly statusText?: string;
    readonly httpVersion?: string;
    readonly headers: readonly HarNameValue[];
    readonly redirectURL?: string;
    readonly headersSize?: number;
    readonly bodySize?: number;
    readonly content: {
      readonly size?: number;
      readonly compression?: number;
      readonly mimeType?: string;
      readonly text?: string;
      readonly encoding?: string;
    };
  };
  readonly timings: Readonly<Record<string, number>>;
};

export type HarDocument = {
  readonly version?: string;
  readonly creator?: string;
  readonly pageCount: number;
  readonly entries: readonly HarEntry[];
};
