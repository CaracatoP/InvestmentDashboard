import type { AssetRecord } from "../types/investment";

export type AssetMarket = "b3" | "crypto" | "unsupported";
export type AssetKind = "stock" | "fii" | "etf" | "crypto" | "fixed-income" | "cash" | "unsupported";

export interface TickerProfile {
  internalTicker: string;
  providerSymbol: string;
  kind: AssetKind;
  market: AssetMarket;
  supported: boolean;
}

export function normalizeTicker(input: string) {
  const normalized = input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/\.SA$/i, "")
    .replace(/-BRL$/i, "")
    .replace(/BRL$/i, "");

  return normalized === "XBT" ? "BTC" : normalized;
}

export function isValidTicker(input: string) {
  return /^[A-Z0-9]{2,12}$/.test(normalizeTicker(input));
}

export function getAssetKind(asset: Pick<AssetRecord, "ticker" | "category">): AssetKind {
  const ticker = normalizeTicker(asset.ticker);
  const category = asset.category.toUpperCase();

  if (category === "CASH" || category === "CAIXA" || category === "CASHBOX" || category === "CASH_BOX" || category === "CASHBOXES" || category === "CASHBOX") {
    return "cash";
  }

  if (category === "RENDA_FIXA") return "fixed-income";
  if (category === "CRIPTO" || ticker === "BTC") return "crypto";
  if (category === "FII") return "fii";
  if (category === "ETF") return "etf";
  if (category === "ACAO") return "stock";

  return "unsupported";
}

export function getTickerProfile(asset: Pick<AssetRecord, "ticker" | "category">): TickerProfile {
  const internalTicker = normalizeTicker(asset.ticker);
  const kind = getAssetKind({ ...asset, ticker: internalTicker });
  const market: AssetMarket = kind === "crypto" ? "crypto" : kind === "stock" || kind === "fii" || kind === "etf" ? "b3" : "unsupported";

  return {
    internalTicker,
    providerSymbol: internalTicker,
    kind,
    market,
    supported: isValidTicker(internalTicker) && market !== "unsupported"
  };
}
