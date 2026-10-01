import type { WebMCP } from 'webmcp-types';
import { executionError } from './upstream/frames.js';

type InputSchema = NonNullable<WebMCP.ModelContextTool['inputSchema']>;
type WebMcpToolInput = Parameters<WebMCP.ToolExecuteCallback>[0];
// webmcp-types accepts any schema object. This is the subset generated from form controls.
interface FormParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array';
  description?: string;
  title?: string;
  const?: string;
  enum?: string[];
  anyOf?: FormParameterSchema[];
  items?: FormParameterSchema;
  uniqueItems?: boolean;
  minimum?: number;
  maximum?: number;
  multipleOf?: number;
  pattern?: string;
  format?: string;
}

type WebMcpToolResult = Awaited<ReturnType<WebMCP.ToolExecuteCallback>>;

type DeclarativeControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Submitter = HTMLButtonElement | HTMLInputElement;

interface DeclarativeToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: InputSchema;
  autosubmit: boolean;
}

interface DeclarativeRegistration {
  controller: AbortController;
  fingerprint: string;
  form: HTMLFormElement;
  cancelPending?: (reason: ErrorOptions['cause']) => void;
}

interface ActiveSubmission {
  complete(event: SubmitEvent): void;
  direct(): void;
  respond(event: SubmitEvent): void;
}

const agentInvokedEvents = new WeakSet<SubmitEvent>();
const agentResponses = new WeakMap<SubmitEvent, Promise<WebMcpToolResult>>();
const activeSubmissions = new WeakMap<HTMLFormElement, ActiveSubmission>();

function isAgentInvokedSubmitEvent(event: SubmitEvent): boolean {
  return (
    event.isTrusted &&
    (agentInvokedEvents.has(event) ||
      (event.eventPhase !== Event.NONE &&
        event.target instanceof HTMLFormElement &&
        activeSubmissions.has(event.target)))
  );
}

function respondWithAgentSubmitEvent(
  event: SubmitEvent,
  agentResponse: Promise<WebMcpToolResult>
): void {
  if (!isAgentInvokedSubmitEvent(event)) {
    throw new DOMException(
      'respondWith() is only available during an agent-invoked submit event',
      'InvalidStateError'
    );
  }
  if (!event.defaultPrevented) {
    throw new DOMException(
      'respondWith() requires preventDefault() during an agent-invoked submit event',
      'InvalidStateError'
    );
  }
  if (event.eventPhase === Event.NONE) {
    throw new DOMException(
      'respondWith() is only available while the submit event is being dispatched',
      'InvalidStateError'
    );
  }
  agentInvokedEvents.add(event);
  const response = Promise.resolve(agentResponse);
  agentResponses.set(event, response);
  if (event.target instanceof HTMLFormElement) {
    activeSubmissions.get(event.target)?.respond(event);
  }
}

const TEXT_INPUT_TYPES = new Set(['email', 'password', 'search', 'tel', 'text', 'url']);
const READONLY_INPUT_TYPES = new Set([
  ...TEXT_INPUT_TYPES,
  'date',
  'datetime-local',
  'month',
  'number',
  'time',
  'week',
]);

function isControl(element: Element): element is DeclarativeControl {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  );
}

function getFormControls(form: HTMLFormElement): HTMLFormControlsCollection {
  return Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'elements')?.get?.call(form);
}

function getFormAttribute(form: HTMLFormElement, name: string): string | null {
  return Element.prototype.getAttribute.call(form, name);
}

function formHasAttribute(form: HTMLFormElement, name: string): boolean {
  return Element.prototype.hasAttribute.call(form, name);
}

function isConnected(node: Node): boolean {
  return Object.getOwnPropertyDescriptor(Node.prototype, 'isConnected')?.get?.call(node);
}

function getOpenShadowRoot(element: Element): ShadowRoot | null {
  return Object.getOwnPropertyDescriptor(Element.prototype, 'shadowRoot')?.get?.call(element);
}

