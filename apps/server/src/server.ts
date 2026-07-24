import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { migrateCashBoxes } from "./repositories/investment.repository";
import { startCdiScheduler } from "./services/cdi-scheduler.service";
import { startMarketScheduler } from "./services/market-scheduler.service";

async function bootstrap() {
  console.info(`Starting Investment Dashboard API in ${env.nodeEnv} mode.`);
  await connectDatabase();
  const migration = await migrateCashBoxes();
  if (migration.updated > 0) console.info(`Cash box migration updated ${migration.updated} records.`);

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
