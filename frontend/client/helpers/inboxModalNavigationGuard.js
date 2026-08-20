import store from '../redux/store';
import { setModal } from '../redux/features/modal';

const getPageSnapshot = (state) => JSON.stringify(state?.page || {});

const closeInboxModal = () => {
  const state = store.getState();
  if (!state?.modal?.inboxMenu) return;
  store.dispatch(setModal({ target: 'inboxMenu', data: false }));
};

const isInboxDialogInteraction = (event) => {
  const path =
    typeof event?.composedPath === 'function' ? event.composedPath() : [];

  return path.some((node) => {
    if (!(node instanceof Element)) return false;
    if (node.id === 'inbox-context-menu') return true;

    // The lock/delete confirmation portal is rendered directly under body with
    // Tailwind's z-[900] utility. classList.contains works on the literal class
    // name and avoids fragile CSS-selector escaping for square brackets.
    return node.classList?.contains('z-[900]') === true;
  });
};

export default function installInboxModalNavigationGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  if (window.__syncchatInboxModalNavigationGuardInstalled) {
    return window.__syncchatInboxModalNavigationGuardCleanup || (() => {});
  }

  window.__syncchatInboxModalNavigationGuardInstalled = true;

  let previousPageSnapshot = getPageSnapshot(store.getState());

  const unsubscribe = store.subscribe(() => {
    const nextState = store.getState();
    const nextPageSnapshot = getPageSnapshot(nextState);

    if (nextPageSnapshot !== previousPageSnapshot) {
      previousPageSnapshot = nextPageSnapshot;
      if (nextState?.modal?.inboxMenu) {
        store.dispatch(setModal({ target: 'inboxMenu', data: false }));
      }
    }
  });

  const handlePointerDown = (event) => {
    const stateAtPointerDown = store.getState();
    if (!stateAtPointerDown?.modal?.inboxMenu) return;

    // Never close while the user is interacting with the inbox context menu or
    // with the lock/delete portal. This keeps Only me/Both and Delete for
    // me/Delete for both selection stable on desktop and mobile.
    if (isInboxDialogInteraction(event)) return;

    // Close stale menu/dialog state only after the outside/navigation click
    // gets a chance to run its own handler.
    queueMicrotask(closeInboxModal);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      closeInboxModal();
    }
  };

  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const cleanup = () => {
    unsubscribe();
    document.removeEventListener('pointerdown', handlePointerDown, true);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    delete window.__syncchatInboxModalNavigationGuardInstalled;
    delete window.__syncchatInboxModalNavigationGuardCleanup;
  };

  window.__syncchatInboxModalNavigationGuardCleanup = cleanup;
  return cleanup;
}
