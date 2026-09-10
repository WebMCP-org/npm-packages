'use client';

import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react';
import { ConsentGuard } from './consent-broker.js';
import type { PendingConsentRequest } from './consent-types.js';

/**
 * Note: "Broker" in ConsentBrokerProvider and useConsentBroker refers to the
 * React-facing UI coordinator backed by ConsentGuard, not to @mcp-b/webmcp-plugins's
 * server/policy-oriented ConsentBroker.
 */
const BrokerContext = createContext<ConsentGuard | null>(null);

/**
 * Provides a {@link ConsentGuard} instance to the component subtree.
 *
 * Place this near the root of your application, above any component that uses
 * {@link useGuardedWebMCP}. A single guard instance is created per provider
 * mount and shared across all guarded tools in the tree.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <ConsentBrokerProvider>
 *       <ConsentCardRenderer />
 *       <Routes />
 *     </ConsentBrokerProvider>
 *   );
 * }
 * ```
 *
 * @public
 */
export function ConsentBrokerProvider({
  children,
  broker: providedBroker,
}: {
  children: ReactNode;
  broker?: ConsentGuard;
}) {
  const defaultBroker = useMemo(() => new ConsentGuard(), []);
  const broker = providedBroker ?? defaultBroker;
  return <BrokerContext.Provider value={broker}>{children}</BrokerContext.Provider>;
}

/**
 * Returns the nearest {@link ConsentGuard} from context.
 *
 * Used internally by {@link useGuardedWebMCP} to call `broker.request()` on
 * each guarded invocation. Consuming apps that build custom consent card UIs
 * may also call this to invoke `broker.decide()` from their UI components.
 *
 * @throws {Error} When called outside of a {@link ConsentBrokerProvider}.
 *
 * @public
 */
export function useConsentBroker(): ConsentGuard {
  const broker = useContext(BrokerContext);
  if (!broker) throw new Error('useConsentBroker must be used within ConsentBrokerProvider');
  return broker;
}

/**
 * Subscribes to the broker's pending request list and re-renders whenever it
 * changes.
 *
 * Use this in the component responsible for rendering the consent card UI.
 * The returned array contains one entry per in-flight tool invocation that is
 * awaiting user approval. Pass each entry's `id` to `broker.decide()` to
 * resolve it.
 *
 * @example
 * ```tsx
 * function ConsentCardRenderer() {
 *   const pending = usePendingConsentRequests();
 *   const broker = useConsentBroker();
 *
 *   return pending.map(req => (
 *     <ConsentCard
 *       key={req.id}
 *       request={req}
 *       onApprove={async () => { await broker.decide(req.id, true); }}
 *       onDeny={async () => { await broker.decide(req.id, false); }}
 *     />
 *   ));
 * }
 * ```
 *
 * @public
 */
export function usePendingConsentRequests(): PendingConsentRequest[] {
  const broker = useConsentBroker();
  const [pending, setPending] = useState<PendingConsentRequest[]>([]);
  useEffect(() => broker.subscribe(setPending), [broker]);
  return pending;
}
