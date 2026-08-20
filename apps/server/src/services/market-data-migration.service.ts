import { isDatabaseConnected } from "../config/database";
import { AssetModel } from "../models/asset.model";
import { MarketQuoteModel } from "../models/market-quote.model";
import { PriceHistoryModel } from "../models/price-history.model";
import { buildStoredMarketDataKey, normalizeTicker, resolveKnownCryptoIdentity } from "./ticker.service";

function isLegacyMarketQuoteTickerIndex(index: { key?: Record<string, unknown>; unique?: boolean; name?: string }) {
  return Boolean(index.unique && index.key && Object.keys(index.key).length === 1 && index.key.ticker === 1);
}

function isLegacyPriceHistoryTickerIndex(index: { key?: Record<string, unknown>; unique?: boolean; name?: string }) {
  if (!index.unique || !index.key) return false;
  const fields = Object.keys(index.key);
  return fields.length === 3 && fields[0] === "ticker" && fields[1] === "capturedAt" && fields[2] === "source";
}

function inferFallbackMarketKey(input: { ticker?: string; market?: string; providerSymbol?: string; source?: string }) {
  const ticker = normalizeTicker(String(input.ticker ?? ""));
  const source = String(input.source ?? "").toLowerCase();

  if (input.market || input.providerSymbol) {
    return buildStoredMarketDataKey({
      ticker,
      market: input.market,
      providerSymbol: input.providerSymbol
    });
  }

  const knownCrypto = resolveKnownCryptoIdentity({ ticker });
  if (knownCrypto && (source.includes("coingecko") || source.includes("brapi"))) {
    return `crypto:${knownCrypto.coingeckoId}`;
  }

  const looksLikeB3 = /^[A-Z]{4}\d{1,2}F?$/.test(ticker) || /^[A-Z]{3,6}11$/.test(ticker);
  if (looksLikeB3) return `b3:${ticker}`;

  return `ticker:${ticker}`;
}

async function dropLegacyMarketDataIndexes() {
  const droppedIndexes: string[] = [];

  for (const index of await MarketQuoteModel.collection.indexes()) {
    if (!index.name || !isLegacyMarketQuoteTickerIndex(index)) continue;
    await MarketQuoteModel.collection.dropIndex(index.name);
    droppedIndexes.push(`MarketQuote.${index.name}`);
  }

  for (const index of await PriceHistoryModel.collection.indexes()) {
    if (!index.name || !isLegacyPriceHistoryTickerIndex(index)) continue;
    await PriceHistoryModel.collection.dropIndex(index.name);
    droppedIndexes.push(`PriceHistory.${index.name}`);
  }

  return droppedIndexes;
}

async function backfillQuoteAssetKeys() {
  const quotes = await MarketQuoteModel.find().lean();
  let updated = 0;

  for (const quote of quotes) {
    const assetKey = inferFallbackMarketKey({
      ticker: String(quote.ticker ?? ""),
      market: String(quote.market ?? ""),
      providerSymbol: String(quote.providerSymbol ?? ""),
      source: String(quote.source ?? "")
    });

    if (quote.assetKey === assetKey) continue;
    await MarketQuoteModel.updateOne({ _id: quote._id }, { $set: { assetKey } });
    updated += 1;
  }

  return updated;
}

async function backfillPriceHistoryAssetKeys() {
  const history = await PriceHistoryModel.find().lean();
  let updated = 0;

  for (const item of history) {
    const assetKey = inferFallbackMarketKey({
      ticker: String(item.ticker ?? ""),
      market: String(item.market ?? ""),
      providerSymbol: String(item.providerSymbol ?? ""),
      source: String(item.source ?? "")
    });

    if (item.assetKey === assetKey) continue;
    await PriceHistoryModel.updateOne({ _id: item._id }, { $set: { assetKey } });
    updated += 1;
  }

  return updated;
}

async function migrateLegacyCryptoAssets() {
  const assets = await AssetModel.find({
    active: true,
    category: "CRIPTO",
    $or: [
      { coingeckoId: { $exists: false } },
      { coingeckoId: "" },
      { coingeckoId: null }
    ]
  }).lean();
  let updated = 0;
  let unresolved = 0;

  for (const asset of assets) {
    const match = resolveKnownCryptoIdentity({
      ticker: String(asset.ticker ?? ""),
      name: String(asset.name ?? "")
    });

    if (!match) {
      unresolved += 1;
      continue;
    }

    await AssetModel.updateOne({ _id: asset._id }, { $set: { coingeckoId: match.coingeckoId } });
    updated += 1;
  }

  return { updated, unresolved };
}

export async function runMarketDataMigrations() {
  if (!isDatabaseConnected()) {
    return {
      droppedIndexes: [] as string[],
      quotesUpdated: 0,
      historyUpdated: 0,
      cryptoAssetsUpdated: 0,
      cryptoAssetsUnresolved: 0
    };
  }

  const droppedIndexes = await dropLegacyMarketDataIndexes();
  const quotesUpdated = await backfillQuoteAssetKeys();
  const historyUpdated = await backfillPriceHistoryAssetKeys();
  await MarketQuoteModel.createIndexes();
  await PriceHistoryModel.createIndexes();
  const cryptoAssets = await migrateLegacyCryptoAssets();

  return {
    droppedIndexes,
    quotesUpdated,
    historyUpdated,
    cryptoAssetsUpdated: cryptoAssets.updated,
    cryptoAssetsUnresolved: cryptoAssets.unresolved
  };
}
