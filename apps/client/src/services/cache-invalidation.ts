const workspaceCacheEvent = "workspace-cache-invalidated";
const workspaceCacheTarget = new EventTarget();

export function invalidateWorkspaceCache() {
  workspaceCacheTarget.dispatchEvent(new Event(workspaceCacheEvent));
}

export function onWorkspaceCacheInvalidated(callback: () => void) {
  workspaceCacheTarget.addEventListener(workspaceCacheEvent, callback);
  return () => workspaceCacheTarget.removeEventListener(workspaceCacheEvent, callback);
}
