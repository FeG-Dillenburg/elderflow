import { nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";

export interface PreparationDragSource {
  kind: "agenda" | "suggestion";
  id: string;
  title: string;
}

export interface PreparationDropTarget {
  sectionId: string;
  index: number;
}

// Keep the live editor tree and agenda order untouched until a valid pointer release.
export function usePreparationDrag(
  root: Ref<HTMLElement | null>,
  disabled: Ref<boolean>,
  commit: (source: PreparationDragSource, target: PreparationDropTarget) => Promise<boolean>,
) {
  const floating = ref<PreparationDragSource | null>(null);
  const pointer = ref({ x: 0, y: 0 });
  const target = ref<PreparationDropTarget | null>(null);
  const agendaHeight = ref(0);
  let armed: PreparationDragSource | null = null;
  let origin = { x: 0, y: 0 };
  let ready = false;
  let destinationEstablished = false;
  let frame = 0;
  let pointerId = 0;
  let handle: HTMLElement | null = null;
  let focus: HTMLElement | null = null;
  let selection: Pick<Range, "startContainer" | "startOffset" | "endContainer" | "endOffset"> | null = null;
  let scrollPositions: Array<{ element: Element; top: number; left: number }> = [];

  const restoreScroll = () => {
    for (const { element, top, left } of scrollPositions) {
      element.scrollTop = top;
      element.scrollLeft = left;
    }
  };

  const findTarget = () => {
    target.value = null;
    if (!root.value) return;
    for (const zone of root.value.querySelectorAll<HTMLElement>("[data-agenda-section]")) {
      const rect = zone.getBoundingClientRect();
      if (pointer.value.x < rect.left || pointer.value.x > rect.right
        || pointer.value.y < rect.top || pointer.value.y > rect.bottom) continue;
      const rows = [...zone.querySelectorAll<HTMLElement>("[data-agenda-item]")]
        .filter((row) => !(armed?.kind === "agenda" && row.dataset.agendaItem === armed.id));
      const before = rows.findIndex((row) => {
        const bounds = row.getBoundingClientRect();
        return pointer.value.y < bounds.top + bounds.height / 2;
      });
      target.value = { sectionId: zone.dataset.agendaSection!, index: before < 0 ? rows.length : before };
      return;
    }
  };

  const autoScroll = () => {
    if (!floating.value) return;
    if (ready && destinationEstablished) {
      // Scroll the nearest panel first, then its page ancestors when it reaches an edge.
      let element = document.elementFromPoint?.(pointer.value.x, pointer.value.y);
      while (element) {
        const page = element === document.scrollingElement;
        const bounds = page
          ? { top: 0, bottom: window.innerHeight }
          : element.getBoundingClientRect();
        if (page || /auto|scroll/.test(getComputedStyle(element).overflowY)) {
          let delta = pointer.value.y < bounds.top + 48 ? -12
            : pointer.value.y > bounds.bottom - 48 ? 12 : 0;
          // The preserved page height includes blank space below the compact agenda.
          // Stop at its last section so edge scrolling cannot carry every drop target away.
          if (page && delta > 0) {
            const zones = root.value?.querySelectorAll<HTMLElement>("[data-agenda-section]");
            const lastZone = zones?.[zones.length - 1];
            if (lastZone && lastZone.getBoundingClientRect().bottom <= window.innerHeight - 8) delta = 0;
          }
          const previous = element.scrollTop;
          if (delta) element.scrollTop += delta;
          if (element.scrollTop !== previous) break;
        }
        element = element.parentElement;
      }
      findTarget();
    }
    frame = requestAnimationFrame(autoScroll);
  };

  const restoreFocus = () => {
    if (focus?.isConnected) focus.focus({ preventScroll: true });
    if (selection?.startContainer.isConnected && selection.endContainer.isConnected) {
      const limit = (node: Node) => node.nodeType === Node.TEXT_NODE
        ? (node.textContent?.length ?? 0) : node.childNodes.length;
      const restored = document.createRange();
      restored.setStart(selection.startContainer, Math.min(selection.startOffset, limit(selection.startContainer)));
      restored.setEnd(selection.endContainer, Math.min(selection.endOffset, limit(selection.endContainer)));
      const currentSelection = window.getSelection();
      currentSelection?.removeAllRanges();
      currentSelection?.addRange(restored);
    }
  };

  const cleanup = (restore: boolean) => {
    armed = null;
    floating.value = null;
    target.value = null;
    ready = false;
    destinationEstablished = false;
    agendaHeight.value = 0;
    cancelAnimationFrame(frame);
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", release);
    document.removeEventListener("pointercancel", cancel);
    document.removeEventListener("keydown", keydown, true);
    window.removeEventListener("blur", cancel);
    document.removeEventListener("visibilitychange", visibilityChanged);
    handle?.removeEventListener("lostpointercapture", cancel);
    if (handle?.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
    handle = null;
    // Vue must restore the full row heights before returning to the saved scroll offset.
    void nextTick(() => {
      restoreFocus();
      if (restore) restoreScroll();
    });
  };

  const cancel = () => { if (armed) cleanup(true); };
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  };
  const visibilityChanged = () => {
    if (document.hidden) cancel();
  };

  const move = async (event: PointerEvent) => {
    if (!armed || (event.pointerId !== undefined && event.pointerId !== pointerId)) return;
    pointer.value = { x: event.clientX, y: event.clientY };
    if (!floating.value) {
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 8) return;
      event.preventDefault();
      agendaHeight.value = root.value?.querySelector("main")?.getBoundingClientRect().height ?? 0;
      floating.value = armed;
      origin = { ...pointer.value };
      await nextTick();
      if (!armed) return;
      if (armed.kind === "agenda") {
        const row = [...root.value!.querySelectorAll<HTMLElement>("[data-agenda-item]")]
          .find((row) => row.dataset.agendaItem === armed!.id);
        // Keep a source far down a long agenda near its original pointer position.
        const scroller = scrollPositions.find(({ element }) => element.contains(row ?? null));
        if (row && scroller) scroller.element.scrollTop += row.getBoundingClientRect().top - pointer.value.y + 20;
      }
      ready = true;
      frame = requestAnimationFrame(autoScroll);
      return;
    }
    event.preventDefault();
    if (!ready) return;
    if (!destinationEstablished && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 8) return;
    destinationEstablished = true;
    findTarget();
  };

  const release = async (event: PointerEvent) => {
    if (event.pointerId !== undefined && event.pointerId !== pointerId) return;
    const source = floating.value;
    const destination = target.value;
    if (!source || !destination || disabled.value) {
      cancel();
      return;
    }
    cleanup(false);
    try {
      const succeeded = await commit(source, destination);
      await nextTick();
      restoreFocus();
      if (!succeeded) restoreScroll();
      else {
        const row = [...(root.value?.querySelectorAll<HTMLElement>("[data-topic-id]") ?? [])]
          .find((row) => row.dataset.topicId === source.id || row.dataset.agendaItem === source.id);
        row?.scrollIntoView?.({ block: "nearest" });
      }
    } catch {
      restoreScroll();
    }
  };

  const start = (event: PointerEvent, source: PreparationDragSource) => {
    if (disabled.value || event.button !== 0 || armed) return;
    handle = event.currentTarget as HTMLElement;
    focus = document.activeElement as HTMLElement | null;
    const currentSelection = window.getSelection();
    const range = currentSelection?.rangeCount ? currentSelection.getRangeAt(0) : null;
    // Store endpoints rather than a live Range, which follows DOM removal during Teleport.
    selection = range ? {
      startContainer: range.startContainer,
      startOffset: range.startOffset,
      endContainer: range.endContainer,
      endOffset: range.endOffset,
    } : null;
    scrollPositions = [];
    let element: Element | null = handle;
    while (element) {
      if (element === document.scrollingElement || /auto|scroll/.test(getComputedStyle(element).overflowY)) {
        scrollPositions.push({ element, top: element.scrollTop, left: element.scrollLeft });
      }
      element = element.parentElement;
    }
    armed = source;
    pointerId = event.pointerId;
    origin = { x: event.clientX, y: event.clientY };
    handle.setPointerCapture?.(pointerId);
    handle.addEventListener("lostpointercapture", cancel);
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", cancel);
    document.addEventListener("keydown", keydown, true);
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibilityChanged);
  };

  watch(disabled, (value) => { if (value && armed) cancel(); });
  onBeforeUnmount(cancel);
  return { floating, pointer, target, agendaHeight, start, cancel };
}
