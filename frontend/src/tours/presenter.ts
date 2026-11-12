import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tours.css';
import { translate } from '../i18n';
import type { TourStep } from './registry';

/** Own the interaction boundary as well as Driver's visual overlay. */
export class TourPresenter {
  private driver: Driver | null = null;
  private popover: HTMLElement | null = null;
  private interactive = false;
  private interactionRoot: HTMLElement | null = null;
  private allowed: HTMLElement | null = null;
  private skip: (() => void) | null = null;
  private nextEnabled = true;
  private advance: (() => void) | null = null;
  private layoutFrame: number | undefined;
  private returnFocus = document.activeElement as HTMLElement | null;

  show(step: TourStep, target: HTMLElement | undefined, nextOption: HTMLElement | null,
    last: boolean, advance: () => void, skip: () => void): void {
    this.hide();
    this.interactive = Boolean(step.interactive);
    this.interactionRoot = this.interactive
      ? target?.closest<HTMLElement>('form, [role="dialog"], aside, [data-agenda-item]') ?? target ?? null : null;
    document.body.classList.toggle('tour-interactive', this.interactive);
    this.interactionRoot?.classList.add('tour-interaction-root');
    this.allowed = nextOption;
    this.nextEnabled = !step.requiresInput;
    this.advance = step.mode === 'action' ? null : () => {
      if (this.nextEnabled) advance();
    };
    this.skip = step.skippable ? skip : null;
    nextOption?.classList.add('tour-allowed-option');
    let previousLayout = '';
    let highlightReady = false;
    this.driver = driver({
      animate: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      smoothScroll: false,
      allowKeyboardControl: false,
      allowClose: false,
      disableActiveInteraction: false,
      popoverClass: 'elderflow-tour',
      overlayOpacity: 0.65,
      stagePadding: step.target?.startsWith('topic-type-') ? 0 : step.target?.startsWith('nav-') ? 2 : 10,
      // Grouped buttons square their shared edges; each tour highlight stands alone.
      stageRadius: step.target?.startsWith('topic-type-') ? 6 : 5,
      onDestroyed: () => { this.popover = null; },
      // Driver ignores refreshes until its own highlight animation has finished.
      // Force another measurement on the following frame, even if layout is stable.
      onHighlighted: () => { highlightReady = true; previousLayout = ''; },
    });
    this.driver.highlight({
      element: target,
      popover: {
        title: step.titleKey ? this.escape(translate(step.titleKey)) : undefined,
        description: this.escape(translate(step.descriptionKey)),
        side: step.side,
        showButtons: step.mode === 'action' ? [] : ['next'],
        nextBtnText: translate(last ? 'tours.finish' : step.id === 'welcome' ? 'tours.start' : 'tours.next'),
        onNextClick: () => this.advance?.(),
        onPopoverRender: (popover) => {
          this.popover = popover.wrapper;
          if (step.mode === 'action') {
            popover.nextButton.disabled = true;
            popover.nextButton.remove();
            popover.footer.style.display = 'flex';
          }
          // Keep layout measurable without displaying an incorrectly anchored box.
          popover.wrapper.style.visibility = 'hidden';
          popover.wrapper.setAttribute('role', 'dialog');
          popover.wrapper.setAttribute('aria-modal', this.interactive ? 'false' : 'true');
          popover.wrapper.setAttribute('aria-label', translate('tours.help'));
          if (!step.titleKey) popover.wrapper.removeAttribute('aria-labelledby');
          popover.closeButton.setAttribute('aria-label', translate('tours.skip'));
          // Steps use application state transitions, without a backward-navigation handler.
          popover.previousButton.disabled = true;
          popover.previousButton.remove();
          popover.description.setAttribute('aria-live', 'polite');
          if (step.skippable) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'driver-popover-footer-btn tour-skip';
            button.textContent = translate('tours.skip');
            button.onclick = skip;
            popover.footerButtons.prepend(button);
          }
        },
      },
    });
    this.setNextEnabled(this.nextEnabled);
    // Dialog recentering, transitions and wrapped text can move targets without a resize.
    const trackLayout = () => {
      const rect = target?.getBoundingClientRect();
      const popover = this.popover?.getBoundingClientRect();
      const layout = [rect?.x, rect?.y, rect?.width, rect?.height, popover?.width, popover?.height].join(',');
      if (layout !== previousLayout) {
        previousLayout = layout;
        this.driver?.refresh();
      } else if (highlightReady && this.popover?.style.visibility === 'hidden') {
        this.popover.style.visibility = 'visible';
        const editable = target?.querySelector<HTMLElement>('[contenteditable="true"]')
          ?? target?.querySelector<HTMLElement>('textarea, input:not([type="color"]):not([type="hidden"]):not(:disabled)');
        const focus = step.requiresInput ? editable : step.mode === 'action'
          ? target?.matches('button, input, textarea, [role="combobox"]') ? target
            : target?.querySelector<HTMLElement>('input, textarea, [contenteditable="true"], [role="combobox"], button')
          : this.popover.querySelector<HTMLButtonElement>('.driver-popover-next-btn');
        (focus ?? this.popover.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
      }
      this.layoutFrame = requestAnimationFrame(trackLayout);
    };
    this.layoutFrame = requestAnimationFrame(trackLayout);
    window.addEventListener('keydown', this.keydown, true);
    window.addEventListener('focusin', this.focusin, true);
    for (const event of ['pointerdown', 'mousedown', 'click', 'submit']) {
      window.addEventListener(event, this.interaction, true);
    }
  }