function checkFormValidity(form: HTMLFormElement): boolean {
  return HTMLFormElement.prototype.checkValidity.call(form);
}

function requestFormSubmit(form: HTMLFormElement, submitter?: Submitter): void {
  HTMLFormElement.prototype.requestSubmit.call(form, submitter);
}

function getControls(form: HTMLFormElement): DeclarativeControl[] {
  return [...getFormControls(form)].filter(
    (element): element is DeclarativeControl =>
      isControl(element) &&
      !element.matches(':disabled') &&
      !(
        'readOnly' in element &&
        element.readOnly &&
        (element instanceof HTMLTextAreaElement || READONLY_INPUT_TYPES.has(element.type))
      )
  );
}

function controlGroups(form: HTMLFormElement): Map<string, DeclarativeControl[]> {
  const groups = new Map<string, DeclarativeControl[]>();
  for (const control of getControls(form)) {
    const name = control.name.trim();
    const controls = groups.get(name);
    if (controls) controls.push(control);
    else groups.set(name, [control]);
  }
  return groups;
}

function labelText(control: DeclarativeControl): string {
  return [...(control.labels ?? [])]
    .map((label) => {
      const copy = label.cloneNode(true);
      if (!(copy instanceof HTMLElement)) return '';
      copy
        .querySelectorAll('button, input, meter, output, progress, select, textarea')
        .forEach((element) => element.remove());
      return copy.textContent?.trim() ?? '';
    })
    .filter(Boolean)
    .join('; ');
}

function commonFieldset(
  form: HTMLFormElement,
  controls: readonly DeclarativeControl[]
): HTMLFieldSetElement | undefined {
  for (
    let element = controls[0]?.parentElement;
    element && element !== form;
    element = element.parentElement
  ) {
    if (
      element instanceof HTMLFieldSetElement &&
      controls.every((control) => element.contains(control))
    ) {
      return element;
    }
  }
  return undefined;
}

function parameterDescription(
  form: HTMLFormElement,
  controls: readonly DeclarativeControl[]
): string | undefined {
  if (controls.length === 1) {
    const control = controls[0];
    if (!control) return undefined;
    return (
      control.getAttribute('toolparamdescription') ||
      labelText(control) ||
      control.getAttribute('aria-description') ||
      undefined
    );
  }
  return commonFieldset(form, controls)?.getAttribute('toolparamdescription') || undefined;
}

function withDescription(
  schema: FormParameterSchema,
  form: HTMLFormElement,
  controls: readonly DeclarativeControl[],
  extra?: string
): FormParameterSchema {
  const description = parameterDescription(form, controls);
  const combined = description && extra ? `${description} (${extra})` : description || extra;
  return combined ? { ...schema, description: combined } : schema;
}

