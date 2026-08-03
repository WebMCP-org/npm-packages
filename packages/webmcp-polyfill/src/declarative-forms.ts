import type { InputSchema, ModelContext, WebMcpToolInput } from '@mcp-b/webmcp-types';

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
  cancelPending?: (reason: unknown) => void;
}

interface ActiveSubmission {
  complete(event: SubmitEvent): void;
  direct(): void;
  respond(event: SubmitEvent): void;
}

const agentInvokedEvents = new WeakSet<SubmitEvent>();
const agentResponses = new WeakMap<SubmitEvent, Promise<unknown>>();
const activeSubmissions = new WeakMap<HTMLFormElement, ActiveSubmission>();

export function isAgentInvokedSubmitEvent(event: SubmitEvent): boolean {
  return (
    event.isTrusted &&
    (agentInvokedEvents.has(event) ||
      (event.eventPhase !== Event.NONE &&
        event.target instanceof HTMLFormElement &&
        activeSubmissions.has(event.target)))
  );
}

export function respondWithAgentSubmitEvent(
  event: SubmitEvent,
  agentResponse: Promise<unknown>
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
  return Reflect.get(HTMLFormElement.prototype, 'elements', form);
}

function getFormAttribute(form: HTMLFormElement, name: string): string | null {
  return Reflect.apply(Element.prototype.getAttribute, form, [name]);
}

function formHasAttribute(form: HTMLFormElement, name: string): boolean {
  return Reflect.apply(Element.prototype.hasAttribute, form, [name]);
}

function isFormConnected(form: HTMLFormElement): boolean {
  return Reflect.get(Node.prototype, 'isConnected', form);
}

function getOpenShadowRoot(element: Element): ShadowRoot | null {
  return Reflect.get(Element.prototype, 'shadowRoot', element);
}

function checkFormValidity(form: HTMLFormElement): boolean {
  return Reflect.apply(HTMLFormElement.prototype.checkValidity, form, []);
}

function requestFormSubmit(form: HTMLFormElement, submitter?: Submitter): void {
  Reflect.apply(HTMLFormElement.prototype.requestSubmit, form, submitter ? [submitter] : []);
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
  schema: Record<string, unknown>,
  form: HTMLFormElement,
  controls: readonly DeclarativeControl[],
  extra?: string
): Record<string, unknown> {
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

function isStepBaseMultiple(stepBase: number, step: number): boolean {
  const quotient = stepBase / step;
  return Math.abs(quotient - Math.round(quotient)) < Number.EPSILON * 16;
}

function validPattern(input: HTMLInputElement): string | undefined {
  const pattern = input.getAttribute('pattern');
  if (pattern === null) return undefined;
  try {
    new RegExp(pattern, 'v');
    return pattern;
  } catch {
    return undefined;
  }
}

function numberSchema(input: HTMLInputElement, includePattern = true): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: 'number' };
  const minimum = validNumberAttribute(input, 'min');
  const maximum = validNumberAttribute(input, 'max');
  if (minimum !== undefined) schema.minimum = minimum;
  if (maximum !== undefined) schema.maximum = maximum;

  const rawStep = input.getAttribute('step');
  if (rawStep !== 'any') {
    const parsedStep = rawStep === null || rawStep === '' ? 1 : Number(rawStep);
    const step = Number.isFinite(parsedStep) && parsedStep > 0 ? parsedStep : 1;
    const rawValue = Number(input.getAttribute('value'));
    const stepBase = minimum ?? (Number.isFinite(rawValue) ? rawValue : 0);
    if (isStepBaseMultiple(stepBase, step)) schema.multipleOf = step;
  }

  const pattern = includePattern ? validPattern(input) : undefined;
  if (pattern !== undefined) schema.pattern = pattern;
  return schema;
}

function temporalFormat(input: HTMLInputElement, datePrefix: string): string {
  const rawStep = input.getAttribute('step');
  const parsedStep = rawStep === null || rawStep === '' ? 60 : Number(rawStep);
  const step = Number.isFinite(parsedStep) && parsedStep > 0 ? parsedStep : 60;
  if (step < 1) return `${datePrefix}(:[0-5][0-9](\\.[0-9]{1,3})?)?$`;
  if (step < 60) return `${datePrefix}(:[0-5][0-9])?$`;
  return `${datePrefix}$`;
}

