// The one way to open the "Add to project" sheet from anywhere — the desktop
// clients list (a DOM-built menu that cannot hold React state), the client's
// page and the handheld clients list all call this, and the sheet mounted on
// each of those pages listens for it.

export const ADD_TO_PROJECT_EVENT = "jf:add-to-project";

export type AddToProjectDetail = { clientId: string };

export function openAddToProject(clientId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AddToProjectDetail>(ADD_TO_PROJECT_EVENT, { detail: { clientId } }));
}