function validNumberAttribute(input: HTMLInputElement, name: 'max' | 'min'): number | undefined {
  const raw = input.getAttribute(name);
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function validStep(input: HTMLInputElement, fallback: number): number {
  const step = Number(input.getAttribute('step'));
  return Number.isFinite(step) && step > 0 ? step : fallback;
}

function isStepBaseMultiple(stepBase: number, step: number): boolean {
  const quotient = stepBase / step;
  return Math.abs(quotient - Math.round(quotient)) < Number.EPSILON * 16;
}

function withPattern(schema: FormParameterSchema, input: HTMLInputElement): FormParameterSchema {
  const pattern = input.getAttribute('pattern');
  if (pattern === null) return schema;
  try {
    new RegExp(pattern, 'v');
  } catch {
    return schema;
  }
  return { ...schema, pattern };
}

function numberSchema(input: HTMLInputElement): FormParameterSchema {
  const schema: FormParameterSchema = { type: 'number' };
  const minimum = validNumberAttribute(input, 'min');
  const maximum = validNumberAttribute(input, 'max');
  if (minimum !== undefined) schema.minimum = minimum;
  if (maximum !== undefined) schema.maximum = maximum;
  if (input.getAttribute('step') !== 'any') {
    const step = validStep(input, 1);
    const rawValue = Number(input.getAttribute('value'));
    const stepBase = minimum ?? (Number.isFinite(rawValue) ? rawValue : 0);
    if (isStepBaseMultiple(stepBase, step)) schema.multipleOf = step;
  }
  return schema;
}

function temporalFormat(input: HTMLInputElement, datePrefix: string): string {
  const step = validStep(input, 60);
  if (step < 1) return `${datePrefix}(:[0-5][0-9](\\.[0-9]{1,3})?)?$`;
  if (step < 60) return `${datePrefix}(:[0-5][0-9])?$`;
  return `${datePrefix}$`;
}

function optionSchemas(options: readonly HTMLOptionElement[]) {
  return {
    anyOf: options.map((option) => ({
      type: 'string' as const,
      const: option.value,
      title: option.textContent ?? '',
    })),
    enum: options.map((option) => option.value),
  };
}

function groupChoiceSchemas(controls: readonly HTMLInputElement[]) {
  return {
    anyOf: controls.map((control) => {
      const title = labelText(control);
      const schema: FormParameterSchema = { type: 'string', const: control.value };
      if (title) schema.title = title;
      return schema;
    }),
    enum: controls.map((control) => control.value),
  };
}

function isInput(control: DeclarativeControl, type: string): control is HTMLInputElement {
  return control instanceof HTMLInputElement && control.type === type;
}

function inputSchema(input: HTMLInputElement): FormParameterSchema | undefined {
  if (TEXT_INPUT_TYPES.has(input.type)) return withPattern({ type: 'string' }, input);
  switch (input.type) {
    case 'hidden':
      return input.getAttribute('toolparamdescription') ? { type: 'string' } : undefined;
    case 'number':
      return withPattern(numberSchema(input), input);
    case 'range': {
      const schema = numberSchema(input);
      schema.minimum ??= 0;
      schema.maximum ??= 100;
      return schema;
    }
    case 'checkbox':
      return { type: 'boolean' };
    case 'date':
      return { type: 'string', format: 'date' };
    case 'month':
      return { type: 'string', format: '^[0-9]{4}-(0[1-9]|1[0-2])$' };
    case 'week':
      return { type: 'string', format: '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$' };
    case 'time':
      return { type: 'string', format: temporalFormat(input, '^([01][0-9]|2[0-3]):[0-5][0-9]') };
    case 'datetime-local':
      return {
        type: 'string',
        format: temporalFormat(
          input,
          '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]'
        ),
      };
    case 'color':
      return { type: 'string', format: '^#[0-9a-zA-Z]{6}$' };
    default:
      return undefined;
  }
}

function parameterSchema(
  form: HTMLFormElement,
  controls: readonly DeclarativeControl[]
): FormParameterSchema | undefined {
  const [first] = controls;
  if (!first) return undefined;
  let schema: FormParameterSchema | undefined;
  if (controls.every((control) => isInput(control, 'radio'))) {
    schema = { type: 'string', ...groupChoiceSchemas(controls) };
  } else if (controls.length > 1) {
    if (controls.every((control) => isInput(control, 'checkbox'))) {
      schema = {
        type: 'array',
        items: { type: 'string', ...groupChoiceSchemas(controls) },
        uniqueItems: true,
      };
    }
  } else if (first instanceof HTMLTextAreaElement) {
    schema = { type: 'string' };
  } else if (first instanceof HTMLSelectElement) {
    const choices = optionSchemas([...first.options]);
    schema = first.multiple
      ? { type: 'array', items: { type: 'string', ...choices }, uniqueItems: true }
      : { type: 'string', ...choices };
  } else {
    schema = inputSchema(first);
  }
  const dateHint =
    first.type === 'date' ? "Dates MUST be provided in 'YYYY-MM-DD' format." : undefined;
  return schema && withDescription(schema, form, controls, dateHint);
}

function synthesizeSchema(form: HTMLFormElement): InputSchema {
  const properties: Record<string, FormParameterSchema> = {};
  const required: string[] = [];
  for (const [name, controls] of controlGroups(form)) {
    if (!name) continue;
    const schema = parameterSchema(form, controls);
    if (!schema) continue;
    Object.defineProperty(properties, name, {
      configurable: true,
      enumerable: true,
      value: schema,
      writable: true,
    });
    if (controls.some((control) => control.required)) required.push(name);
  }
  return { type: 'object', properties, required };
}

function toolDefinition(form: HTMLFormElement): DeclarativeToolDefinition {
  return {
    name: getFormAttribute(form, 'toolname') ?? '',
    title: getFormAttribute(form, 'tooltitle') ?? '',
    description: getFormAttribute(form, 'tooldescription') ?? '',
    inputSchema: synthesizeSchema(form),
    autosubmit: formHasAttribute(form, 'toolautosubmit'),
  };
}

function toFormString(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function toFormBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isInteger(value)) return value !== 0;
  if (typeof value !== 'string') return undefined;
  if (value === '1' || value.toLowerCase() === 'true') return true;
  if (value === '0' || value.toLowerCase() === 'false') return false;
  return undefined;
}

