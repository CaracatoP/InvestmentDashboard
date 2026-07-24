import { app } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { migrateCashBoxes } from "./repositories/investment.repository";
import { startCdiScheduler } from "./services/cdi-scheduler.service";
import { startMarketScheduler } from "./services/market-scheduler.service";

async function bootstrap() {
  await connectDatabase();
  const migration = await migrateCashBoxes();
  if (migration.updated > 0) console.info(`Cash box migration updated ${migration.updated} records.`);
  startMarketScheduler();
  startCdiScheduler();

  app.listen(env.port, () => {
    console.info(`API running on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