function optionSchemas(options: readonly HTMLOptionElement[]): {
  anyOf: Record<string, unknown>[];
  enum: string[];
} {
  return {
    anyOf: options.map((option) => ({
      type: 'string',
      const: option.value,
      title: option.textContent ?? '',
    })),
    enum: options.map((option) => option.value),
  };
}

function groupChoiceSchemas(controls: readonly HTMLInputElement[]): {
  anyOf: Record<string, unknown>[];
  enum: string[];
} {
  return {
    anyOf: controls.map((control) => {
      const title = labelText(control);
      return { type: 'string', const: control.value, ...(title ? { title } : {}) };
    }),
    enum: controls.map((control) => control.value),
  };
}

function parameterSchema(
  form: HTMLFormElement,
  controls: readonly DeclarativeControl[]
): Record<string, unknown> | undefined {
  const first = controls[0];
  if (!first) return undefined;

  if (controls.length > 1) {
    if (!controls.every((control) => control instanceof HTMLInputElement)) return undefined;
    const inputs = controls;
    if (inputs.every((input) => input.type === 'checkbox')) {
      return withDescription(
        {
          type: 'array',
          items: { type: 'string', ...groupChoiceSchemas(inputs) },
          uniqueItems: true,
        },
        form,
        controls
      );
    }
    if (inputs.every((input) => input.type === 'radio')) {
      return withDescription({ type: 'string', ...groupChoiceSchemas(inputs) }, form, controls);
    }
    return undefined;
  }

  if (first instanceof HTMLTextAreaElement) {
    return withDescription({ type: 'string' }, form, controls);
  }

  if (first instanceof HTMLSelectElement) {
    const choices = optionSchemas([...first.options]);
    return withDescription(
      first.multiple
        ? { type: 'array', items: { type: 'string', ...choices }, uniqueItems: true }
        : { type: 'string', ...choices },
      form,
      controls
    );
  }

  if (TEXT_INPUT_TYPES.has(first.type)) {
    const schema: Record<string, unknown> = { type: 'string' };
    const pattern = validPattern(first);
    if (pattern !== undefined) schema.pattern = pattern;
    return withDescription(schema, form, controls);
  }
  if (first.type === 'hidden') {
    return first.getAttribute('toolparamdescription')
      ? withDescription({ type: 'string' }, form, controls)
      : undefined;
  }
  if (first.type === 'number') {
    return withDescription(numberSchema(first), form, controls);
  }
  if (first.type === 'range') {
    const schema = numberSchema(first, false);
    schema.minimum ??= 0;
    schema.maximum ??= 100;
    return withDescription(schema, form, controls);
  }
  if (first.type === 'checkbox') {
    return withDescription({ type: 'boolean' }, form, controls);
  }
  if (first.type === 'radio') {
    return withDescription({ type: 'string', ...groupChoiceSchemas([first]) }, form, controls);
  }
  if (first.type === 'date') {
    return withDescription(
      { type: 'string', format: 'date' },
      form,
      controls,
      "Dates MUST be provided in 'YYYY-MM-DD' format."
    );
  }
  if (first.type === 'month') {
    return withDescription(
      { type: 'string', format: '^[0-9]{4}-(0[1-9]|1[0-2])$' },
      form,
      controls
    );
  }
  if (first.type === 'week') {
    return withDescription(
      { type: 'string', format: '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$' },
      form,
      controls
    );
  }
  if (first.type === 'time') {
    return withDescription(
      {
        type: 'string',
        format: temporalFormat(first, '^([01][0-9]|2[0-3]):[0-5][0-9]'),
      },
      form,
      controls
    );
  }
  if (first.type === 'datetime-local') {
    return withDescription(
      {
        type: 'string',
        format: temporalFormat(
          first,
          '^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]'
        ),
      },
      form,
      controls
    );
  }
  if (first.type === 'color') {
    return withDescription({ type: 'string', format: '^#[0-9a-zA-Z]{6}$' }, form, controls);
  }
  return undefined;
}

