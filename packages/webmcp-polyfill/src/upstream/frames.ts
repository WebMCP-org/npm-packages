import type { WebMCP } from 'webmcp-types';

/** Tool metadata as its owner stores it and as frames exchange it. */
export interface ToolMetadata extends Pick<
  WebMCP.RegisteredTool,
  'name' | 'title' | 'description'
> {
  annotations: WebMCP.ToolAnnotations | undefined;
  // Snapshot at registration; each discovery result parses a fresh copy.
  serializedSchema: string | undefined;
}

// Lexicographical, the order in which Web IDL reads dictionary members.
export const annotationNames = [
  'consequentialHint',
  'debugging',
  'readOnlyHint',
  'untrustedContentHint',
] as const satisfies readonly (keyof WebMCP.ToolAnnotations)[];

interface Handlers {
  getTools(callerOrigin: string): ToolMetadata[];
  execute(
    callerOrigin: string,
    name: string,
    serializedInput: string,
    signal: AbortSignal
  ): Promise<string>;
  changed(): Promise<void>;
}

type Request =
  | { kind: 'permission'; childIndex: number; childOrigin: string }
  | { kind: 'getTools' }
  | { kind: 'execute'; name: string; input: string }
  | { kind: 'changed' };

type ReplyValue = boolean | ToolMetadata[] | string | undefined;

interface Session {
  peer: Window;
  end(): void;
}

const protocol = 'webmcp-polyfill';
// Bounds handshakes, discovery, and permission replies; author code has no deadline.
const deadline = 500;
const NativeDOMException = globalThis.DOMException;

export class FrameBridge {
  readonly #document: Document;
  readonly #window: Window;
  readonly #handlers: Handlers;
  // Windows whose documents have shown that they run the polyfill. Only these receive requests,
  // so a frame without the polyfill costs no further request deadlines after startup.
  readonly #knownPeers = new Set<Window>();
  // Frames that have not answered this document's first announcement.
  readonly #unanswered = new Set<Window>();
  readonly #started = Promise.withResolvers<void>();
  readonly #handshakes = new Map<string, (event: MessageEvent<unknown>) => void>();
  readonly #sessions = new Set<Session>();
  #monitor: number | undefined;
  #hidden = false;

