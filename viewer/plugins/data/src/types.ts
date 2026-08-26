export type DataSet = {
  readonly id: string;
  readonly label: string;
};

export type DataPage = {
  readonly columns: readonly { name: string; type: string }[];
  readonly rows: readonly (readonly string[])[];
  readonly hasMore: boolean;
};

export interface DataSession {
  readonly dataSets: readonly DataSet[];
  query(dataSetId: string, offset: number, limit: number): Promise<DataPage>;
  dispose(): Promise<void>;
}
