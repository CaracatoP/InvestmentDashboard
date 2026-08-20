import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { runWithAuthContext } from "./auth/auth-context";
import { migrateCashBoxes } from "./repositories/investment.repository";
import { bootstrapAuthenticationFoundation } from "./services/auth-bootstrap.service";
import { startCdiScheduler } from "./services/cdi-scheduler.service";
import { runMarketDataMigrations } from "./services/market-data-migration.service";
import { startMarketScheduler } from "./services/market-scheduler.service";
import { runOwnershipMigration } from "./services/ownership-migration.service";
import { runMonthlyPlanningMigrations } from "./services/monthly-planning-migration.service";

async function bootstrap() {
  console.info(`Starting Investment Dashboard API in ${env.nodeEnv} mode.`);
  await connectDatabase();
  const bootstrapAdmin = await bootstrapAuthenticationFoundation();
  const ownershipMigration = await runOwnershipMigration(bootstrapAdmin?.id);
  if (ownershipMigration.updated > 0 || ownershipMigration.droppedIndexes.length > 0 || ownershipMigration.unresolvedRecords > 0) {
    console.info(
      `Ownership migration owner=${ownershipMigration.ownerUserId ?? "unresolved"}, updated=${ownershipMigration.updated}, unresolved=${ownershipMigration.unresolvedRecords}, droppedIndexes=${ownershipMigration.droppedIndexes.length}.`
    );
  }
  const monthlyPlanningMigration = await runMonthlyPlanningMigrations();
  if (
    monthlyPlanningMigration.droppedIndexes.length > 0 ||
    monthlyPlanningMigration.createdIndexes.length > 0 ||
    monthlyPlanningMigration.unresolvedOccurrenceDuplicates.monthlyExpenses > 0 ||
    monthlyPlanningMigration.unresolvedOccurrenceDuplicates.monthlyIncomeEntries > 0
  ) {
    console.info(
      `Monthly planning migration droppedIndexes=${monthlyPlanningMigration.droppedIndexes.length}, createdIndexes=${monthlyPlanningMigration.createdIndexes.length}, unresolvedExpenseDuplicates=${monthlyPlanningMigration.unresolvedOccurrenceDuplicates.monthlyExpenses}, unresolvedIncomeDuplicates=${monthlyPlanningMigration.unresolvedOccurrenceDuplicates.monthlyIncomeEntries}.`
    );
  }
  const marketDataMigration = await runMarketDataMigrations();
  if (
    marketDataMigration.droppedIndexes.length > 0 ||
    marketDataMigration.quotesUpdated > 0 ||
    marketDataMigration.historyUpdated > 0 ||
    marketDataMigration.cryptoAssetsUpdated > 0
  ) {
    console.info(
      `Market data migration updated quotes=${marketDataMigration.quotesUpdated}, history=${marketDataMigration.historyUpdated}, cryptoAssets=${marketDataMigration.cryptoAssetsUpdated}, unresolvedCryptoAssets=${marketDataMigration.cryptoAssetsUnresolved}, droppedIndexes=${marketDataMigration.droppedIndexes.length}.`
    );
  }
  if (bootstrapAdmin) {
    const migration = await runWithAuthContext({ userId: bootstrapAdmin.id, role: "admin", email: bootstrapAdmin.email, channel: "system" }, () =>
      migrateCashBoxes()
    );
    if (migration.updated > 0) console.info(`Cash box migration updated ${migration.updated} records.`);
  } else {
    console.info("Cash box migration skipped until an authenticated owner/admin is available.");
  }

  if (env.enableSchedulers) {
    try {
      startMarketScheduler();
      startCdiScheduler();
      console.info("Schedulers enabled.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown scheduler startup error";
      console.warn(`Schedulers failed to start: ${message}`);
    }
  } else {
    console.info("Schedulers disabled by ENABLE_SCHEDULERS.");
  }

  app.listen(env.port, "0.0.0.0", () => {
    console.info(`API running on port ${env.port}.`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