  constructor(view: Window, handlers: Handlers) {
    this.#window = view;
    this.#document = view.document;
    this.#handlers = handlers;
    this.#window.addEventListener('message', (event) => this.#receive(event), true);
    this.#window.addEventListener('pagehide', () => {
      this.#hidden = true;
      for (const session of this.#sessions) {
        session.end();
      }
    });
    this.#window.addEventListener('pageshow', (event) => {
      // Only a restore from the back/forward cache follows pagehide.
      if (event.persisted) {
        this.#hidden = false;
        this.#announce();
      }
    });

    for (const frame of this.#announce()) {
      this.#unanswered.add(frame);
    }
    if (this.#unanswered.size === 0) {
      this.#started.resolve();
    } else {
      setTimeout(() => {
        this.#unanswered.clear();
        this.#started.resolve();
      }, deadline);
    }
  }

  async allowed(): Promise<boolean> {
    if (this.#hidden) {
      return false;
    }
    return this.#documentAllowed(this.#document);
  }

  async getTools(fromOrigins: string[]): Promise<WebMCP.RegisteredTool[]> {
    await this.#started.promise;
    const ownOrigin = this.#window.origin;
    const origins = [ownOrigin, ...fromOrigins];
    const results = await Promise.all(
      this.#participants().map(async (peer) => {
        if (peer === this.#window) {
          return this.#handlers
            .getTools(ownOrigin)
            .map((metadata) => toRegisteredTool(metadata, this.#window, ownOrigin));
        }
        try {
          const reply = await this.#request(peer, origins, { kind: 'getTools' });
          if (!Array.isArray(reply.value)) {
            throw new TypeError('Expected a tool list from the frame');
          }
          return reply.value.map((value: unknown) =>
            toRegisteredTool(readToolMetadata(value), peer, reply.origin)
          );
        } catch (error) {
          if (!(error instanceof NativeDOMException && error.name === 'UnknownError')) {
            console.warn('WebMCP: could not read tools from a frame.', error);
          }
          return [];
        }
      })
    );
    return results.flat();
  }

  async execute(
    target: Window,
    expectedOrigin: string,
    name: string,
    serializedInput: string,
    signal?: AbortSignal
  ): Promise<string> {
    const reply = await this.#request(
      target,
      [expectedOrigin],
      { kind: 'execute', name, input: serializedInput },
      signal
    );
    if (typeof reply.value !== 'string') {
      throw executionError();
    }
    return reply.value;
  }

  async notify(exposedTo: string[]): Promise<void> {
    await this.#started.promise;
    const origins = [this.#window.origin, ...exposedTo];
    // One frame at a time: the draft fires toolchange in tree order.
    for (const peer of this.#participants()) {
      if (peer === this.#window) {
        await this.#handlers.changed();
        continue;
      }
      try {
        await this.#request(peer, origins, { kind: 'changed' });
      } catch {
        // Frames may navigate or disappear while registration changes are delivered.
      }
    }
  }

  #request(
    target: Window,
    origins: string[] | undefined,
    request: Request,
    signal?: AbortSignal
  ): Promise<{ value: unknown; origin: string }> {
    return new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      if (this.#hidden || !this.#related(target)) {
        reject(executionError());
        return;
      }

      const id = crypto.randomUUID();
      const { port1, port2 } = new MessageChannel();
      let peerOrigin: string | undefined;

      const close = (): void => {
        clearTimeout(timer);
        stopWatching();
        signal?.removeEventListener('abort', abort);
        this.#handshakes.delete(id);
        port1.close();
      };
      const fail = (error: unknown = executionError()): void => {
        port1.postMessage({ kind: 'cancel' });
        close();
        reject(error);
      };
      const abort = (): void => fail(signal?.reason);
      const expire = (): void => {
        if (peerOrigin === undefined) {
          this.#forget(target);
        }
        fail();
      };
      const connected = (event: MessageEvent<unknown>): void => {
        if (event.source !== target) {
          return;
        }
        this.#handshakes.delete(id);
        if (origins && !origins.includes(event.origin)) {
          fail();
          return;
        }
        peerOrigin = event.origin;
        clearTimeout(timer);
        if (request.kind !== 'execute' && request.kind !== 'changed') {
          timer = setTimeout(expire, deadline);
        }
        // The port reaches the document that answered, even if its window navigates afterwards.
        port1.postMessage(request);
      };

      let timer = setTimeout(expire, deadline);
      const stopWatching = this.#watch(target, fail);
      port1.onmessage = (event: MessageEvent<unknown>) => {
        const reply = record(event.data);
        // A peer that gave up may say so before its ready message is handled here.
        if (reply?.kind === 'error') {
          fail();
          return;
        }
        if (reply?.kind !== 'result' || peerOrigin === undefined) {
          return;
        }
        close();
        resolve({ value: reply.value, origin: peerOrigin });
      };
      port1.onmessageerror = () => fail();
      signal?.addEventListener('abort', abort, { once: true });
      this.#handshakes.set(id, connected);
      // The peer's origin is unknown until it answers, and this message carries only the id.
      try {
        target.postMessage(`${protocol}:connect:${id}`, '*', [port2]);
      } catch {
        port2.close();
        fail();
      }
    });
  }

  #receive(event: MessageEvent<unknown>): void {
    const message = readWindowMessage(event.data);
    if (!message) {
      return;
    }
    // Protocol traffic must not reach the application's listeners, one-shot ones included.
    event.stopImmediatePropagation();
    const source = event.source;
    if (
      !event.isTrusted ||
      !source ||
      !isWindow(source) ||
      !this.#related(source) ||
      // An opaque origin cannot be named by exposedTo, fromOrigins, or an allow attribute.
      event.origin === 'null' ||
      this.#hidden
    ) {
      return;
    }

    if (message.kind === 'announce') {
      const isNew = !this.#knownPeers.has(source);
      this.#learn(source);
      source.postMessage(`${protocol}:present`, event.origin);
      // A newcomer's tree walk cannot reach frames inside shadow trees, so the top frame asks
      // every peer to announce again.
      if (!isNew || this.#window !== this.#window.top) {
        return;
      }
      for (const peer of this.#knownPeers) {
        if (peer === source) {
          continue;
        }
        peer.postMessage(`${protocol}:refresh`, '*');
      }
      return;
    }
    if (message.kind === 'present') {
      this.#learn(source);
      return;
    }
    if (message.kind === 'refresh') {
      if (source === this.#window.top) {
        this.#announce();
      }
      return;
    }
    if (message.kind === 'ready') {
      this.#handshakes.get(message.id)?.(event);
      return;
    }
    const [port] = event.ports;
    if (message.kind !== 'connect' || !message.id || !port || event.ports.length !== 1) {
      return;
    }
    this.#learn(source);
    this.#accept(source, event.origin, message.id, port);
  }

  #accept(source: Window, origin: string, id: string, port: MessagePort): void {
    const controller = new AbortController();
    let requested = false;

    const close = (): void => {
      clearTimeout(timer);
      stopWatching();
      port.close();
    };
    const cancel = (): void => {
      controller.abort();
      close();
    };
    const fail = (): void => {
      port.postMessage({ kind: 'error' });
      cancel();
    };
    // Tell a requester that was too slow to send its request; it may have no deadline left.
    const timer = setTimeout(fail, deadline);
    const stopWatching = this.#watch(source, fail);

    port.onmessageerror = fail;
    port.onmessage = async (event: MessageEvent<unknown>) => {
      const request = record(event.data);
      if (request?.kind === 'cancel') {
        cancel();
        return;
      }
      if (requested) {
        return;
      }
      requested = true;
      clearTimeout(timer);
      try {
        const value = await this.#respond(source, origin, request, controller.signal);
        port.postMessage({ kind: 'result', value });
        close();
      } catch {
        fail();
      }
    };
    source.postMessage(`${protocol}:ready:${id}`, origin);
  }

  async #respond(
    source: Window,
    origin: string,
    request: Record<string, unknown> | undefined,
    signal: AbortSignal
  ): Promise<ReplyValue> {
    if (!request || !this.#related(source)) {
      throw executionError();
    }
    if (request.kind === 'permission') {
      const { childIndex, childOrigin } = request;
      if (
        typeof childIndex !== 'number' ||
        !Number.isInteger(childIndex) ||
        childIndex < 0 ||
        typeof childOrigin !== 'string'
      ) {
        throw executionError();
      }
      return this.#childPermission(childIndex, childOrigin);
    }
    if (!(await this.allowed()) || !(await this.#sourceAllowed(source, origin))) {
      throw executionError();
    }
    // The checks above may have waited on other frames.
    if (!this.#related(source)) {
      throw executionError();
    }
    signal.throwIfAborted();
    if (request.kind === 'getTools') {
      return this.#handlers.getTools(origin);
    }
    if (
      request.kind === 'execute' &&
      typeof request.name === 'string' &&
      typeof request.input === 'string'
    ) {
      return this.#handlers.execute(origin, request.name, request.input, signal);
    }
    if (request.kind === 'changed') {
      await this.#handlers.changed();
      return undefined;
    }
    throw executionError();
  }

  async #childPermission(childIndex: number, childOrigin: string): Promise<boolean> {
    // Windows cannot cross postMessage, so the asker names the child by its index here.
    const child: Window | undefined = this.#window[childIndex];
    return (
      child !== undefined &&
      (await this.allowed()) &&
      childAllowed(this.#document, child, childOrigin)
    );
  }

  async #documentAllowed(owner: Document): Promise<boolean> {
    const view = activeWindow(owner);
    if (!view) {
      return false;
    }
    const policy = readToolsPolicy(owner);
    if (policy !== undefined) {
      return policy;
    }
    if (view === view.parent) {
      return true;
    }
    // Firefox has no ancestorOrigins; there the parent is simply tried.
    const parentOrigin = view.location.ancestorOrigins?.[0];
    const parentDocument = readDocument(
      view.parent,
      parentOrigin === undefined || parentOrigin === view.origin
    );
    if (!parentDocument) {
      return this.#parentPermission(view, view.origin);
    }
    return (
      childAllowed(parentDocument, view, view.origin) &&
      (await this.#documentAllowed(parentDocument))
    );
  }

  async #sourceAllowed(source: Window, origin: string): Promise<boolean> {
    const sourceDocument = readDocument(source, origin === this.#window.origin);
    return sourceDocument
      ? this.#documentAllowed(sourceDocument)
      : this.#parentPermission(source, origin);
  }

  async #parentPermission(child: Window, origin: string): Promise<boolean> {
    const parent = child.parent;
    if (parent === child) {
      return true;
    }
    let childIndex = -1;
    for (let index = 0; index < parent.length; index++) {
      if (parent[index] === child) {
        childIndex = index;
        break;
      }
    }
    if (childIndex < 0) {
      return false;
    }
    if (parent === this.#window) {
      return (await this.allowed()) && childAllowed(this.#document, child, origin);
    }
    await this.#started.promise;
    // A parent without the polyfill cannot vouch for its frames.
    if (!this.#knownPeers.has(parent)) {
      return false;
    }
    try {
      const reply = await this.#request(parent, undefined, {
        kind: 'permission',
        childIndex,
        childOrigin: origin,
      });
      // A parent's reply cannot grant permission denied by an ancestor.
      return reply.value === true && (await this.#sourceAllowed(parent, reply.origin));
    } catch {
      return false;
    }
  }

  #related(peer: Window): boolean {
    try {
      return !peer.closed && peer !== this.#window && peer.top === this.#window.top;
    } catch {
      return false;
    }
  }

  // Depth-first from the top, in document order. Indexed access omits frames inside shadow
  // trees, so known peers and this window's ancestors are also placed under their parents.
  // Peers that have left the tree are dropped on the way, so their windows are not retained.
  #tree(): Window[] {
    if (this.#window.closed) {
      return [];
    }
    for (const peer of this.#knownPeers) {
      if (!this.#related(peer)) {
        this.#knownPeers.delete(peer);
      }
    }
    const candidates = [this.#window, ...this.#knownPeers];
    for (
      let ancestor = this.#window.parent;
      ancestor !== ancestor.parent;
      ancestor = ancestor.parent
    ) {
      candidates.push(ancestor);
    }

    const tree = new Set<Window>();
    const pending = [this.#window.top!];
    while (pending.length) {
      const frame = pending.pop()!;
      if (tree.has(frame)) {
        continue;
      }
      tree.add(frame);
      const children: Window[] = [];
      for (let index = 0; index < frame.length; index++) {
        const child = frame[index];
        if (child) {
          children.push(child);
        }
      }
      for (const candidate of candidates) {
        if (candidate !== frame && candidate.parent === frame && !children.includes(candidate)) {
          children.push(candidate);
        }
      }
      // pop() takes from the end, so reversing keeps document order.
      pending.push(...children.reverse());
    }
    return Array.from(tree).filter((frame) => frame === this.#window || this.#related(frame));
  }

  #participants(): Window[] {
    return this.#tree().filter((frame) => frame === this.#window || this.#knownPeers.has(frame));
  }

  #announce(): Window[] {
    const others = this.#tree().filter((frame) => frame !== this.#window);
    for (const frame of others) {
      frame.postMessage(`${protocol}:announce`, '*');
    }
    return others;
  }

  #learn(peer: Window): void {
    this.#knownPeers.add(peer);
    this.#unanswered.delete(peer);
    if (this.#unanswered.size === 0) {
      this.#started.resolve();
    }
  }

  // A silent window may now hold a document without the polyfill. A live peer answers the
  // announcement and is learned again.
  #forget(peer: Window): void {
    this.#knownPeers.delete(peer);
    if (this.#related(peer)) {
      peer.postMessage(`${protocol}:announce`, '*');
    }
  }

  // No event reports a removed iframe, so one shared interval polls the open sessions.
  #watch(peer: Window, end: () => void): () => void {
    const session = { peer, end };
    this.#sessions.add(session);
    if (this.#monitor === undefined) {
      this.#monitor = this.#window.setInterval(() => {
        for (const open of this.#sessions) {
          if (!this.#related(open.peer)) {
            open.end();
          }
        }
      }, 100);
    }
    return () => {
      this.#sessions.delete(session);
      if (this.#sessions.size === 0) {
        this.#window.clearInterval(this.#monitor);
        this.#monitor = undefined;
      }
    };
  }
}