function hasUniqueAllowedValues(value: unknown, allowed: ReadonlySet<string>): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const remaining = new Set(allowed);
  for (const item of value) {
    const string = toFormString(item);
    if (string === undefined || !remaining.delete(string)) return false;
  }
  return true;
}

function inputAcceptsValue(input: HTMLInputElement, value: string): boolean {
  if (value === '') return input.type !== 'number' && input.type !== 'range';
  const probe = input.ownerDocument.createElement('input');
  probe.type = input.type;
  probe.value = value;
  return probe.value !== '';
}

type FormParameterValue = string | boolean | number | unknown[];

function isFormParameterValue(
  form: HTMLFormElement,
  controls: readonly DeclarativeControl[],
  value: unknown
): value is FormParameterValue {
  const [first] = controls;
  if (!first || !parameterSchema(form, controls)) return false;
  const string = toFormString(value);
  if (controls.every((control) => isInput(control, 'radio'))) {
    return controls.some((control) => control.value === string);
  }
  // Any other group with a schema is a checkbox group.
  if (controls.length > 1) {
    return hasUniqueAllowedValues(value, new Set(controls.map((control) => control.value)));
  }
  if (first instanceof HTMLSelectElement) {
    const allowed = new Set([...first.options].map((option) => option.value));
    if (first.multiple) return hasUniqueAllowedValues(value, allowed);
    return string !== undefined && allowed.has(string);
  }
  if (first instanceof HTMLTextAreaElement) return string !== undefined;
  if (first.type === 'checkbox') return toFormBoolean(value) !== undefined;
  return string !== undefined && inputAcceptsValue(first, string);
}

function dispatchInputAndChange(control: DeclarativeControl): void {
  control.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

// Prototype setters skip instance overrides such as React's value tracker, so frameworks
// treat the dispatched events as real changes.
function setValue(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (control.value === value) return;
  const prototype =
    control instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value);
  dispatchInputAndChange(control);
}

function setChecked(control: HTMLInputElement, checked: boolean): void {
  if (control.checked === checked) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set?.call(
    control,
    checked
  );
  dispatchInputAndChange(control);
}

