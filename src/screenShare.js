/** Only an OS-level monitor capture is accepted; windows and browser tabs are rejected. */
export function isEntireDisplaySurface(displaySurface) {
  return displaySurface === "monitor";
}
