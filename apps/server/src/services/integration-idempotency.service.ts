import { createHash, randomUUID } from "node:crypto";
import { isDatabaseConnected } from "../config/database";
import { IntegrationIdempotencyKeyModel } from "../models/integration-idempotency-key.model";
import { HttpError } from "../utils/http-error";

type IdempotencyStatus = "processing" | "completed" | "failed";

interface LocalIntegrationIdempotencyRecord {
  id: string;
  userId: string;
  source: "n8n";
  idempotencyKey: string;
  operation: string;
  requestHash: string;
  status: IdempotencyStatus;
  response?: unknown;
  error?: { statusCode: number; message: string };
  startedAt: Date;
  completedAt?: Date | null;
  failedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type LeanIntegrationIdempotencyRecord = Record<string, unknown> & {
  _id?: unknown;
  userId?: unknown;
  idempotencyKey?: unknown;
  operation?: unknown;
  requestHash?: unknown;
  status?: unknown;
  response?: unknown;
  error?: { statusCode?: unknown; message?: unknown } | null;
};

const localIntegrationIdempotencyRecords: LocalIntegrationIdempotencyRecord[] = [];
const replayWaitMs = 25;
const replayTimeoutMs = 5_000;

export interface IntegrationIdempotentResult<T> {
  result: T;
  idempotentReplay: boolean;
}

interface IntegrationIdempotencyInput<T> {
  userId: string;
  idempotencyKey: string;
  operation: string;
  request: unknown;
  execute: () => Promise<T>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeForHash(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (!value || typeof value !== "object") return value;

  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry !== undefined) normalized[key] = normalizeForHash(entry);
  }
  return normalized;
}

function buildRequestHash(operation: string, request: unknown) {
  const payload = JSON.stringify(normalizeForHash({ operation, request }));
  return createHash("sha256").update(payload).digest("hex");
}

export function validateIntegrationIdempotencyKey(value: string | null | undefined) {
  const key = (value ?? "").trim();
  if (!key) throw new HttpError(400, "Idempotency-Key obrigatoria para operacoes financeiras.");
  if (!/^[\x21-\x7E]{8,256}$/.test(key)) {
    throw new HttpError(400, "Idempotency-Key invalida. Use de 8 a 256 caracteres ASCII imprimiveis, sem espacos.");
  }
  return key;
}

function duplicateKey(error: unknown) {
  return (error as { code?: number }).code === 11000;
}

function errorSnapshot(error: unknown) {
  if (error instanceof HttpError) return { statusCode: error.statusCode, message: error.message };
  return { statusCode: 500, message: error instanceof Error ? error.message : "Falha ao executar operacao idempotente." };
}

function assertSameOperation(record: Pick<LocalIntegrationIdempotencyRecord, "operation" | "requestHash"> | LeanIntegrationIdempotencyRecord, operation: string, requestHash: string) {
  if (String(record.operation ?? "") !== operation || String(record.requestHash ?? "") !== requestHash) {
    throw new HttpError(409, "Idempotency-Key ja foi usada para outra operacao ou payload.");
  }
}

function replayRecord<T>(record: LocalIntegrationIdempotencyRecord | LeanIntegrationIdempotencyRecord): IntegrationIdempotentResult<T> {
  if (record.status === "completed") {
    return { result: record.response as T, idempotentReplay: true };
  }

  if (record.status === "failed") {
    const error = record.error;
    const statusCode = Number(error?.statusCode ?? 500);
    const message = String(error?.message || "Operacao idempotente anterior falhou.");
    throw new HttpError(statusCode, message);
  }

  throw new HttpError(409, "Operacao idempotente ainda esta em processamento. Tente novamente com a mesma chave.");
}

async function waitForMongoCompletion(userId: string, idempotencyKey: string, operation: string, requestHash: string) {
  const deadline = Date.now() + replayTimeoutMs;
  let record: LeanIntegrationIdempotencyRecord | null = null;

  do {
    record = await IntegrationIdempotencyKeyModel.findOne({ userId, idempotencyKey }).lean() as LeanIntegrationIdempotencyRecord | null;
    if (!record) throw new HttpError(409, "Registro idempotente nao encontrado apos conflito de chave.");
    assertSameOperation(record, operation, requestHash);
    if (record.status !== "processing") return record;
    await sleep(replayWaitMs);
  } while (Date.now() < deadline);

  return record;
}

