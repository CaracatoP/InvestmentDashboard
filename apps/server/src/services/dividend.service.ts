import { findAssetByTicker, createDividend, findDividendById, listDividends, updateDividend } from "../repositories/investment.repository";
import type { DividendRecord } from "../types/investment";
import { HttpError, notFound } from "../utils/http-error";
import { normalizeTicker } from "./ticker.service";

type DividendType = "dividendo" | "jcp" | "rendimento" | "amortizacao" | "outro";

export interface ReceiveDividendInput {
  receivedAt?: string;
  paymentDate?: string;
  totalValue?: number;
  amountPerShare?: number;
  valuePerShare?: number;
  quantityEligible?: number;
  grossAmount?: number;
  netAmount?: number;
  notes?: string;
}

function toDateKey(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function toCents(value?: number | null) {
  return Math.round(Number(value ?? 0) * 100);
}

function dividendAmount(dividend: DividendRecord) {
  return dividend.netAmount ?? dividend.totalValue;
}

function normalizeOptionalTicker(ticker?: string | null) {
  return ticker ? normalizeTicker(ticker) : "";
}

function normalizeReceivedDividendInput(input: Omit<DividendRecord, "id">): Omit<DividendRecord, "id"> {
  const status = input.status ?? "received";
  const paymentDate = input.paymentDate;
  const receivedAt = status === "received" ? (input.receivedAt ?? paymentDate) : (input.receivedAt ?? null);
  const amountPerShare = input.amountPerShare ?? input.valuePerShare ?? 0;
  const grossAmount = input.grossAmount ?? input.totalValue ?? amountPerShare * (input.quantityEligible ?? 0);
  const netAmount = input.netAmount ?? grossAmount;

  return {
    ...input,
    assetTicker: normalizeOptionalTicker(input.assetTicker),
    amountPerShare,
    valuePerShare: amountPerShare,
    grossAmount,
    netAmount,
    totalValue: netAmount,
    receivedAt,
    referenceMonth: input.referenceMonth ?? String(paymentDate).slice(0, 7)
  };
}

export async function createDividendRecord(input: Omit<DividendRecord, "id">) {
  const normalized = normalizeReceivedDividendInput(input);
  return createDividend(normalized);
}

export async function updateDividendRecord(id: string, input: Partial<Omit<DividendRecord, "id">>) {
  const normalized = {
    ...input,
    ...(input.assetTicker ? { assetTicker: normalizeTicker(input.assetTicker) } : {}),
    ...(input.status === "received" ? { receivedAt: input.receivedAt ?? input.paymentDate ?? new Date().toISOString() } : {}),
    ...(input.status && input.status !== "received" ? { receivedAt: input.receivedAt ?? null } : {})
  };
  return updateDividend(id, normalized);
}

export async function markDividendReceived(id: string, input: ReceiveDividendInput = {}) {
  const dividend = await findDividendById(id);
  if (!dividend) throw notFound("Dividend not found");
  if ((dividend.status ?? "received") === "cancelled") throw new HttpError(409, "Dividend is cancelled.");

  const receivedAt = input.receivedAt ?? input.paymentDate ?? dividend.receivedAt ?? new Date().toISOString();
  const paymentDate = input.paymentDate ?? dividend.paymentDate;
  const amountPerShare = input.amountPerShare ?? input.valuePerShare ?? dividend.amountPerShare ?? dividend.valuePerShare ?? 0;
  const quantityEligible = input.quantityEligible ?? dividend.quantityEligible;
  const totalValue = input.totalValue ?? input.netAmount ?? dividend.netAmount ?? dividend.totalValue;
  const grossAmount = input.grossAmount ?? input.totalValue ?? dividend.grossAmount ?? totalValue;
  const netAmount = input.netAmount ?? input.totalValue ?? dividend.netAmount ?? totalValue;

  const updated = await updateDividend(id, {
    status: "received",
    paymentDate,
    receivedAt,
    amountPerShare,
    valuePerShare: amountPerShare,
    quantityEligible,
    grossAmount,
    netAmount,
    totalValue: netAmount,
    referenceMonth: String(paymentDate).slice(0, 7),
    notes: input.notes ?? dividend.notes
  });

  if (!updated) throw notFound("Dividend not found");
  return updated;
}

export async function findMatchingExpectedDividend(input: {
  assetTicker?: string | null;
  amountInCents?: number | null;
  paymentDate?: string | null;
  type?: DividendType;
}) {
  const ticker = normalizeOptionalTicker(input.assetTicker);
  if (!ticker) return null;
  const amountInCents = input.amountInCents ?? null;

  const candidates = (await listDividends()).filter((dividend) => {
    const status = dividend.status ?? "received";
    if (status !== "expected" && status !== "announced") return false;
    if (normalizeOptionalTicker(dividend.assetTicker) !== ticker) return false;
    if (input.type && dividend.type && dividend.type !== input.type) return false;
    if (amountInCents && Math.abs(toCents(dividendAmount(dividend)) - amountInCents) > 1) return false;
    if (input.paymentDate && toDateKey(dividend.paymentDate) !== toDateKey(input.paymentDate)) return false;
    return true;
  });

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1 && amountInCents) {
    const exactAmount = candidates.filter((dividend) => Math.abs(toCents(dividendAmount(dividend)) - amountInCents) <= 1);
    if (exactAmount.length === 1) return exactAmount[0];
  }

  return null;
}

export async function registerReceivedDividend(input: {
  assetTicker: string;
  type: DividendType;
  totalValue: number;
  paymentDate: string;
  amountPerShare?: number;
  quantityEligible?: number;
  notes?: string;
  source?: string;
}) {
  const asset = await findAssetByTicker(input.assetTicker);
  const matching = await findMatchingExpectedDividend({
    assetTicker: input.assetTicker,
    amountInCents: toCents(input.totalValue),
    paymentDate: input.paymentDate,
    type: input.type
  });

  if (matching?.id) {
    return markDividendReceived(matching.id, {
      totalValue: input.totalValue,
      amountPerShare: input.amountPerShare,
      quantityEligible: input.quantityEligible,
      paymentDate: input.paymentDate,
      receivedAt: input.paymentDate,
      notes: input.notes
    });
  }

  return createDividendRecord({
    assetId: asset?.id,
    assetTicker: input.assetTicker,
    category: asset?.category ?? "",
    type: input.type,
    totalValue: input.totalValue,
    valuePerShare: input.amountPerShare ?? 0,
    amountPerShare: input.amountPerShare ?? 0,
    quantityEligible: input.quantityEligible ?? 0,
    grossAmount: input.totalValue,
    netAmount: input.totalValue,
    paymentDate: input.paymentDate,
    receivedAt: input.paymentDate,
    referenceMonth: input.paymentDate.slice(0, 7),
    status: "received",
    source: input.source ?? "manual",
    notes: input.notes
  });
}
