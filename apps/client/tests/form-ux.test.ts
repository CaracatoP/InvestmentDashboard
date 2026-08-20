import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function readSource(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

test("operations form starts numeric fields empty and exposes descriptive labels", () => {
  const source = readSource("src/pages/OperationsPage.tsx");

  assert.match(source, /const emptyOperationForm: OperationFormState = \{[\s\S]*quantity: ""/);
  assert.match(source, /const emptyOperationForm: OperationFormState = \{[\s\S]*price: ""/);
  assert.match(source, /const emptyOperationForm: OperationFormState = \{[\s\S]*fees: ""/);

  for (const label of [
    "Data da operacao",
    "Tipo de operacao",
    "Ativo",
    "Quantidade",
    "Preco unitario",
    "Taxas",
    "Valor total",
    "Observacoes"
  ]) {
    assert.match(source, new RegExp(label));
  }

  for (const placeholder of [
    "Selecione o ativo",
    "Ex.: 10",
    "Ex.: 12,50",
    "Informe as taxas, se houver"
  ]) {
    assert.match(source, new RegExp(placeholder));
  }
});

test("planning workspace no longer boots key money inputs with artificial zero values", () => {
  const source = readSource("src/components/planning/PlanningWorkspace.tsx");

  assert.match(source, /const \[incomeInput, setIncomeInput\] = useState\(""\);/);
  assert.match(source, /const \[monthlyContributionGoalInput, setMonthlyContributionGoalInput\] = useState\(""\);/);
  assert.match(source, /const \[investmentSimulationInput, setInvestmentSimulationInput\] = useState\(""\);/);

  assert.match(source, /amount: expense \? formatMoneyInput\(expense\.amountInCents \?\? 0\) : ""/);
  assert.match(source, /amount: entry \? formatMoneyInput\(entry\.amountInCents \?\? 0\) : ""/);
  assert.match(source, /target: formatOptionalMoneyInput\(goal\?\.targetInCents\)/);
  assert.match(source, /saved: formatOptionalMoneyInput\(goal\?\.savedInCents\)/);
  assert.match(source, /monthlyContribution: formatOptionalMoneyInput\(goal\?\.monthlyContributionInCents\)/);
});

test("shared delete confirmation supports richer contextual copy", () => {
  const source = readSource("src/components/ui/Management.tsx");

  assert.match(source, /description\?: ReactNode/);
  assert.match(source, /details\?: (?:ReactNode\[\]|Array<ReactNode>)/);
  assert.match(source, /confirmLabel\?: string/);
});

test("destructive flows include contextual confirmation copy", () => {
  const operationsSource = readSource("src/pages/OperationsPage.tsx");
  const planningSource = readSource("src/components/planning/PlanningWorkspace.tsx");
  const settingsSource = readSource("src/pages/SettingsPage.tsx");

  assert.match(operationsSource, /title="Excluir operacao\?"/);
  assert.match(operationsSource, /confirmLabel="Excluir operacao"/);

  assert.match(planningSource, /title="Excluir gasto\?"/);
  assert.match(planningSource, /title="Excluir recorrencia de gasto\?"/);
  assert.match(planningSource, /title="Excluir entrada\?"/);

  assert.match(settingsSource, /title="Desconectar WhatsApp\?"/);
  assert.match(settingsSource, /confirmLabel="Desconectar WhatsApp"/);
});

test("settings exposes the official Invest Hub WhatsApp CTA through a centralized link", () => {
  const settingsSource = readSource("src/pages/SettingsPage.tsx");
  const linksSource = readSource("src/constants/external-links.ts");

  assert.match(linksSource, /export const INVEST_HUB_WHATSAPP_URL = "https:\/\/w\.app\/cky5ld";/);
  assert.match(settingsSource, /INVEST_HUB_WHATSAPP_URL/);
  assert.match(settingsSource, /Abrir WhatsApp do Invest Hub/);
});
