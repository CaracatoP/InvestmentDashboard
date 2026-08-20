import assert from "node:assert/strict";
import test from "node:test";
import { AiChatMessageModel } from "../models/ai-chat-message.model";
import { AiPendingActionModel } from "../models/ai-pending-action.model";
import { ContributionModel } from "../models/contribution.model";
import { DividendModel } from "../models/dividend.model";
import { MonthlyExpenseModel } from "../models/monthly-expense.model";
import { MonthlyIncomeEntryModel } from "../models/monthly-income-entry.model";
import { OperationModel } from "../models/operation.model";

function hasIndex(model: { schema: { indexes: () => Array<[Record<string, unknown>, unknown]> } }, expected: Record<string, unknown>) {
  return model.schema.indexes().some(([fields]) => JSON.stringify(fields) === JSON.stringify(expected));
}

test("performance-critical collection queries have compound indexes", () => {
  assert.equal(hasIndex(OperationModel, { userId: 1, type: 1, date: -1 }), true);
  assert.equal(hasIndex(OperationModel, { userId: 1, assetTicker: 1, date: -1 }), true);
  assert.equal(hasIndex(DividendModel, { userId: 1, status: 1, paymentDate: -1 }), true);
  assert.equal(hasIndex(DividendModel, { userId: 1, assetTicker: 1, paymentDate: -1 }), true);
  assert.equal(hasIndex(ContributionModel, { userId: 1, createdAt: -1 }), true);
  assert.equal(hasIndex(MonthlyExpenseModel, { userId: 1, planId: 1, recurrenceId: 1, recurrenceOriginalDate: 1 }), true);
  assert.equal(hasIndex(MonthlyIncomeEntryModel, { userId: 1, planId: 1, recurrenceId: 1, recurrenceOriginalDate: 1 }), true);
  assert.equal(hasIndex(AiChatMessageModel, { userId: 1, sessionId: 1, createdAt: 1 }), true);
  assert.equal(hasIndex(AiPendingActionModel, { userId: 1, sessionId: 1, status: 1, expiresAt: 1 }), true);
});