function synthesizeSchema(form: HTMLFormElement): InputSchema {
  const properties: Record<string, unknown> = {};
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

function validatesParameter(
  form: HTMLFormElement,
  controls: readonly DeclarativeControl[],
  value: unknown
): boolean {
  const first = controls[0];
  if (!first || !parameterSchema(form, controls)) return false;

  if (controls.length > 1) {
    if (!controls.every((control) => control instanceof HTMLInputElement)) return false;
    if (controls.every((control) => control.type === 'checkbox')) {
      return hasUniqueAllowedValues(value, new Set(controls.map((control) => control.value)));
    }
    if (controls.every((control) => control.type === 'radio')) {
      const string = toFormString(value);
      return string !== undefined && controls.some((control) => control.value === string);
    }
    return false;
  }

  if (first instanceof HTMLSelectElement) {
    const allowed = new Set([...first.options].map((option) => option.value));
    if (first.multiple) return hasUniqueAllowedValues(value, allowed);
    const string = toFormString(value);
    return string !== undefined && allowed.has(string);
  }
  if (first instanceof HTMLTextAreaElement) return toFormString(value) !== undefined;
  if (first.type === 'checkbox') return toFormBoolean(value) !== undefined;
  if (first.type === 'radio') {
    const string = toFormString(value);
    return string !== undefined && first.value === string;
  }
  const string = toFormString(value);
  return string !== undefined && inputAcceptsValue(first, string);
}

function dispatchInputAndChange(control: DeclarativeControl): void {
  control.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNativeValue(control: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype =
    control instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, value);
}

function setNativeChecked(control: HTMLInputElement, checked: boolean): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set?.call(
    control,
    checked
  );
}

function fillParameter(controls: readonly DeclarativeControl[], value: unknown): void {
  const first = controls[0];
  if (!first) return;

  if (controls.length > 1 && controls.every((control) => control instanceof HTMLInputElement)) {
    if (controls.every((control) => control.type === 'checkbox') && Array.isArray(value)) {
      const checked = new Set(value.map(toFormString));
      for (const control of controls) {
        const next = checked.has(control.value);
        if (control.checked === next) continue;
        setNativeChecked(control, next);
        dispatchInputAndChange(control);
      }
      return;
    }
    const selected = toFormString(value);
    const control = controls.find((candidate) => candidate.value === selected);
    if (control && !control.checked) {
      setNativeChecked(control, true);
      dispatchInputAndChange(control);
    }
    return;
  }

  if (first instanceof HTMLSelectElement) {
    if (first.multiple && Array.isArray(value)) {
      const selected = new Set(value.map(toFormString));
      let changed = false;
      for (const option of first.options) {
        const next = selected.has(option.value);
        if (option.selected === next) continue;
        option.selected = next;
        changed = true;
      }
      if (changed) dispatchInputAndChange(first);
      return;
    }
    const next = toFormString(value);
    if (next !== undefined && first.value !== next) {
      first.value = next;
      dispatchInputAndChange(first);
    }
    return;
  }

  if (first instanceof HTMLInputElement && first.type === 'checkbox') {
    const next = toFormBoolean(value);
    if (next !== undefined && first.checked !== next) {
      setNativeChecked(first, next);
      dispatchInputAndChange(first);
    }
    return;
  }

  if (first instanceof HTMLInputElement && first.type === 'radio') {
    const next = toFormString(value);
    if (next === first.value && !first.checked) {
      setNativeChecked(first, true);
      dispatchInputAndChange(first);
    }
    return;
  }

  const next = toFormString(value);
  if (next !== undefined && first.value !== next) {
    setNativeValue(first, next);
    dispatchInputAndChange(first);
  }
}

function fillForm(form: HTMLFormElement, input: WebMcpToolInput): void {
  if (Array.isArray(input)) throw new TypeError('Declarative tool input must be an object');
  const groups = controlGroups(form);
  for (const [name, value] of Object.entries(input)) {
    const controls = groups.get(name);
    if (!controls || !validatesParameter(form, controls, value)) {
      throw new TypeError(`Invalid value for declarative form parameter "${name}"`);
    }
  }
  for (const [name, value] of Object.entries(input)) fillParameter(groups.get(name) ?? [], value);
}

