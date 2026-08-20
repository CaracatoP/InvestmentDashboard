import assert from "node:assert/strict";
import test from "node:test";
import { formatWhatsAppAssistantResponse } from "../services/whatsapp-response-formatter.service";

test("whatsapp formatter renders structured summaries with sections and suggestions", () => {
  const formatted = formatWhatsAppAssistantResponse({
    id: "assistant-message-1",
    sessionId: "session-1",
    role: "assistant",
    content: "Resumo pronto.",
    structuredResponse: {
      message: "Resumo rapido da sua carteira.",
      responseType: "summary",
      title: "Sua carteira - Agosto/2026",
      sections: [
        {
          type: "metrics",
          title: "Resultado",
          metrics: [
            { label: "Patrimonio", value: "R$ 21.659,46", format: "currency", status: "neutral" },
            { label: "Retorno", value: "-1,47%", format: "percent", status: "warning" }
          ]
        },
        {
          type: "list",
          title: "Distribuicao",
          items: [{ title: "FIIs", description: "100%", severity: "info" }]
        }
      ],
      pendingAction: null,
      suggestions: ["Detalhar FIIs", "Ver gastos do mes"],
      metadata: {}
    },
    createdAt: new Date().toISOString()
  });

  assert.match(formatted, /\*Sua carteira - Agosto\/2026\*/);
  assert.match(formatted, /\*Resultado\*/);
  assert.match(formatted, /• Patrimonio: R\$ 21\.659,46/);
  assert.match(formatted, /\*Sugestoes\*/);
  assert.doesNotMatch(formatted, /"message"|responseType|pendingAction|metadata/);
});

