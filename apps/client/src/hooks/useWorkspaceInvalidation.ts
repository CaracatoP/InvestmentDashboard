import { useEffect, useRef } from "react";
import {
  onWorkspaceSyncEvent,
  shouldRefreshWorkspaceDomains,
  type WorkspaceCacheDomain,
  type WorkspaceSyncDetail
} from "../services/workspace-sync";

export function useWorkspaceInvalidation(
  domains: WorkspaceCacheDomain | WorkspaceCacheDomain[],
  callback: (detail: WorkspaceSyncDetail) => void | Promise<void>
) {
  const callbackRef = useRef(callback);
  const domainsRef = useRef(domains);
  const domainKey = Array.isArray(domains) ? domains.join("|") : domains;
  callbackRef.current = callback;
  domainsRef.current = domains;

  useEffect(() => {
    return onWorkspaceSyncEvent((detail) => {
      if (!shouldRefreshWorkspaceDomains(domainsRef.current, detail.domains)) return;
      void callbackRef.current(detail);
    });
  }, [domainKey]);
}
