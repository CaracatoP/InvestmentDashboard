const workspaceSyncEvent = "workspace-sync";
const workspaceSyncTarget = new EventTarget();
const broadcastChannelName = "invest-hub-workspace-sync";
const processedEventIds = new Set<string>();
const processedEventOrder: string[] = [];
const maxProcessedEventIds = 200;

export const workspaceDomains = [
  "all",
  "dashboard",
  "portfolio",
  "dividends",
  "contributions",
  "goals",
  "history",
  "settings",
  "monthlyPlanning",
  "assets",
  "operations",
  "cashBoxes",
  "market",
  "cdi",
  "ai"
] as const;

export type WorkspaceCacheDomain = (typeof workspaceDomains)[number];

export interface WorkspaceAffectedEntity {
  type: string;
  id?: string | null;
}

export interface WorkspaceSyncDetail {
  eventId: string;
  occurredAt: string;
  domains: WorkspaceCacheDomain[];
  source: "manual" | "mutation" | "ai" | "broadcast";
  reason?: string;
  mutationKey?: string;
  affectedEntities?: WorkspaceAffectedEntity[];
}

export interface WorkspaceSyncMetrics {
  emitted: number;
  delivered: number;
  broadcastSent: number;
  broadcastReceived: number;
  deduplicated: number;
  lastEvent: WorkspaceSyncDetail | null;
}

type WorkspaceSyncInput =
  | WorkspaceCacheDomain
  | WorkspaceCacheDomain[]
  | Partial<Omit<WorkspaceSyncDetail, "eventId" | "occurredAt" | "domains">> & {
      domains?: WorkspaceCacheDomain | WorkspaceCacheDomain[];
    };

const workspaceDomainSet = new Set<WorkspaceCacheDomain>(workspaceDomains);
const workspaceSyncMetrics: WorkspaceSyncMetrics = {
  emitted: 0,
  delivered: 0,
  broadcastSent: 0,
  broadcastReceived: 0,
  deduplicated: 0,
  lastEvent: null
};

let workspaceBroadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel() {
  if (typeof window === "undefined") return null;
  if (typeof BroadcastChannel !== "function") return null;
  if (!workspaceBroadcastChannel) workspaceBroadcastChannel = new BroadcastChannel(broadcastChannelName);
  return workspaceBroadcastChannel;
}

function normalizeDomains(domains?: WorkspaceCacheDomain | WorkspaceCacheDomain[]) {
  const values = Array.isArray(domains) ? domains : domains ? [domains] : ["all" as const];
  const unique = Array.from(new Set(values.filter((value): value is WorkspaceCacheDomain => workspaceDomainSet.has(value))));
  return unique.includes("all") ? ["all" as const] : unique;
}

function rememberProcessedEvent(eventId: string) {
  if (processedEventIds.has(eventId)) return;
  processedEventIds.add(eventId);
  processedEventOrder.push(eventId);

  while (processedEventOrder.length > maxProcessedEventIds) {
    const oldest = processedEventOrder.shift();
    if (oldest) processedEventIds.delete(oldest);
  }
}

function createWorkspaceSyncDetail(input?: WorkspaceSyncInput): WorkspaceSyncDetail {
  if (!input || typeof input === "string" || Array.isArray(input)) {
    return {
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      domains: normalizeDomains(input),
      source: "manual"
    };
  }

  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    domains: normalizeDomains(input.domains),
    source: input.source ?? "manual",
    reason: input.reason,
    mutationKey: input.mutationKey,
    affectedEntities: input.affectedEntities
  };
}

function dispatchWorkspaceSync(detail: WorkspaceSyncDetail) {
  workspaceSyncMetrics.delivered += 1;
  workspaceSyncMetrics.lastEvent = detail;
  const event = typeof CustomEvent === "function"
    ? new CustomEvent<WorkspaceSyncDetail>(workspaceSyncEvent, { detail })
    : Object.assign(new Event(workspaceSyncEvent), { detail });
  workspaceSyncTarget.dispatchEvent(event);
}

function broadcastWorkspaceSync(detail: WorkspaceSyncDetail) {
  const channel = getBroadcastChannel();
  if (!channel) return;
  workspaceSyncMetrics.broadcastSent += 1;
  channel.postMessage(detail);
}

function handleBroadcastMessage(event: MessageEvent<WorkspaceSyncDetail>) {
  const detail = event.data;
  if (!detail?.eventId || processedEventIds.has(detail.eventId)) {
    workspaceSyncMetrics.deduplicated += 1;
    return;
  }

  workspaceSyncMetrics.broadcastReceived += 1;
  rememberProcessedEvent(detail.eventId);
  dispatchWorkspaceSync({ ...detail, source: "broadcast" });
}

const broadcastChannel = getBroadcastChannel();
if (broadcastChannel) {
  broadcastChannel.addEventListener("message", handleBroadcastMessage as EventListener);
}

export function isWorkspaceCacheDomain(value: string): value is WorkspaceCacheDomain {
  return workspaceDomainSet.has(value as WorkspaceCacheDomain);
}

export function shouldRefreshWorkspaceDomains(subscribedDomains: WorkspaceCacheDomain | WorkspaceCacheDomain[], changedDomains: WorkspaceCacheDomain[]) {
  const desired = normalizeDomains(subscribedDomains);
  if (changedDomains.includes("all")) return true;
  if (desired.includes("all")) return true;
  return desired.some((domain) => changedDomains.includes(domain));
}

export function invalidateWorkspaceCache(input?: WorkspaceSyncInput) {
  const detail = createWorkspaceSyncDetail(input);
  if (processedEventIds.has(detail.eventId)) {
    workspaceSyncMetrics.deduplicated += 1;
    return detail;
  }

  rememberProcessedEvent(detail.eventId);
  workspaceSyncMetrics.emitted += 1;
  dispatchWorkspaceSync(detail);
  if (detail.source !== "broadcast") broadcastWorkspaceSync(detail);
  return detail;
}

export function onWorkspaceSyncEvent(callback: (detail: WorkspaceSyncDetail) => void) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<WorkspaceSyncDetail>).detail;
    callback(detail);
  };

  workspaceSyncTarget.addEventListener(workspaceSyncEvent, handler);
  return () => workspaceSyncTarget.removeEventListener(workspaceSyncEvent, handler);
}

export function onWorkspaceCacheInvalidated(callback: (domains: WorkspaceCacheDomain[]) => void) {
  return onWorkspaceSyncEvent((detail) => callback(detail.domains));
}

export function getWorkspaceSyncMetrics() {
  return {
    ...workspaceSyncMetrics,
    lastEvent: workspaceSyncMetrics.lastEvent ? { ...workspaceSyncMetrics.lastEvent } : null
  };
}

export function resetWorkspaceSyncMetrics() {
  workspaceSyncMetrics.emitted = 0;
  workspaceSyncMetrics.delivered = 0;
  workspaceSyncMetrics.broadcastSent = 0;
  workspaceSyncMetrics.broadcastReceived = 0;
  workspaceSyncMetrics.deduplicated = 0;
  workspaceSyncMetrics.lastEvent = null;
  processedEventIds.clear();
  processedEventOrder.length = 0;
}
