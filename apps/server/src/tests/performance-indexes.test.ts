import assert from "node:assert/strict";
import test from "node:test";
import { AiChatMessageModel } from "../models/ai-chat-message.model";
import { AiPendingActionModel } from "../models/ai-pending-action.model";
import { ContributionModel } from "../models/contribution.model";
import { DividendModel } from "../models/dividend.model";
import { MonthlyExpenseModel } from "../models/monthly-expense.model";
import { OperationModel } from "../models/operation.model";

function hasIndex(model: { schema: { indexes: () => Array<[Record<string, unknown>, unknown]> } }, expected: Record<string, unknown>) {
  return model.schema.indexes().some(([fields]) => JSON.stringify(fields) === JSON.stringify(expected));
}

test("performance-critical collection queries have compound indexes", () => {
  assert.equal(hasIndex(OperationModel, { type: 1, date: -1 }), true);
  assert.equal(hasIndex(OperationModel, { assetTicker: 1, date: -1 }), true);
  assert.equal(hasIndex(DividendModel, { status: 1, paymentDate: -1 }), true);
  assert.equal(hasIndex(DividendModel, { assetTicker: 1, paymentDate: -1 }), true);
  assert.equal(hasIndex(ContributionModel, { createdAt: -1 }), true);
  assert.equal(hasIndex(MonthlyExpenseModel, { planId: 1, recurrenceId: 1, recurrenceOriginalDate: 1 }), true);
  assert.equal(hasIndex(AiChatMessageModel, { sessionId: 1, createdAt: 1 }), true);
  assert.equal(hasIndex(AiPendingActionModel, { sessionId: 1, status: 1, expiresAt: 1 }), true);
});