function childAllowed(owner: Document, child: Window, origin: string): boolean {
  const ownerOrigin = owner.defaultView?.origin;
  const frame = findFrame(owner, child, origin === ownerOrigin);
  if (!frame) {
    return false;
  }
  const directive = (frame.getAttribute('allow') ?? '')
    .split(';')
    .map((part) => part.trim().split(/\s+/u))
    .find(([name]) => name === 'tools');
  if (!directive) {
    return origin === ownerOrigin;
  }
  // A bare "tools" delegates to the origin of the src attribute.
  const sources = directive.length === 1 ? ["'src'"] : directive.slice(1);
  if (sources.includes("'none'")) {
    return false;
  }
  // A frame with srcdoc, no src, or an about: URL takes its owner's origin.
  const src = frame.hasAttribute('srcdoc') ? null : frame.getAttribute('src');
  const srcURL = src ? URL.parse(src, owner.baseURI) : null;
  const sourceOrigin = !src || srcURL?.protocol === 'about:' ? ownerOrigin : srcURL?.origin;
  return sources.some(
    (source) =>
      source === '*' ||
      (source === "'self'" && origin === ownerOrigin) ||
      (source === "'src'" && origin === sourceOrigin) ||
      source === origin
  );
}

// WebKit reports a blocked cross-origin access even when the error is caught, so a window is
// read only when the origins say the read can succeed.
function readDocument(view: Window, sameOrigin: boolean): Document | undefined {
  if (!sameOrigin) {
    return undefined;
  }
  try {
    return view.document;
  } catch {
    return undefined;
  }
}

