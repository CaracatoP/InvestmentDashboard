import { runWithAuthContext } from "../auth/auth-context";
import { isDatabaseConnected } from "../config/database";
import { appendAuditLog } from "./audit.service";
import { AssetModel } from "../models/asset.model";
import { CashBoxModel } from "../models/cash-box.model";
import { CashBoxYieldModel } from "../models/cash-box-yield.model";
import { ContributionModel } from "../models/contribution.model";
import { DividendModel } from "../models/dividend.model";
import { FinancialAiAnalysisModel } from "../models/financial-ai-analysis.model";
import { GoalModel } from "../models/goal.model";
import { MonthlyExpenseModel } from "../models/monthly-expense.model";
import { MonthlyIncomeEntryModel } from "../models/monthly-income-entry.model";
import { MonthlyPlanModel } from "../models/monthly-plan.model";
import { OperationModel } from "../models/operation.model";
import { SettingsModel } from "../models/settings.model";
import { SnapshotModel } from "../models/snapshot.model";
import { UserModel } from "../models/user.model";
import { WalletModel } from "../models/wallet.model";
import { AiActionAuditModel } from "../models/ai-action-audit.model";
import { AiChatMessageModel } from "../models/ai-chat-message.model";
import { AiChatSessionModel } from "../models/ai-chat-session.model";
import { AiPendingActionModel } from "../models/ai-pending-action.model";
import type { AuthRole } from "../auth/auth-context";

const ownedModels = [
  { name: "Asset", model: AssetModel },
  { name: "Operation", model: OperationModel },
  { name: "Dividend", model: DividendModel },
  { name: "Contribution", model: ContributionModel },
  { name: "Goal", model: GoalModel },
  { name: "CashBox", model: CashBoxModel },
  { name: "CashBoxYield", model: CashBoxYieldModel },
  { name: "Settings", model: SettingsModel },
  { name: "Snapshot", model: SnapshotModel },
  { name: "Wallet", model: WalletModel },
  { name: "MonthlyPlan", model: MonthlyPlanModel },
  { name: "MonthlyExpense", model: MonthlyExpenseModel },
  { name: "MonthlyIncomeEntry", model: MonthlyIncomeEntryModel },
  { name: "AiChatSession", model: AiChatSessionModel },
  { name: "AiChatMessage", model: AiChatMessageModel },
  { name: "AiPendingAction", model: AiPendingActionModel },
  { name: "AiActionAudit", model: AiActionAuditModel },
  { name: "FinancialAiAnalysis", model: FinancialAiAnalysisModel }
] as const;

const legacyUniqueIndexPrefixes = [
  { modelName: "Asset", fieldNames: ["ticker"] },
  { modelName: "MonthlyPlan", fieldNames: ["year", "month"] },
  { modelName: "AiPendingAction", fieldNames: ["idempotencyKey"] },
  { modelName: "CashBoxYield", fieldNames: ["cashBoxId", "referenceDate"] },
  { modelName: "Dividend", fieldNames: ["assetId", "assetTicker", "paymentDate", "type", "amountPerShare", "source"] }
];

type OwnedModelName = (typeof ownedModels)[number]["name"];

export interface OwnershipMigrationResult {
  ownerUserId: string | null;
  droppedIndexes: string[];
  updated: number;
  byModel: Partial<Record<OwnedModelName, number>>;
  unresolvedRecords: number;
}

function missingOwnershipFilter() {
  return {
    $or: [
      { userId: { $exists: false } },
      { userId: null }
    ]
  };
}

function isLegacyUniqueIndex(modelName: string, index: { key?: Record<string, unknown>; unique?: boolean }) {
  if (!index.unique || !index.key || "userId" in index.key) return false;
  const fieldNames = Object.keys(index.key);
  return legacyUniqueIndexPrefixes.some(
    (legacy) => legacy.modelName === modelName && legacy.fieldNames.length === fieldNames.length && legacy.fieldNames.every((field, indexPosition) => fieldNames[indexPosition] === field)
  );
}

async function dropLegacyUniqueIndexes() {
  const dropped: string[] = [];

  for (const entry of ownedModels) {
    const indexes = await entry.model.collection.indexes();
    for (const index of indexes) {
      if (!index.name || !isLegacyUniqueIndex(entry.name, index)) continue;
      await entry.model.collection.dropIndex(index.name);
      dropped.push(`${entry.name}.${index.name}`);
    }
  }

  return dropped;
}

async function resolveOwnershipCandidate(preferredUserId?: string | null) {
  if (preferredUserId?.trim()) {
    const user = await UserModel.findById(preferredUserId).select({ _id: 1, role: 1, email: 1 }).lean<{ _id: unknown; role?: AuthRole; email?: string } | null>();
    if (user?._id) {
      return {
        id: String(user._id),
        role: user.role === "admin" ? ("admin" as const) : ("user" as const),
        email: user.email ?? undefined
      };
    }
  }

  const users = await UserModel.find({})
    .sort({ createdAt: 1 })
    .select({ _id: 1, role: 1, email: 1 })
    .lean<Array<{ _id: unknown; role?: AuthRole; email?: string }>>();
  if (users.length !== 1 || !users[0]?._id) return null;

  return {
    id: String(users[0]._id),
    role: users[0].role === "admin" ? ("admin" as const) : ("user" as const),
    email: users[0].email ?? undefined
  };
}

async function countUnresolvedOwnershipRecords() {
  let unresolvedRecords = 0;

  for (const entry of ownedModels) {
    unresolvedRecords += await entry.model.countDocuments(missingOwnershipFilter());
  }

  return unresolvedRecords;
}

export async function runOwnershipMigration(preferredUserId?: string | null): Promise<OwnershipMigrationResult> {
  if (!isDatabaseConnected()) {
    return {
      ownerUserId: null,
      droppedIndexes: [],
      updated: 0,
      byModel: {},
      unresolvedRecords: 0
    };
  }

  const droppedIndexes = await dropLegacyUniqueIndexes();
  const candidate = await resolveOwnershipCandidate(preferredUserId);
  const byModel: Partial<Record<OwnedModelName, number>> = {};
  let updated = 0;

  if (candidate) {
    for (const entry of ownedModels) {
      const result = await entry.model.updateMany(missingOwnershipFilter(), { $set: { userId: candidate.id } });
      byModel[entry.name] = result.modifiedCount;
      updated += result.modifiedCount;
    }
  }

  const unresolvedRecords = await countUnresolvedOwnershipRecords();

  if (candidate && (updated > 0 || droppedIndexes.length > 0)) {
    await runWithAuthContext({ userId: candidate.id, role: candidate.role, email: candidate.email, channel: "system" }, async () => {
      await appendAuditLog({
        userId: candidate.id,
        actorType: "system",
        channel: "system",
        action: "LEGACY_DATA_BACKFILLED",
        entityType: "User",
        entityId: candidate.id,
        metadata: { updated, byModel, droppedIndexes, unresolvedRecords }
      });
    });
  }

  return {
    ownerUserId: candidate?.id ?? null,
    droppedIndexes,
    updated,
    byModel,
    unresolvedRecords
  };
}
