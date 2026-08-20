import type { AssetRecord } from "../types/investment";

export type AssetMarket = "b3" | "crypto" | "unsupported";
export type AssetKind = "stock" | "fii" | "etf" | "crypto" | "fixed-income" | "cash" | "unsupported";

export interface KnownCryptoAsset {
  coingeckoId: string;
  symbol: string;
  name: string;
  aliases: string[];
}

export interface TickerProfile {
  internalTicker: string;
  providerSymbol: string;
  marketKey: string;
  kind: AssetKind;
  market: AssetMarket;
  supported: boolean;
}

const knownCryptoAssets: KnownCryptoAsset[] = [
  { coingeckoId: "bitcoin", symbol: "BTC", name: "Bitcoin", aliases: ["btc", "bitcoin"] },
  { coingeckoId: "ethereum", symbol: "ETH", name: "Ethereum", aliases: ["eth", "ethereum"] },
  { coingeckoId: "solana", symbol: "SOL", name: "Solana", aliases: ["sol", "solana"] },
  { coingeckoId: "binancecoin", symbol: "BNB", name: "BNB", aliases: ["bnb", "binance", "binance coin"] },
  { coingeckoId: "ripple", symbol: "XRP", name: "XRP", aliases: ["xrp", "ripple"] },
  { coingeckoId: "cardano", symbol: "ADA", name: "Cardano", aliases: ["ada", "cardano"] },
  { coingeckoId: "dogecoin", symbol: "DOGE", name: "Dogecoin", aliases: ["doge", "dogecoin"] },
  { coingeckoId: "usd-coin", symbol: "USDC", name: "USD Coin", aliases: ["usdc", "usd coin"] },
  { coingeckoId: "tether", symbol: "USDT", name: "Tether", aliases: ["usdt", "tether"] },
  { coingeckoId: "litecoin", symbol: "LTC", name: "Litecoin", aliases: ["ltc", "litecoin"] },
  { coingeckoId: "chainlink", symbol: "LINK", name: "Chainlink", aliases: ["link", "chainlink"] },
  { coingeckoId: "avalanche-2", symbol: "AVAX", name: "Avalanche", aliases: ["avax", "avalanche"] }
];

function normalizeCategory(input: string) {
  return input
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function normalizeText(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

export function normalizeCoinGeckoId(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, "-");
}

export function isValidTicker(input: string) {
  return /^[A-Z0-9]{2,12}$/.test(normalizeTicker(input));
}

export function getAssetKind(asset: Pick<AssetRecord, "ticker" | "category">): AssetKind {
  const ticker = normalizeTicker(asset.ticker);
  const category = normalizeCategory(asset.category);

  if (category === "CASH" || category === "CAIXA" || category === "CASHBOX" || category === "CASH_BOX" || category === "CASHBOXES" || category === "CASHBOX") {
    return "cash";
  }

  if (category === "RENDA_FIXA") return "fixed-income";
  if (category === "CRIPTO" || category === "CRYPTO" || ticker === "BTC") return "crypto";
  if (category === "FII") return "fii";
  if (category === "ETF") return "etf";
  if (category === "ACAO" || category === "ACOES" || category === "ACAO_BRASILEIRA") return "stock";

  return "unsupported";
}

export function buildStoredMarketDataKey(input: { ticker: string; market?: string; providerSymbol?: string }) {
  const market = String(input.market ?? "").trim().toLowerCase();
  const normalizedTicker = normalizeTicker(input.ticker);
  const providerSymbol = String(input.providerSymbol ?? "").trim();

  if (market === "crypto") {
    return `crypto:${normalizeCoinGeckoId(providerSymbol || normalizedTicker)}`;
  }

  if (market === "b3") {
    return `b3:${normalizeTicker(providerSymbol || normalizedTicker)}`;
  }

  if (providerSymbol) {
    return `${market || "provider"}:${normalizeTicker(providerSymbol)}`;
  }

  return `ticker:${normalizedTicker}`;
}

export function buildAssetMarketKey(asset: Pick<AssetRecord, "ticker" | "category" | "coingeckoId">) {
  const profile = getTickerProfile(asset);
  return profile.marketKey;
}

export function resolveKnownCryptoIdentity(input: { ticker?: string | null; name?: string | null }) {
  const normalizedTicker = input.ticker ? normalizeTicker(input.ticker) : "";
  const normalizedName = input.name ? normalizeText(input.name) : "";

  return (
    knownCryptoAssets.find((asset) => {
      if (normalizedTicker && asset.symbol === normalizedTicker) {
        return !normalizedName || normalizeText(asset.name) === normalizedName;
      }

      if (normalizedName && normalizeText(asset.name) === normalizedName) {
        return !normalizedTicker || asset.symbol === normalizedTicker;
      }

      return false;
    }) ?? null
  );
}

export function findKnownCryptoByQuery(query: string) {
  const normalized = normalizeText(query);
  if (!normalized) return null;

  return (
    knownCryptoAssets.find((asset) =>
      asset.aliases.some((alias) => normalized.includes(normalizeText(alias))) ||
      normalized.includes(normalizeText(asset.symbol)) ||
      normalized.includes(normalizeText(asset.coingeckoId))
    ) ?? null
  );
}

export function listKnownCryptoAssets() {
  return [...knownCryptoAssets];
}

export function getTickerProfile(asset: Pick<AssetRecord, "ticker" | "category" | "coingeckoId">): TickerProfile {
  const internalTicker = normalizeTicker(asset.ticker);
  const kind = getAssetKind({ ...asset, ticker: internalTicker });
  const market: AssetMarket = kind === "crypto" ? "crypto" : kind === "stock" || kind === "fii" || kind === "etf" ? "b3" : "unsupported";
  const knownCrypto = market === "crypto" ? resolveKnownCryptoIdentity({ ticker: internalTicker }) : null;
  const providerSymbol =
    market === "crypto" ? normalizeCoinGeckoId(asset.coingeckoId || knownCrypto?.coingeckoId || internalTicker) : internalTicker;
  const marketKey = buildStoredMarketDataKey({ ticker: internalTicker, market, providerSymbol });
  const hasProviderIdentity = market !== "crypto" || providerSymbol.length > 0;

  return {
    internalTicker,
    providerSymbol,
    marketKey,
    kind,
    market,
    supported: isValidTicker(internalTicker) && market !== "unsupported" && hasProviderIdentity
  };
}
