export function watchPopupClose(
  popup: Window | null,
  onClosed: () => void,
  intervalMs = 1000
): boolean {
  if (!popup) return false;

  const timer = window.setInterval(() => {
    if (!popup.closed) return;
    window.clearInterval(timer);
    onClosed();
  }, intervalMs);

  return true;
}