function findFrame(owner: Document, child: Window, sameOrigin: boolean): Element | undefined {
  if (sameOrigin) {
    try {
      const frame = child.frameElement;
      // Compare documents; instanceof fails when `owner` belongs to another realm.
      if (frame?.ownerDocument === owner) {
        return frame;
      }
    } catch {
      // The claimed origin was wrong; the owner's own DOM still names its frames.
    }
  }
  return searchFrames(owner, child);
}

// Unlike frameElement, a DOM search cannot enter closed shadow roots.
function searchFrames(root: Document | ShadowRoot, child: Window): Element | undefined {
  const frames = root.querySelectorAll<HTMLIFrameElement | HTMLFrameElement>('iframe, frame');
  for (const frame of frames) {
    if (frame.contentWindow === child) {
      return frame;
    }
  }
  for (const element of root.querySelectorAll('*')) {
    if (!element.shadowRoot) {
      continue;
    }
    const frame = searchFrames(element.shadowRoot, child);
    if (frame) {
      return frame;
    }
  }
  return undefined;
}

export function activeWindow(owner: Document): Window | undefined {
  const view = owner.defaultView;
  return view && !view.closed && view.document === owner ? view : undefined;
}

export function readToolsPolicy(owner: Document): boolean | undefined {
  // Neither policy interface is in TypeScript's DOM library.
  const source: Document & { permissionsPolicy?: unknown; featurePolicy?: unknown } = owner;
  const policy = record(source.permissionsPolicy ?? source.featurePolicy);
  if (typeof policy?.features !== 'function' || typeof policy.allowsFeature !== 'function') {
    return undefined;
  }
  const features: unknown = policy.features();
  return Array.isArray(features) && features.includes('tools')
    ? Boolean(policy.allowsFeature('tools'))
    : undefined;
}