// Expects a value that isFormParameterValue() accepted.
function fillParameter(controls: readonly DeclarativeControl[], value: FormParameterValue): void {
  const [first] = controls;
  const string = toFormString(value);
  const values = new Set(Array.isArray(value) ? value.map(toFormString) : []);
  if (controls.every((control) => isInput(control, 'radio'))) {
    const control = controls.find((candidate) => candidate.value === string);
    if (control) setChecked(control, true);
  } else if (controls.length > 1) {
    for (const control of controls) {
      if (control instanceof HTMLInputElement) setChecked(control, values.has(control.value));
    }
  } else if (first instanceof HTMLSelectElement) {
    if (first.multiple) {
      let changed = false;
      for (const option of first.options) {
        const next = values.has(option.value);
        if (option.selected === next) continue;
        option.selected = next;
        changed = true;
      }
      if (changed) dispatchInputAndChange(first);
    } else if (string !== undefined && first.value !== string) {
      first.value = string;
      dispatchInputAndChange(first);
    }
  } else if (first && isInput(first, 'checkbox')) {
    const checked = toFormBoolean(value);
    if (checked !== undefined) setChecked(first, checked);
  } else if (first && string !== undefined) {
    setValue(first, string);
  }
}

// Upstream replaces every callback failure with its own generic error, so no reason
// thrown or rejected from this layer reaches a caller.
function fillForm(form: HTMLFormElement, input: WebMcpToolInput): void {
  if (Array.isArray(input)) throw executionError();
  const groups = controlGroups(form);
  const parameters: Array<{ controls: DeclarativeControl[]; value: FormParameterValue }> = [];
  for (const [name, value] of Object.entries(input)) {
    const controls = groups.get(name);
    if (!controls || !isFormParameterValue(form, controls, value)) throw executionError();
    parameters.push({ controls, value });
  }
  for (const { controls, value } of parameters) fillParameter(controls, value);
}

function findSubmitter(form: HTMLFormElement): Submitter | undefined {
  return [...getFormControls(form)].find(
    (element): element is Submitter =>
      !element.matches(':disabled') &&
      ((element instanceof HTMLButtonElement && element.type === 'submit') ||
        (element instanceof HTMLInputElement && ['image', 'submit'].includes(element.type)))
  );
}

function lifecycleEvent(type: 'toolactivated' | 'toolcancel', toolName: string): Event {
  const event = new Event(type);
  Object.defineProperty(event, 'toolName', { enumerable: true, value: toolName });
  return event;
}

function waitForSubmission(
  context: WebMCP.ModelContext,
  registration: DeclarativeRegistration,
  definition: DeclarativeToolDefinition,
  submitter: Submitter | undefined,
  signal: AbortSignal
): Promise<WebMcpToolResult> {
  const { form } = registration;
  registration.cancelPending?.(executionError());

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      EventTarget.prototype.removeEventListener.call(form, 'invalid', onInvalid, true);
      signal.removeEventListener('abort', onAbort);
      activeSubmissions.delete(form);
      if (registration.cancelPending === cancel) delete registration.cancelPending;
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const cancel = (reason: ErrorOptions['cause']) => finish(() => reject(reason));
    // A submission without respondWith() resolves to null, as in Chromium; an undefined
    // response maps to null as well so that upstream can serialize the result.
    const settleResponse = (response: Promise<WebMcpToolResult>) => {
      response.then(
        (value) => finish(() => resolve(value ?? null)),
        (cause: ErrorOptions['cause']) => finish(() => reject(cause))
      );
    };
    const onInvalid = (event: Event) => {
      if (!event.isTrusted) return;
      queueMicrotask(() => {
        if (!checkFormValidity(form)) cancel(executionError());
      });
    };
    const onAbort = () => {
      finish(() => {
        context.dispatchEvent(lifecycleEvent('toolcancel', definition.name));
        reject(signal.reason);
      });
    };

    activeSubmissions.set(form, {
      complete(event) {
        queueMicrotask(() => {
          const response = agentResponses.get(event);
          if (response) settleResponse(response);
          else if (event.defaultPrevented) cancel(executionError());
          else finish(() => resolve(null));
        });
      },
      direct() {
        finish(() => resolve(null));
      },
      respond(event) {
        queueMicrotask(() => {
          const response = agentResponses.get(event);
          if (response) settleResponse(response);
        });
      },
    });
    registration.cancelPending = cancel;
    EventTarget.prototype.addEventListener.call(form, 'invalid', onInvalid, true);
    signal.addEventListener('abort', onAbort, { once: true });

    if (!definition.autosubmit) {
      submitter?.focus();
      context.dispatchEvent(lifecycleEvent('toolactivated', definition.name));
      return;
    }
    try {
      requestFormSubmit(form, submitter);
      context.dispatchEvent(lifecycleEvent('toolactivated', definition.name));
    } catch (error) {
      cancel(error);
    }
  });
}

