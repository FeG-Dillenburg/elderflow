import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tours.css';
import { translate } from '../i18n';
import type { TourStep } from './registry';

/** Own the interaction boundary as well as Driver's visual overlay. */
export class TourPresenter {
  private driver: Driver | null = null;
  private popover: HTMLElement | null = null;
  private allowed: HTMLElement | null = null;
  private skip: (() => void) | null = null;
  private advance: (() => void) | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private returnFocus = document.activeElement as HTMLElement | null;

  show(step: TourStep, target: HTMLElement | undefined, nextOption: HTMLElement | null,
    last: boolean, advance: () => void, skip: () => void): void {
    this.hide();
    this.allowed = nextOption;
    this.advance = advance;
    this.skip = step.skippable ? skip : null;
    nextOption?.classList.add('tour-allowed-option');
    this.driver = driver({
      animate: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      smoothScroll: false,
      allowKeyboardControl: false,
      allowClose: false,
      disableActiveInteraction: false,
      popoverClass: 'elderflow-tour',
      overlayOpacity: 0.65,
      stagePadding: step.target?.startsWith('nav-') ? 2 : 10,
      onDestroyed: () => { this.popover = null; },
    });
    this.driver.highlight({
      element: target,
      popover: {
        title: step.titleKey ? this.escape(translate(step.titleKey)) : undefined,
        description: this.escape(translate(step.descriptionKey)),
        side: step.side,
        showButtons: ['next'],
        nextBtnText: translate(last ? 'tours.finish' : step.id === 'welcome' ? 'tours.start' : 'tours.next'),
        onNextClick: advance,
        onPopoverRender: (popover) => {
          this.popover = popover.wrapper;
          popover.wrapper.setAttribute('role', 'dialog');
          popover.wrapper.setAttribute('aria-modal', 'true');
          popover.wrapper.setAttribute('aria-label', translate('tours.help'));
          if (!step.titleKey) popover.wrapper.removeAttribute('aria-labelledby');
          popover.closeButton.setAttribute('aria-label', translate('tours.skip'));
          popover.previousButton.textContent = translate('common.back');
          popover.description.setAttribute('aria-live', 'polite');
          if (step.skippable) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'driver-popover-footer-btn tour-skip';
            button.textContent = translate('tours.skip');
            button.onclick = skip;
            popover.footerButtons.prepend(button);
          }
          queueMicrotask(() => popover.nextButton.focus());
        },
      },
    });
    this.refreshTimer = setTimeout(() => {
      this.driver?.refresh();
      if (this.popover && !this.popover.contains(document.activeElement)
        && !this.allowed?.contains(document.activeElement)) {
        this.popover.querySelector<HTMLButtonElement>('.driver-popover-next-btn')?.focus();
      }
    }, 350);
    window.addEventListener('keydown', this.keydown, true);
    window.addEventListener('focusin', this.focusin, true);
    for (const event of ['pointerdown', 'mousedown', 'click', 'submit']) {
      window.addEventListener(event, this.interaction, true);
    }
  }

  hide(): void {
    clearTimeout(this.refreshTimer);
    window.removeEventListener('keydown', this.keydown, true);
    window.removeEventListener('focusin', this.focusin, true);
    for (const event of ['pointerdown', 'mousedown', 'click', 'submit']) {
      window.removeEventListener(event, this.interaction, true);
    }
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

  private interaction = (event: Event): void => {
    const target = event.target as Node;
    if (this.popover?.contains(target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'click' && this.allowed?.contains(target)) this.advance?.();
  };

  private focusin = (event: FocusEvent): void => {
    if (!this.popover?.contains(event.target as Node) && !this.allowed?.contains(event.target as Node)) {
      this.popover?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  };

  private keydown = (event: KeyboardEvent): void => {
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
