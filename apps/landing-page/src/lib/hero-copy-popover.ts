const OPEN_DELAY_MS = 90;
const CLOSE_DELAY_MS = 160;
const VIEWPORT_GAP_PX = 8;
const BOUND_ATTR = 'data-hero-copy-popovers';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function isPopoverOpen(popover: HTMLElement) {
  return popover.matches(':popover-open, .\\:popover-open');
}

function showPopover(popover: HTMLElement) {
  if (typeof popover.showPopover !== 'function' || isPopoverOpen(popover)) return;
  popover.showPopover();
}

function hidePopover(popover: HTMLElement) {
  if (typeof popover.hidePopover !== 'function' || !isPopoverOpen(popover)) return;
  popover.hidePopover();
}

function placePopover(trigger: HTMLElement, popover: HTMLElement) {
  popover.style.inset = 'auto';
  popover.style.translate = 'none';

  const triggerRect = trigger.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const maxLeft = window.innerWidth - popoverRect.width - VIEWPORT_GAP_PX;
  let top = triggerRect.top - popoverRect.height - VIEWPORT_GAP_PX;
  let side: 'top' | 'bottom' = 'top';

  if (top < VIEWPORT_GAP_PX) {
    top = triggerRect.bottom + VIEWPORT_GAP_PX;
    side = 'bottom';
  }

  const left = Math.min(
    Math.max(VIEWPORT_GAP_PX, triggerRect.left + triggerRect.width / 2 - popoverRect.width / 2),
    Math.max(VIEWPORT_GAP_PX, maxLeft)
  );

  popover.dataset.side = side;
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

function pairFromEvent(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const trigger = target.closest<HTMLElement>('.hero-copy-link');
  if (trigger?.id) {
    const popover = document.getElementById(trigger.id.replace(/-trigger$/, ''));
    if (popover instanceof HTMLElement) return { trigger, popover };
  }
  const popover = target.closest<HTMLElement>('.hero-link-popover');
  if (!popover?.id) return null;
  const triggerEl = document.getElementById(`${popover.id}-trigger`);
  if (!(triggerEl instanceof HTMLElement)) return null;
  return { trigger: triggerEl, popover };
}

export function initHeroCopyPopovers() {
  if (document.documentElement.hasAttribute(BOUND_ATTR)) return;
  if (
    typeof HTMLElement === 'undefined' ||
    typeof HTMLElement.prototype.showPopover !== 'function'
  ) {
    return;
  }
  document.documentElement.setAttribute(BOUND_ATTR, 'true');

  let openTimer: number | undefined;
  let closeTimer: number | undefined;
  let active: { trigger: HTMLElement; popover: HTMLElement } | null = null;

  const clearTimers = () => {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
    openTimer = undefined;
    closeTimer = undefined;
  };

  const closeActive = () => {
    clearTimers();
    if (!active) return;
    hidePopover(active.popover);
    active.trigger.removeAttribute('data-popover-open');
    active = null;
  };

  const open = (trigger: HTMLElement, popover: HTMLElement) => {
    if (active?.popover === popover) return;
    closeActive();
    showPopover(popover);
    trigger.setAttribute('data-popover-open', '');
    active = { trigger, popover };
    placePopover(trigger, popover);
  };

  const scheduleOpen = (trigger: HTMLElement, popover: HTMLElement) => {
    window.clearTimeout(closeTimer);
    closeTimer = undefined;
    if (active?.popover === popover) return;
    window.clearTimeout(openTimer);
    openTimer = window.setTimeout(
      () => open(trigger, popover),
      prefersReducedMotion() ? 0 : OPEN_DELAY_MS
    );
  };

  const scheduleClose = (popover: HTMLElement) => {
    window.clearTimeout(openTimer);
    openTimer = undefined;
    if (active?.popover !== popover) return;
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(closeActive, prefersReducedMotion() ? 0 : CLOSE_DELAY_MS);
  };

  const belongsToPair = (
    node: EventTarget | null,
    pair: { trigger: HTMLElement; popover: HTMLElement }
  ) => node instanceof Node && (pair.trigger.contains(node) || pair.popover.contains(node));

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const pair = pairFromEvent(event.target);
    if (!pair || belongsToPair(event.relatedTarget, pair)) return;
    scheduleOpen(pair.trigger, pair.popover);
  });

  document.addEventListener('pointerout', (event) => {
    if (event.pointerType === 'touch') return;
    const pair = pairFromEvent(event.target);
    if (!pair || belongsToPair(event.relatedTarget, pair)) return;
    scheduleClose(pair.popover);
  });

  document.addEventListener(
    'focusin',
    (event) => {
      const pair = pairFromEvent(event.target);
      if (!pair) return;
      scheduleOpen(pair.trigger, pair.popover);
    },
    true
  );

  document.addEventListener(
    'focusout',
    (event) => {
      const pair = pairFromEvent(event.target);
      if (!pair) return;
      const next = event.relatedTarget;
      if (next instanceof Node && (pair.trigger.contains(next) || pair.popover.contains(next))) {
        return;
      }
      scheduleClose(pair.popover);
    },
    true
  );

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !active) return;
    event.preventDefault();
    closeActive();
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('.hero-link-popover__link')) return;
    window.setTimeout(closeActive, 0);
  });

  const reposition = () => {
    if (!active) return;
    placePopover(active.trigger, active.popover);
  };
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
}
