export interface X6DngWorkerRequest {
  readonly file: File;
}

export type X6DngWorkerResponse =
  | { readonly type: "decoded"; readonly bitmap: ImageBitmap }
  | { readonly type: "error"; readonly message: string };