async function executeWithMongoIdempotency<T>(input: IntegrationIdempotencyInput<T>, requestHash: string): Promise<IntegrationIdempotentResult<T>> {
  let reserved: LeanIntegrationIdempotencyRecord;

  try {
    reserved = await IntegrationIdempotencyKeyModel.create({
      userId: input.userId,
      source: "n8n",
      idempotencyKey: input.idempotencyKey,
      operation: input.operation,
      requestHash,
      status: "processing",
      startedAt: new Date()
    }).then((record) => record.toObject()) as LeanIntegrationIdempotencyRecord;
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const replayable = await waitForMongoCompletion(input.userId, input.idempotencyKey, input.operation, requestHash);
    return replayRecord<T>(replayable);
  }

  try {
    const result = await input.execute();
    await IntegrationIdempotencyKeyModel.findByIdAndUpdate(reserved._id, {
      status: "completed",
      response: result,
      completedAt: new Date()
    });
    return { result, idempotentReplay: false };
  } catch (error) {
    await IntegrationIdempotencyKeyModel.findByIdAndUpdate(reserved._id, {
      status: "failed",
      error: errorSnapshot(error),
      failedAt: new Date()
    }).catch(() => undefined);
    throw error;
  }
}

async function waitForLocalCompletion(userId: string, idempotencyKey: string, operation: string, requestHash: string) {
  const deadline = Date.now() + replayTimeoutMs;
  let record: LocalIntegrationIdempotencyRecord | undefined;

  do {
    record = localIntegrationIdempotencyRecords.find((item) => item.userId === userId && item.idempotencyKey === idempotencyKey);
    if (!record) throw new HttpError(409, "Registro idempotente nao encontrado apos conflito de chave.");
    assertSameOperation(record, operation, requestHash);
    if (record.status !== "processing") return record;
    await sleep(replayWaitMs);
  } while (Date.now() < deadline);

  return record;
}

async function executeWithLocalIdempotency<T>(input: IntegrationIdempotencyInput<T>, requestHash: string): Promise<IntegrationIdempotentResult<T>> {
  const existing = localIntegrationIdempotencyRecords.find((item) => item.userId === input.userId && item.idempotencyKey === input.idempotencyKey);
  if (existing) {
    assertSameOperation(existing, input.operation, requestHash);
    const replayable = existing.status === "processing"
      ? await waitForLocalCompletion(input.userId, input.idempotencyKey, input.operation, requestHash)
      : existing;
    return replayRecord<T>(replayable);
  }

  const now = new Date();
  const record: LocalIntegrationIdempotencyRecord = {
    id: randomUUID(),
    userId: input.userId,
    source: "n8n",
    idempotencyKey: input.idempotencyKey,
    operation: input.operation,
    requestHash,
    status: "processing",
    startedAt: now,
    createdAt: now,
    updatedAt: now
  };
  localIntegrationIdempotencyRecords.push(record);

  try {
    const result = await input.execute();
    record.status = "completed";
    record.response = result;
    record.completedAt = new Date();
    record.updatedAt = record.completedAt;
    return { result, idempotentReplay: false };
  } catch (error) {
    record.status = "failed";
    record.error = errorSnapshot(error);
    record.failedAt = new Date();
    record.updatedAt = record.failedAt;
    throw error;
  }
}

export async function executeIntegrationIdempotentOperation<T>(input: IntegrationIdempotencyInput<T>): Promise<IntegrationIdempotentResult<T>> {
  const idempotencyKey = validateIntegrationIdempotencyKey(input.idempotencyKey);
  const requestHash = buildRequestHash(input.operation, input.request);
  const normalizedInput = { ...input, idempotencyKey };

  if (isDatabaseConnected()) return executeWithMongoIdempotency(normalizedInput, requestHash);
  return executeWithLocalIdempotency(normalizedInput, requestHash);
}