function findSubmitter(form: HTMLFormElement): Submitter | undefined {
  return [...getFormControls(form)].find(
    (element): element is Submitter =>
      !element.matches(':disabled') &&
      ((element instanceof HTMLButtonElement && element.type === 'submit') ||
        (element instanceof HTMLInputElement && ['image', 'submit'].includes(element.type)))
  );
}

function validationError(form: HTMLFormElement): DOMException {
  const failures = [...getFormControls(form)]
    .filter(
      (element): element is DeclarativeControl =>
        isControl(element) && element.willValidate && !element.validity.valid
    )
    .map((control) => `${control.name.trim() || '{unknown}'}: ${control.validationMessage}`)
    .join('. ');
  return new DOMException(`Form validation failed: ${failures}`, 'UnknownError');
}

function agentEvent(type: string, toolName: string): Event {
  const event = new Event(type);
  Object.defineProperty(event, 'toolName', { enumerable: true, value: toolName });
  return event;
}

function waitForSubmission(
  registration: DeclarativeRegistration,
  toolName: string,
  autosubmit: boolean,
  submitter: Submitter | undefined
): Promise<unknown> {
  const { form } = registration;
  registration.cancelPending?.(new DOMException('Tool execution cancelled', 'UnknownError'));

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      Reflect.apply(EventTarget.prototype.removeEventListener, form, ['invalid', onInvalid, true]);
      activeSubmissions.delete(form);
      if (registration.cancelPending === cancel) delete registration.cancelPending;
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const cancel = (reason: unknown) => finish(() => reject(reason));
    const settleResponse = (response: Promise<unknown>) => {
      response.then(
        (value) => finish(() => resolve(value)),
        (error: unknown) => finish(() => reject(error))
      );
    };
    const onInvalid = (event: Event) => {
      if (!event.isTrusted) return;
      queueMicrotask(() => {
        if (!checkFormValidity(form)) cancel(validationError(form));
      });
    };

    activeSubmissions.set(form, {
      complete(event) {
        queueMicrotask(() => {
          const response = agentResponses.get(event);
          if (response) settleResponse(response);
          else if (event.defaultPrevented) {
            cancel(new DOMException('preventDefault() requires respondWith()', 'UnknownError'));
          } else finish(() => resolve(undefined));
        });
      },
      direct() {
        finish(() => resolve(undefined));
      },
      respond(event) {
        queueMicrotask(() => {
          const response = agentResponses.get(event);
          if (response) settleResponse(response);
        });
      },
    });
    registration.cancelPending = cancel;
    Reflect.apply(EventTarget.prototype.addEventListener, form, ['invalid', onInvalid, true]);

    if (!autosubmit) {
      submitter?.focus();
      window.dispatchEvent(agentEvent('toolactivated', toolName));
      return;
    }
    try {
      requestFormSubmit(form, submitter);
      window.dispatchEvent(agentEvent('toolactivated', toolName));
    } catch (error) {
      cancel(error);
    }
  });
}