test("whatsapp formatter renders crypto quote summaries without raw json", () => {
  const formatted = formatWhatsAppAssistantResponse({
    id: "assistant-crypto-whatsapp",
    sessionId: "session-crypto",
    role: "assistant",
    content: "Cotacao atual: Bitcoin esta em R$ 620.000,00.",
    structuredResponse: {
      message: "Cotacao atual: Bitcoin esta em R$ 620.000,00.",
      responseType: "summary",
      title: "BTC Bitcoin",
      sections: [
        {
          type: "metrics",
          title: "Cotacao",
          metrics: [
            { label: "Preco", value: "R$ 620.000,00", status: "neutral" },
            { label: "24h", value: "+2,50%", status: "positive" },
            { label: "Atualizado", value: "20/08/2026, 12:00", status: "neutral" }
          ]
        }
      ],
      pendingAction: null,
      suggestions: [],
      metadata: { provider: "coingecko", model: "deterministic" }
    },
    createdAt: new Date().toISOString()
  });

  assert.match(formatted, /\*BTC Bitcoin\*/);
  assert.match(formatted, /Cotacao atual: Bitcoin esta em R\$ 620\.000,00\./);
  assert.match(formatted, /• Preco: R\$ 620\.000,00/);
  assert.doesNotMatch(formatted, /"message"|responseType|metadata|\{/);
});

test("whatsapp formatter renders numbered choices for pending selections", () => {
  const formatted = formatWhatsAppAssistantResponse({
    id: "assistant-message-2",
    sessionId: "session-2",
    role: "assistant",
    content: "Escolha o gasto.",
    structuredResponse: {
      message: "Encontrei mais de um gasto. Qual deles voce pagou?",
      responseType: "form",
      title: "Escolher gasto para marcar como pago",
      sections: [],
      pendingAction: {
        id: "pending-1",
        actionType: "mark_expense_completed",
        title: "Escolher gasto para marcar como pago",
        status: "collecting",
        fields: [],
        missingFields: [
          {
            name: "expenseId",
            label: "Gasto",
            type: "select",
            required: true,
            options: [
              { value: "expense-1", label: "Spotify - R$ 12,90 - 22/08 - Assinaturas" },
              { value: "expense-2", label: "Netflix - R$ 21,90 - 25/08 - Assinaturas" }
            ]
          }
        ]
      },
      suggestions: [],
      metadata: {}
    },
    createdAt: new Date().toISOString()
  });

  assert.match(formatted, /1\. Spotify - R\$ 12,90 - 22\/08 - Assinaturas/);
  assert.match(formatted, /2\. Netflix - R\$ 21,90 - 25\/08 - Assinaturas/);
  assert.match(formatted, /Responda com o numero ou com o nome\./);
});

test("whatsapp formatter suppresses duplicated pending boilerplate and executed fields", () => {
  const formatted = formatWhatsAppAssistantResponse({
    id: "assistant-message-dup",
    sessionId: "session-dup",
    role: "assistant",
    content: "Qual descricao deseja usar para este gasto?",
    structuredResponse: {
      message: "Qual descricao deseja usar para este gasto?",
      responseType: "form",
      title: "Registrar gasto",
      sections: [
        {
          type: "alert",
          items: [{ title: "Campo pendente", description: "Qual descricao deseja usar para este gasto?", severity: "info" }]
        }
      ],
      pendingAction: {
        id: "pending-dup",
        actionType: "create_monthly_expense",
        title: "Registrar gasto",
        status: "collecting",
        fields: [{ name: "Valor", label: "Valor", value: "R$ 100,00", type: "text" }],
        missingFields: [{ name: "description", label: "Descricao", type: "text", required: true }]
      },
      suggestions: [],
      metadata: {}
    },
    createdAt: new Date().toISOString()
  });

  assert.doesNotMatch(formatted, /Campo pendente/i);
  assert.doesNotMatch(formatted, /Informe: Descricao/i);
  assert.match(formatted, /Qual descricao deseja usar para este gasto\?/);

  const successFormatted = formatWhatsAppAssistantResponse({
    id: "assistant-message-success",
    sessionId: "session-success",
    role: "assistant",
    content: "Gasto registrado.",
    structuredResponse: {
      message: "Gasto registrado.",
      responseType: "success",
      title: "Operacao concluida",
      sections: [
        {
          type: "metrics",
          metrics: [
            { label: "Descricao", value: "Almoco", format: "text" },
            { label: "Valor", value: "R$ 100,00", format: "currency" }
          ]
        }
      ],
      pendingAction: {
        id: "pending-success",
        actionType: "create_monthly_expense",
        title: "Registrar gasto",
        status: "executed",
        fields: [
          { name: "Descricao", label: "Descricao", value: "Almoco", type: "text" },
          { name: "Valor", label: "Valor", value: "R$ 100,00", type: "text" }
        ],
        missingFields: []
      },
      suggestions: [],
      metadata: {}
    },
    createdAt: new Date().toISOString()
  });

  assert.equal((successFormatted.match(/Descricao: Almoco/g) ?? []).length, 1);
  assert.equal((successFormatted.match(/Valor: R\$ 100,00/g) ?? []).length, 1);
});

test("whatsapp formatter never leaks raw structured json or objects", () => {
  const parsed = formatWhatsAppAssistantResponse({
    id: "assistant-message-3",
    sessionId: "session-3",
    role: "assistant",
    content: JSON.stringify({
      message: "Ola! Como posso ajudar hoje?",
      responseType: "text",
      title: null,
      sections: [],
      pendingAction: null,
      suggestions: ["Ver meus gastos", "Consultar investimentos"],
      metadata: {}
    }),
    createdAt: new Date().toISOString()
  });
  const safeFallback = formatWhatsAppAssistantResponse({
    id: "assistant-message-4",
    sessionId: "session-4",
    role: "assistant",
    content: '{"message":',
    createdAt: new Date().toISOString()
  });

  assert.equal(parsed.includes('{"message"'), false);
  assert.match(parsed, /Ola! Como posso ajudar hoje\?/);
  assert.equal(safeFallback, "Nao consegui montar a resposta corretamente. Tente novamente em alguns instantes.");
});