/** Adds declarative tools until the vendored upstream implements them. */
export function installWebMCPDeclarativeExtensions(context: WebMCP.ModelContext): void {
  const prototype = SubmitEvent.prototype;
  // Native support and earlier bundle installations already own these hooks.
  if ('agentInvoked' in prototype && 'respondWith' in prototype) return;

  if (!('agentInvoked' in prototype)) {
    Object.defineProperty(prototype, 'agentInvoked', {
      configurable: true,
      enumerable: true,
      get(this: SubmitEvent) {
        return isAgentInvokedSubmitEvent(this);
      },
    });
  }

  if (!('respondWith' in prototype)) {
    Object.defineProperty(prototype, 'respondWith', {
      configurable: true,
      enumerable: true,
      writable: true,
      value(this: SubmitEvent, agentResponse: Promise<WebMcpToolResult>) {
        respondWithAgentSubmitEvent(this, agentResponse);
      },
    });
  }

  const registrations = new Map<HTMLFormElement, DeclarativeRegistration>();
  const blockedDefinitions = new Map<HTMLFormElement, string>();
  const observers = new Map<Document | ShadowRoot, MutationObserver>();
  const onSubmit = (event: Event) => {
    if (
      !(event instanceof SubmitEvent) ||
      !event.isTrusted ||
      !(event.target instanceof HTMLFormElement)
    ) {
      return;
    }
    // Only a form with a running tool call submits on the agent's behalf; marking
    // every trusted submit would report agentInvoked for ordinary user submissions.
    const submission = activeSubmissions.get(event.target);
    if (!submission) return;
    agentInvokedEvents.add(event);
    submission.complete(event);
  };

  const onReset = (event: Event) => {
    if (!event.isTrusted || !(event.target instanceof HTMLFormElement)) return;
    const form = event.target;
    queueMicrotask(() => {
      if (event.defaultPrevented) return;
      registrations.get(form)?.cancelPending?.(executionError());
    });
  };

  function stopObservingRoot(root: Document | ShadowRoot): void {
    observers.get(root)?.disconnect();
    observers.delete(root);
    root.removeEventListener('reset', onReset, true);
    root.removeEventListener('submit', onSubmit, true);
  }

  function observeRoot(root: Document | ShadowRoot): void {
    if (observers.has(root)) return;
    const observer = new MutationObserver(sync);
    observers.set(root, observer);
    observer.observe(root, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    root.addEventListener('reset', onReset, true);
    // ponytail: submit is composed:false, so per-root capture sees every submission; hook
    // window capture too if a page listener ever stops propagation before this one.
    root.addEventListener('submit', onSubmit, true);
  }

  function sync(): void {
    observeRoot(document);
    for (const root of observers.keys()) {
      if (root instanceof ShadowRoot && !root.host.isConnected) {
        stopObservingRoot(root);
      }
    }

    const candidates = new Set<HTMLFormElement>();
    const selected = new Map<
      HTMLFormElement,
      { definition: DeclarativeToolDefinition; fingerprint: string }
    >();
    const selectedByName = new Map<string, HTMLFormElement>();
    for (const root of observers.keys()) {
      for (const element of root.querySelectorAll('*')) {
        const shadowRoot = getOpenShadowRoot(element);
        if (shadowRoot) observeRoot(shadowRoot);

        if (
          !(element instanceof HTMLFormElement) ||
          !formHasAttribute(element, 'toolname') ||
          !formHasAttribute(element, 'tooldescription') ||
          !isConnected(element)
        ) {
          continue;
        }
        const form = element;
        candidates.add(form);
        const definition = toolDefinition(form);
        const fingerprint = JSON.stringify(definition);
        const blockedFingerprint = blockedDefinitions.get(form);
        if (blockedFingerprint === fingerprint) continue;
        blockedDefinitions.delete(form);
        const existingForm = selectedByName.get(definition.name);
        if (existingForm) {
          // A duplicate name stays blocked until its definition changes, then takes over.
          if (blockedFingerprint === undefined) {
            blockedDefinitions.set(form, fingerprint);
            continue;
          }
          const existingSelection = selected.get(existingForm);
          if (existingSelection)
            blockedDefinitions.set(existingForm, existingSelection.fingerprint);
          selected.delete(existingForm);
        }
        selectedByName.set(definition.name, form);
        selected.set(form, { definition, fingerprint });
      }
    }
    for (const form of blockedDefinitions.keys()) {
      if (!candidates.has(form)) blockedDefinitions.delete(form);
    }

    for (const [form, registration] of registrations) {
      const fingerprint = selected.get(form)?.fingerprint;
      if (fingerprint !== registration.fingerprint) {
        registration.cancelPending?.(executionError());
        registration.controller.abort();
        registrations.delete(form);
      }
    }

    for (const [form, { definition, fingerprint }] of selected) {
      if (registrations.has(form)) continue;
      const controller = new AbortController();
      const registration: DeclarativeRegistration = {
        controller,
        fingerprint,
        form,
      };
      registrations.set(form, registration);
      void context
        .registerTool(
          {
            name: definition.name,
            title: definition.title,
            description: definition.description,
            inputSchema: definition.inputSchema,
            execute(input: WebMcpToolInput, options: WebMCP.ToolExecuteCallbackOptions) {
              const submitter = findSubmitter(form);
              if (!definition.autosubmit && !submitter) throw executionError();
              fillForm(form, input);
              return waitForSubmission(
                context,
                registration,
                definition,
                submitter,
                options.signal
              );
            },
          },
          { signal: controller.signal }
        )
        .catch((cause: ErrorOptions['cause']) => {
          controller.abort();
          // Invalid toolname/tooldescription attributes reject here. Without this the
          // form silently never becomes a tool, with no diagnostic in any channel.
          // Aborts are ordinary teardown, not a failure worth reporting.
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          console.error(
            `[webmcp] declarative form tool "${definition.name}" was not registered:`,
            cause
          );
        });
    }
  }

  const attachShadowDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'attachShadow');
  if (attachShadowDescriptor?.configurable) {
    const nativeAttachShadow = Element.prototype.attachShadow;
    const attachShadow = function (this: Element, init: ShadowRootInit): ShadowRoot {
      const root = nativeAttachShadow.call(this, init);
      if (
        root.mode === 'open' &&
        Object.getOwnPropertyDescriptor(Node.prototype, 'ownerDocument')?.get?.call(this) ===
          document &&
        isConnected(this)
      ) {
        observeRoot(root);
      }
      return root;
    };
    Object.defineProperty(Element.prototype, 'attachShadow', {
      ...attachShadowDescriptor,
      value: attachShadow,
    });
  }

  const submitDescriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'submit');
  if (submitDescriptor?.configurable) {
    const nativeSubmit = HTMLFormElement.prototype.submit;
    const submit = function (this: HTMLFormElement): void {
      nativeSubmit.call(this);
      activeSubmissions.get(this)?.direct();
    };
    Object.defineProperty(HTMLFormElement.prototype, 'submit', {
      ...submitDescriptor,
      value: submit,
    });
  }

  // ponytail: a whole-tree rescan keeps DOM ownership obvious; index forms if this
  // becomes measurable on pages with thousands of annotated controls.
  sync();
}
