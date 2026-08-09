import type { annotationContract, sourceContract } from "./contracts.js";
import type {
  ConnectOutcome,
  CreateInput,
  DeleteInput,
  DeletePreflightResult,
  DeleteProgressOptions,
  DeleteResult,
  MdbaseConnection,
  QueryInput,
  QueryResult,
  ReadInput,
  RecordDocument,
  UpdateInput,
} from "@mdbase-dev/connect";
import type { ReaderRequestOptions } from "@mdbase-reader/core";

export interface ReaderConnectClient {
  read(input: ReadInput, options?: ReaderRequestOptions): Promise<ConnectOutcome<RecordDocument>>;
  query(input: QueryInput, options?: ReaderRequestOptions): Promise<ConnectOutcome<QueryResult>>;
  create(input: CreateInput): Promise<ConnectOutcome<RecordDocument>>;
  update(input: UpdateInput): Promise<ConnectOutcome<RecordDocument>>;
  preflightDelete(input: DeleteInput): Promise<ConnectOutcome<DeletePreflightResult>>;
  deleteWithProgress(
    input: DeleteInput,
    options?: DeleteProgressOptions,
  ): Promise<ConnectOutcome<DeleteResult>>;
}

export class ConnectRepositoryError extends Error {
  constructor(operation: string, code: string, detail?: string) {
    super(`mdbase Connect could not ${operation}: ${detail ?? code}`);
    this.name = "ConnectRepositoryError";
  }
}

export function outcomeValue<Value>(outcome: ConnectOutcome<Value>, operation: string): Value {
  if (outcome.ok) {
    return outcome.value;
  }
  throw new ConnectRepositoryError(operation, outcome.problem.code, outcome.problem.message);
}

export function cursorOffset(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const offset = Number.parseInt(cursor, 10);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

export function queryWithOptions(
  client: ReaderConnectClient,
  input: QueryInput,
  options: ReaderRequestOptions,
): Promise<ConnectOutcome<QueryResult>> {
  return options.signal ? client.query(input, options) : client.query(input);
}

export function readWithOptions(
  client: ReaderConnectClient,
  input: ReadInput,
  options: ReaderRequestOptions,
): Promise<ConnectOutcome<RecordDocument>> {
  return options.signal ? client.read(input, options) : client.read(input);
}

export async function recordPathById(
  client: ReaderConnectClient,
  contract: typeof sourceContract | typeof annotationContract,
  id: string,
  options: ReaderRequestOptions = {},
): Promise<string | null> {
  const result = outcomeValue(
    await queryWithOptions(client, { contract, frontmatterMode: "effective", limit: 500 }, options),
    "query records",
  );
  return (
    result.results.find(
      ({ effectiveFrontmatter, frontmatter }) =>
        (effectiveFrontmatter ?? frontmatter)?.["id"] === id,
    )?.path ?? null
  );
}

export function connectClient(connection: MdbaseConnection): ReaderConnectClient {
  return {
    read: (input, options) => connection.read(input, options),
    query: (input, options) => connection.query(input, options),
    create: (input) => connection.create(input),
    update: (input) => connection.update(input),
    preflightDelete: (input) => connection.preflightDelete(input),
    deleteWithProgress: (input, options) => connection.deleteWithProgress(input, options),
  };
}
