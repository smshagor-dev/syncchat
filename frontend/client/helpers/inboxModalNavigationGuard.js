import store from '../redux/store';
import { setModal } from '../redux/features/modal';

const getPageSnapshot = (state) => JSON.stringify(state?.page || {});

const closeInboxModal = () => {
  const state = store.getState();
  if (!state?.modal?.inboxMenu) return;
  store.dispatch(setModal({ target: 'inboxMenu', data: false }));
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

    const target = event.target;
    if (!(target instanceof Element)) return;

    // Never close while the user is interacting with the menu itself or
    // with its lock/delete portal dialogs. This keeps Only me/Both switching stable.
    if (target.closest('#inbox-context-menu')) return;
    if (target.closest('.z-\\[900\\]')) return;

    // Close stale menu/dialog state after the navigation/filter click processes.
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
