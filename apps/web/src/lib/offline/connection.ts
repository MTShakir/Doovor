/**
 * Whether the phone has a connection, for `useSyncExternalStore` (PRG-09, M4-10).
 *
 * The browser's own word for it: "offline" is reliable, since nothing can be sent; "online" can be a
 * phone with a network and no internet behind it, which the screens cope with as a slow network
 * whose requests fail. The server renders as online, since a page it sends arrived over a connection.
 */

export function subscribeToConnection(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export function connectionSnapshot(): boolean {
  return navigator.onLine;
}

export function serverConnectionSnapshot(): boolean {
  return true;
}