function toRegisteredTool(
  metadata: ToolMetadata,
  owner: Window,
  origin: string
): WebMCP.RegisteredTool {
  // SAFETY: the draft keeps whatever JSON toJSON produced; the cast matches RegisteredTool's type.
  const inputSchema =
    metadata.serializedSchema === undefined
      ? undefined
      : (JSON.parse(metadata.serializedSchema) as object);

  // Insert present members in Web IDL order.
  return {
    ...(metadata.annotations !== undefined && { annotations: { ...metadata.annotations } }),
    description: metadata.description,
    ...(inputSchema !== undefined && { inputSchema }),
    name: metadata.name,
    origin,
    title: metadata.title,
    window: owner,
  };
}

// Another frame's reply is untrusted input.
function readToolMetadata(value: unknown): ToolMetadata {
  const tool = record(value);
  if (
    !tool ||
    typeof tool.name !== 'string' ||
    typeof tool.title !== 'string' ||
    typeof tool.description !== 'string' ||
    (tool.serializedSchema !== undefined && typeof tool.serializedSchema !== 'string')
  ) {
    throw new TypeError('Invalid tool metadata from the frame');
  }
  const metadata: ToolMetadata = {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    annotations: undefined,
    serializedSchema: tool.serializedSchema,
  };
  if (tool.annotations === undefined) {
    return metadata;
  }
  const hints = record(tool.annotations);
  if (!hints) {
    throw new TypeError('Invalid tool annotations from the frame');
  }
  const annotations: WebMCP.ToolAnnotations = {};
  for (const name of annotationNames) {
    const hint = hints[name];
    if (hint === undefined) {
      continue;
    }
    if (typeof hint !== 'boolean') {
      throw new TypeError(`Invalid ${name} annotation from the frame`);
    }
    annotations[name] = hint;
  }
  metadata.annotations = annotations;
  return metadata;
}

function readWindowMessage(value: unknown): { kind: string; id: string } | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const [namespace, kind = '', id = '', extra] = value.split(':');
  return namespace === protocol && extra === undefined ? { kind, id } : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  // SAFETY: the object check permits property reads; each reader validates its members.
  return value as Record<string, unknown>;
}

function isWindow(value: MessageEventSource): value is Window {
  try {
    return 'postMessage' in value && 'window' in value;
  } catch {
    return false;
  }
}

export function executionError(): DOMException {
  return new NativeDOMException('Tool execution failed', 'UnknownError');
}