  setNextEnabled(enabled: boolean): void {
    this.nextEnabled = enabled;
    const button = this.popover?.querySelector<HTMLButtonElement>('.driver-popover-next-btn');
    if (!button) return;
    button.disabled = !enabled;
    button.classList.toggle('driver-popover-btn-disabled', !enabled);
  }

  hide(): void {
    if (this.layoutFrame !== undefined) cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = undefined;
    window.removeEventListener('keydown', this.keydown, true);
    window.removeEventListener('focusin', this.focusin, true);
    for (const event of ['pointerdown', 'mousedown', 'click', 'submit']) {
      window.removeEventListener(event, this.interaction, true);
    }
    this.interactionRoot?.classList.remove('tour-interaction-root');
    this.interactionRoot = null;
    document.body.classList.remove('tour-interactive');
    this.interactive = false;
    this.allowed?.classList.remove('tour-allowed-option');
    this.allowed = null;
    this.driver?.destroy();
    this.driver = null;
    this.popover = null;
  }

  destroy(focusTarget?: HTMLElement): void {
    this.hide();
    const target = focusTarget?.isConnected ? focusTarget : this.returnFocus?.isConnected ? this.returnFocus
      : document.querySelector<HTMLElement>('[data-tour-id="tours-help"]');
    target?.focus();
  }

  private escape(value: string): string {
    const element = document.createElement('span');
    element.textContent = value;
    return element.innerHTML;
  }

  private permits(target: EventTarget | null): boolean {
    return this.interactive && target instanceof Element && Boolean(
      this.interactionRoot?.contains(target)
      || target.closest('.p-select-overlay, .p-datepicker-panel, .p-popover, .tiptap-bubble-menu')
      // A form's footer and close controls belong to the same dialog.
      || this.interactionRoot?.closest('[role="dialog"]')?.contains(target));
  }

  private interaction = (event: Event): void => {
    const target = event.target as Node;
    if (this.popover?.contains(target) || this.permits(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'click' && this.allowed?.contains(target)) this.advance?.();
  };

  private focusin = (event: FocusEvent): void => {
    if (this.permits(event.target)) return;
    if (!this.popover?.contains(event.target as Node) && !this.allowed?.contains(event.target as Node)) {
      this.popover?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  };

  private keydown = (event: KeyboardEvent): void => {
    if (this.interactive && (!this.skip || event.key !== 'Escape'
      || document.querySelector('.p-select-overlay, .p-datepicker-panel, .p-popover'))) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.skip?.();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const buttons = [...(this.popover?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])]
        .filter((button) => button.style.display !== 'none');
      const targets: HTMLElement[] = this.allowed ? [...buttons, this.allowed] : buttons;
      const index = targets.indexOf(document.activeElement as HTMLElement);
      targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length]?.focus();
    } else if (this.allowed?.contains(event.target as Node) && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.advance?.();
    }
  };
}
