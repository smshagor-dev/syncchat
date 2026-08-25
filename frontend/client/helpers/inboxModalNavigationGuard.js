import store from '../redux/store';
import { setModal } from '../redux/features/modal';

const getPageSnapshot = (state) => JSON.stringify(state?.page || {});

const closeInboxModal = () => {
  const state = store.getState();
  if (!state?.modal?.inboxMenu) return;
  store.dispatch(setModal({ target: 'inboxMenu', data: false }));
};

const hasOpenInboxDialog = () => {
  if (!document?.body) return false;

  // Lock/Delete confirmations are rendered as direct body portals by
  // InboxMenu. Detect the mounted portal itself instead of trying to infer an
  // interaction from event.composedPath().
  return Array.from(document.body.children).some(
    (node) =>
      node instanceof Element && node.classList?.contains('z-[900]') === true
  );
};

const isInboxContextMenuInteraction = (event) => {
  const target = event?.target;
  return target instanceof Element && !!target.closest('#inbox-context-menu');
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

    // Inbox also installs its own document-level bubble-phase pointerdown
    // listener for closing the compact context menu. When a Lock/Delete portal
    // is mounted, that listener sees portal clicks as outside clicks and closes
    // Redux inboxMenu before React's scope button onClick can finish.
    //
    // Stop this native pointerdown from propagating beyond document capture
    // while the confirmation dialog owns the interaction. This does not cancel
    // the browser default action or the later click event, so the dialog's
    // buttons, inputs, backdrop, X and Cancel controls continue to work.
    if (hasOpenInboxDialog()) {
      event.stopPropagation();
      return;
    }

    if (isInboxContextMenuInteraction(event)) return;

    // With no confirmation dialog open, keep the original stale-menu cleanup
    // for clicks outside the compact context menu.
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
