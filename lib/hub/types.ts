import type { JsonObject } from '@/db/schema';

export type HubRecord<TData extends JsonObject = JsonObject> = {
  id: string;
  collectionId: string;
  createdBy: string;
  kind: string;
  status: string;
  schemaVersion: number;
  data: TData;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CreateRecordInput<TData extends JsonObject = JsonObject> = {
  collectionId: string;
  createdBy: string;
  kind?: string;
  schemaVersion?: number;
  data: TData;
  searchableText?: string;
};

export type ListRecordsInput = {
  collectionId: string;
  kind?: string;
  limit?: number;
  before?: Date;
};