/** Installs the DOM-backed half of the draft Declarative WebMCP API. */
export function installDeclarativeForms(document: Document, context: ModelContext): () => void {
  let active = true;
  const registrations = new Map<HTMLFormElement, DeclarativeRegistration>();
  const blockedDefinitions = new Map<HTMLFormElement, string>();
  const observers = new Map<Document | ShadowRoot, MutationObserver>();
  const onSubmit = (event: Event) => {
    if (
      !(event instanceof SubmitEvent) ||
      !event.isTrusted ||
      !(event.target instanceof HTMLFormElement) ||
      agentInvokedEvents.has(event)
    ) {
      return;
    }
    agentInvokedEvents.add(event);
    activeSubmissions.get(event.target)?.complete(event);
  };

  document.defaultView?.addEventListener('submit', onSubmit, true);
  const onReset = (event: Event) => {
    if (!event.isTrusted || !(event.target instanceof HTMLFormElement)) return;
    const form = event.target;
    queueMicrotask(() => {
      if (event.defaultPrevented) return;
      registrations
        .get(form)
        ?.cancelPending?.(
          new DOMException('Tool execution cancelled by form reset', 'UnknownError')
        );
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
    root.addEventListener('submit', onSubmit, true);
  }

  function sync(): void {
    observeRoot(document);
    for (const root of observers.keys()) {
      if (root instanceof ShadowRoot && !Reflect.get(Node.prototype, 'isConnected', root.host)) {
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
          !isFormConnected(element)
        ) {
          continue;
        }
        const form = element;
        candidates.add(form);
        const definition = toolDefinition(form);
        const fingerprint = JSON.stringify(definition);
        const blockedFingerprint = blockedDefinitions.get(form);
        if (blockedFingerprint === fingerprint) continue;
        const retryingChangedDefinition = blockedFingerprint !== undefined;
        blockedDefinitions.delete(form);
        const existingForm = selectedByName.get(definition.name);
        if (existingForm && !retryingChangedDefinition) {
          blockedDefinitions.set(form, fingerprint);
          continue;
        }
        if (existingForm) {
          const existingSelection = selected.get(existingForm);
          if (existingSelection) {
            blockedDefinitions.set(existingForm, existingSelection.fingerprint);
            selected.delete(existingForm);
          }
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
        registration.cancelPending?.(
          new DOMException('Tool execution cancelled because its form changed', 'UnknownError')
        );
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
            execute(input: WebMcpToolInput) {
              const submitter = findSubmitter(form);
              if (!definition.autosubmit && !submitter) {
                throw new DOMException(
                  'A declarative form without toolautosubmit requires a submit button',
                  'UnknownError'
                );
              }
              fillForm(form, input);
              return waitForSubmission(
                registration,
                definition.name,
                definition.autosubmit,
                submitter
              );
            },
          },
          { signal: controller.signal }
        )
        .catch(() => {
          controller.abort();
        });
    }
  }

  let restoreAttachShadow = () => {};
  const elementPrototype = document.defaultView?.Element.prototype;
  const attachShadowDescriptor = elementPrototype
    ? Object.getOwnPropertyDescriptor(elementPrototype, 'attachShadow')
    : undefined;
  if (elementPrototype && attachShadowDescriptor?.configurable) {
    const nativeAttachShadow = elementPrototype.attachShadow;
    const attachShadow = function (this: Element, init: ShadowRootInit): ShadowRoot {
      const root = nativeAttachShadow.call(this, init);
      if (
        active &&
        root.mode === 'open' &&
        Reflect.get(Node.prototype, 'ownerDocument', this) === document &&
        Reflect.get(Node.prototype, 'isConnected', this)
      ) {
        observeRoot(root);
      }
      return root;
    };
    Object.defineProperty(elementPrototype, 'attachShadow', {
      ...attachShadowDescriptor,
      value: attachShadow,
    });
    restoreAttachShadow = () => {
      if (elementPrototype.attachShadow === attachShadow) {
        Object.defineProperty(elementPrototype, 'attachShadow', attachShadowDescriptor);
      }
    };
  }

  let restoreFormSubmit = () => {};
  const formPrototype = document.defaultView?.HTMLFormElement.prototype;
  const submitDescriptor = formPrototype
    ? Object.getOwnPropertyDescriptor(formPrototype, 'submit')
    : undefined;
  if (formPrototype && submitDescriptor?.configurable) {
    const nativeSubmit = formPrototype.submit;
    const submit = function (this: HTMLFormElement): void {
      nativeSubmit.call(this);
      if (active) activeSubmissions.get(this)?.direct();
    };
    Object.defineProperty(formPrototype, 'submit', { ...submitDescriptor, value: submit });
    restoreFormSubmit = () => {
      if (formPrototype.submit === submit) {
        Object.defineProperty(formPrototype, 'submit', submitDescriptor);
      }
    };
  }

  // ponytail: a whole-tree rescan keeps DOM ownership obvious; index forms if this
  // becomes measurable on pages with thousands of annotated controls.
  sync();

  return () => {
    active = false;
    restoreFormSubmit();
    restoreAttachShadow();
    document.defaultView?.removeEventListener('submit', onSubmit, true);
    for (const root of observers.keys()) stopObservingRoot(root);
    blockedDefinitions.clear();
    for (const registration of registrations.values()) {
      registration.cancelPending?.(new DOMException('Tool execution cancelled', 'UnknownError'));
      registration.controller.abort();
    }
    registrations.clear();
  };
}
