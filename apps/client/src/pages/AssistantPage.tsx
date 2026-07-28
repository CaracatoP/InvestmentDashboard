import { Bot, MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AiStructuredMessage } from "../components/ai/AiStructuredMessage";
import { ChatBubble } from "../components/ai/ChatBubble";
import { TypingIndicator } from "../components/ai/TypingIndicator";
import { PageHeader } from "../components/ui/PageHeader";
import { aiChatApi } from "../services/api";
import { useInvestmentStore } from "../stores/useInvestmentStore";
import type { AiChatMessage, AiChatSession } from "../types/ai";

const suggestions = [
  "Como foi meu planejamento deste mes?",
  "Quais gastos mais pesaram no orcamento?",
  "Minha carteira esta bem distribuida?",
  "Quanto recebi de dividendos recentemente?"
];

function formatMessageDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function dateKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatDateSeparator(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  if (dateKey(value) === dateKey(today.toISOString())) return "Hoje";
  if (dateKey(value) === dateKey(yesterday.toISOString())) return "Ontem";
  if (date >= startOfWeek) return "Esta semana";

  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function isConfirmationMessage(value: string) {
  return /^(confirmo|pode registrar|pode confirmar|confirmar|sim pode|ok pode|pode executar)/i.test(value.trim());
}

export function AssistantPage() {
  const [sessions, setSessions] = useState<AiChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<AiChatSession | null>(null);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<AiChatMessage | null>(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [error, setError] = useState("");
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const loadWorkspace = useInvestmentStore((state) => state.loadWorkspace);

  async function loadSessions() {
    const records = await aiChatApi.listSessions();
    setSessions(records);
    if (!activeSession && records[0]?.id) {
      await openSession(records[0]);
    }
  }

  async function openSession(session: AiChatSession) {
    if (!session.id) return;
    const details = await aiChatApi.getSession(session.id);
    setActiveSession(details.session);
    setMessages(details.messages);
  }

  async function createSession() {
    setIsLoading(true);
    setError("");
    try {
      const session = await aiChatApi.createSession();
      setSessions((current) => [session, ...current]);
      setActiveSession(session);
      setMessages([]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Nao foi possivel criar a conversa.");
    } finally {
      setIsLoading(false);
    }
  }

  async function removeSession(session: AiChatSession) {
    if (!session.id) return;
    await aiChatApi.removeSession(session.id);
    const remaining = sessions.filter((item) => item.id !== session.id);
    setSessions(remaining);
    if (activeSession?.id === session.id) {
      setActiveSession(null);
      setMessages([]);
      if (remaining[0]) await openSession(remaining[0]);
    }
  }

  async function sendMessage(message = input) {
    const content = message.trim();
    if (!content) return;

    setIsLoading(true);
    setIsExecutingAction(isConfirmationMessage(content));
    setPendingUserMessage({
      sessionId: activeSession?.id ?? "pending",
      role: "user",
      content,
      createdAt: new Date().toISOString()
    });
    setInput("");
    setError("");
    try {
      let sessionId = activeSession?.id;
      if (!sessionId) {
        const createdSession = await aiChatApi.createSession();
        if (!createdSession.id) throw new Error("Conversa criada sem identificador.");
        sessionId = createdSession.id;
        setActiveSession(createdSession);
        setSessions((current) => [createdSession, ...current]);
      }

      const result = await aiChatApi.sendMessage(sessionId, content);
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
      setInput("");
      await loadSessions();
      if (result.assistantMessage.structuredResponse?.responseType === "success") {
        await loadWorkspace();
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Nao foi possivel enviar a mensagem.");
    } finally {
      setPendingUserMessage(null);
      setIsExecutingAction(false);
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions().catch(() => setSessions([]));
  }, []);

  const visibleMessages = useMemo(() => (pendingUserMessage ? [...messages, pendingUserMessage] : messages), [messages, pendingUserMessage]);
  const emptyState = useMemo(() => visibleMessages.length === 0, [visibleMessages.length]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visibleMessages.length, isLoading]);

  return (
    <div>
      <PageHeader
        eyebrow="Assistente IA"
        title="Assistente financeiro"
        description="Converse com a IA sobre planejamento, carteira, dividendos, metas, caixinhas e historico usando dados reais do backend."
      />

      {error ? <p className="mb-4 rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-sm text-amber">{error}</p> : null}

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(15rem,0.28fr)_minmax(0,0.72fr)]">
        <aside className="min-w-0 rounded-lg border border-line bg-panel p-3 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Conversas</h2>
            <button
              type="button"
              onClick={() => void createSession()}
              disabled={isLoading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-black transition hover:bg-accent/90 disabled:opacity-60"
            >
              <MessageSquarePlus size={16} />
              Nova
            </button>
          </div>
          <div className="mt-3 grid gap-1.5">
            {sessions.length > 0 ? (
              sessions.map((session) => (
                <div key={session.id ?? session.title} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${activeSession?.id === session.id ? "border-accent/50 bg-accent/10" : "border-line bg-elevated"}`}>
                  <button type="button" onClick={() => void openSession(session)} className="min-w-0 flex-1 text-left text-sm text-muted outline-none transition hover:text-ink focus-visible:text-accent">
                    <span className="block truncate font-medium text-ink">{session.title}</span>
                    <span className="text-xs text-muted">{formatMessageDate(session.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeSession(session)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-rose/10 hover:text-rose"
                    aria-label={`Excluir conversa ${session.title}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            ) : (
              <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-muted">Nenhuma conversa criada ainda.</p>
            )}
          </div>
        </aside>

        <main className="flex h-[calc(100vh-12rem)] min-h-[560px] min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-soft">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Bot size={18} className="text-accent" />
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-ink">{activeSession?.title ?? "Nova conversa"}</h2>
              <p className="text-xs text-muted">Consultas e acoes seguras sempre passam por confirmacao.</p>
            </div>
          </div>

          <div ref={messageListRef} className="flex-1 overflow-y-auto px-3 py-3">
            {emptyState ? (
              <div className="grid gap-2">
                <p className="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">Comece por uma pergunta ou use uma sugestao.</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void sendMessage(suggestion)}
                      className="rounded-lg border border-line bg-elevated px-3 py-2 text-left text-sm text-muted transition hover:border-accent/60 hover:text-ink"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              visibleMessages.map((message, index) => {
                const previous = visibleMessages[index - 1];
                const showDate = !previous || dateKey(previous.createdAt) !== dateKey(message.createdAt);
                const grouped = Boolean(previous && previous.role === message.role && dateKey(previous.createdAt) === dateKey(message.createdAt));

                return (
                  <Fragment key={message.id ?? `${message.role}-${message.createdAt}-${index}`}>
                    {showDate ? (
                      <div className="my-3 flex justify-center">
                        <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-medium text-muted">{formatDateSeparator(message.createdAt)}</span>
                      </div>
                    ) : null}
                    <ChatBubble role={message.role} timestamp={formatMessageDate(message.createdAt)} grouped={grouped}>
                      {message.role === "assistant" && message.structuredResponse ? (
                        <AiStructuredMessage response={message.structuredResponse} onSend={(nextMessage) => void sendMessage(nextMessage)} isLoading={isLoading} />
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                    </ChatBubble>
                  </Fragment>
                );
              })
            )}
            {isLoading ? (
              <div className="mt-3">
                <TypingIndicator label={isExecutingAction ? "Executando acao..." : "Pensando..."} />
              </div>
            ) : null}
            <div ref={messageEndRef} />
          </div>

          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void sendMessage();
            }}
            className="sticky bottom-0 flex flex-col gap-2 border-t border-line bg-panel/95 px-3 py-2 backdrop-blur sm:flex-row"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Pergunte sobre sua carteira, planejamento ou metas..."
              className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-elevated px-3 text-sm text-ink outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-black transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={16} />
              Enviar
            </button>
          </form>
        </main>
      </section>
    </div>
  );
}
