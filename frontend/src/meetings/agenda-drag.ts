const agendaCardType = "application/x-elderflow-agenda-card";

export const setAgendaDragData = (dataTransfer: DataTransfer): void => {
  // Sortable owns card movement; never expose the card's content as droppable text.
  dataTransfer.clearData();
  dataTransfer.setData(agendaCardType, "1");
};

export const preventAgendaCardDrop = (_view: unknown, event: DragEvent): boolean => {
  if (!event.dataTransfer?.types.includes(agendaCardType)) return false;
  event.preventDefault();
  // Leave propagation intact so Sortable can finish the reorder at the document.
  return true;
};
