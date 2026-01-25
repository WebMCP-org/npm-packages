/**
 * DOM helper utilities for WebMCP userscripts.
 * Uses MutationObserver for efficient element waiting instead of polling.
 */

/**
 * Wait for an element matching the selector to appear in the DOM.
 * Uses MutationObserver for efficient detection (fires on microtask queue).
 *
 * @param selector - CSS selector to match
 * @param timeout - Maximum time to wait in milliseconds (default: 5000)
 * @returns The matched element
 * @throws Error if element not found within timeout
 *
 * @example
 * const button = await waitForElement('.submit-btn');
 * button.click();
 */
export function waitForElement(selector: string, timeout = 5000): Promise<Element> {
  return new Promise((resolve, reject) => {
    // Check if element already exists
    const existing = document.querySelector(selector);
    if (existing) {
      return resolve(existing);
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);
  });
}

/**
 * Wait for an element to be removed from the DOM.
 * Useful for waiting for loading spinners, modals, etc. to disappear.
 *
 * @param selector - CSS selector to match
 * @param timeout - Maximum time to wait in milliseconds (default: 5000)
 * @throws Error if element still exists after timeout
 *
 * @example
 * await waitForElementRemoved('.loading-spinner');
 * // Element is now gone, safe to proceed
 */
export function waitForElementRemoved(selector: string, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if element already gone
    if (!document.querySelector(selector)) {
      return resolve();
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element removal: ${selector}`));
    }, timeout);
  });
}

/**
 * Click an element matching the selector.
 * Waits for the element to appear if not immediately available.
 *
 * @param selector - CSS selector to match
 * @param timeout - Maximum time to wait for element (default: 5000)
 *
 * @example
 * await clickElement('#submit-button');
 */
export async function clickElement(selector: string, timeout = 5000): Promise<void> {
  const el = await waitForElement(selector, timeout);
  if (el instanceof HTMLElement) {
    el.click();
  } else {
    // For non-HTMLElement (like SVGElement), dispatch a click event
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
}

/**
 * Type text into an input or textarea element.
 * Dispatches input and change events to trigger React/Vue/Angular state updates.
 *
 * @param selector - CSS selector for input/textarea element
 * @param text - Text to type
 * @param options - Options object
 * @param options.clear - Whether to clear existing value first (default: true)
 * @param options.timeout - Maximum time to wait for element (default: 5000)
 *
 * @example
 * await typeText('#search-input', 'hello world');
 * await typeText('#email', 'test@example.com', { clear: true });
 */
export async function typeText(
  selector: string,
  text: string,
  options: { clear?: boolean; timeout?: number } = {}
): Promise<void> {
  const { clear = true, timeout = 5000 } = options;
  const el = await waitForElement(selector, timeout);

  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
    throw new Error(`Element is not an input or textarea: ${selector}`);
  }

  if (clear) {
    el.value = '';
  }

  el.value = text;

  // Dispatch events to trigger framework state updates
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Select an option from a <select> element by value.
 *
 * @param selector - CSS selector for select element
 * @param value - Option value to select
 * @param timeout - Maximum time to wait for element (default: 5000)
 *
 * @example
 * await selectOption('#country', 'US');
 */
export async function selectOption(selector: string, value: string, timeout = 5000): Promise<void> {
  const el = await waitForElement(selector, timeout);

  if (!(el instanceof HTMLSelectElement)) {
    throw new Error(`Element is not a select: ${selector}`);
  }

  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Get text content from an element (trimmed).
 *
 * @param selectorOrElement - CSS selector string or Element
 * @returns Text content or null if element not found
 *
 * @example
 * const title = getText('.page-title');
 * const text = getText(someElement);
 */
export function getText(selectorOrElement: string | Element): string | null {
  const el =
    typeof selectorOrElement === 'string'
      ? document.querySelector(selectorOrElement)
      : selectorOrElement;

  return el?.textContent?.trim() ?? null;
}

/**
 * Get all elements matching a selector.
 *
 * @param selector - CSS selector
 * @returns Array of matching elements
 *
 * @example
 * const items = getAllElements('.list-item');
 */
export function getAllElements(selector: string): Element[] {
  return Array.from(document.querySelectorAll(selector));
}

/**
 * Check if an element is visible (has non-zero dimensions and not hidden).
 *
 * @param selectorOrElement - CSS selector string or Element
 * @returns true if element exists and is visible
 *
 * @example
 * if (isVisible('.modal')) {
 *   // Modal is showing
 * }
 */
export function isVisible(selectorOrElement: string | Element): boolean {
  const el =
    typeof selectorOrElement === 'string'
      ? document.querySelector(selectorOrElement)
      : selectorOrElement;

  if (!el) return false;

  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

/**
 * Scroll an element into view.
 *
 * @param selector - CSS selector
 * @param options - ScrollIntoView options
 * @param timeout - Maximum time to wait for element (default: 5000)
 *
 * @example
 * await scrollIntoView('#footer');
 * await scrollIntoView('.item', { behavior: 'smooth', block: 'center' });
 */
export async function scrollIntoView(
  selector: string,
  options: ScrollIntoViewOptions = { behavior: 'smooth', block: 'center' },
  timeout = 5000
): Promise<void> {
  const el = await waitForElement(selector, timeout);
  el.scrollIntoView(options);
}

/**
 * Get the value of a form field (input, select, or textarea).
 *
 * @param selector - CSS selector for the form field
 * @returns The field value or null if element not found
 *
 * @example
 * const email = getFieldValue('#email');
 */
export function getFieldValue(selector: string): string | null {
  const el = document.querySelector(selector);

  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return el.value;
  }

  return null;
}

/**
 * Check if a checkbox or radio button is checked.
 *
 * @param selector - CSS selector for the checkbox/radio
 * @returns true if checked, false if not checked or element not found
 *
 * @example
 * if (isChecked('#agree-terms')) {
 *   // User agreed to terms
 * }
 */
export function isChecked(selector: string): boolean {
  const el = document.querySelector(selector);
  return el instanceof HTMLInputElement && el.checked;
}

/**
 * Set the checked state of a checkbox or radio button.
 *
 * @param selector - CSS selector for the checkbox/radio
 * @param checked - Whether to check or uncheck
 * @param timeout - Maximum time to wait for element (default: 5000)
 *
 * @example
 * await setChecked('#agree-terms', true);
 */
export async function setChecked(
  selector: string,
  checked: boolean,
  timeout = 5000
): Promise<void> {
  const el = await waitForElement(selector, timeout);

  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Element is not an input: ${selector}`);
  }

  if (el.type !== 'checkbox' && el.type !== 'radio') {
    throw new Error(`Element is not a checkbox or radio: ${selector}`);
  }

  el.checked = checked;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
