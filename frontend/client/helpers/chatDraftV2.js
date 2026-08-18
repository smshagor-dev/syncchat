import axios from 'axios';
import socket from './socket';
import store from '../redux/store';
import { setReplyingChat } from '../redux/features/chore';

let installed = false;
let currentRoomId = null;
let saveTimer = null;
let observer = null;
let attachedInput = null;
let inputHandler = null;
let restoredRoomId = null;

const getRoom = () => store.getState()?.room?.chat?.data || null;
const getReply = () => store.getState()?.chore?.replyingChat || null;

const findComposer = () => {
  const nodes = [
    ...document.querySelectorAll(
      'textarea[name="text"], input[name="text"], textarea[data-chat-composer], input[data-chat-composer]'
    ),
  ];
  return (
    nodes.reverse().find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !node.disabled;
    }) || null
  );
};

const setNativeValue = (element, value) => {
  if (!element) return;
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) descriptor.set.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

const clearTimer = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
};

const saveDraftNow = async () => {
  clearTimer();
  const room = getRoom();
  if (!room?.roomId || room.roomId !== currentRoomId) return;
  const input = findComposer();
  const text = String(input?.value || '');
  const replyingChat = getReply();
  const topicId =
    String(localStorage.getItem(`syncchat:topic:${room.roomId}`) || '').trim() || null;

  try {
    if (!text.trim() && !replyingChat && !topicId) {
      await axios.delete(`/chat-v2/drafts/${room.roomId}`);
      return;
    }
    await axios.put(`/chat-v2/drafts/${room.roomId}`, {
      text,
      replyTo: replyingChat?._id || null,
      topicId,
      meta: {
        replyingChat: replyingChat || null,
      },
    });
  } catch (error0) {
    // Drafts also remain in the DOM while offline; the next input/room sync retries.
  }
};

const scheduleSave = () => {
  clearTimer();
  saveTimer = setTimeout(() => {
    saveDraftNow().catch(() => {});
  }, 650);
};

const attachComposer = () => {
  const next = findComposer();
  if (next === attachedInput) return;
  if (attachedInput && inputHandler) {
    attachedInput.removeEventListener('input', inputHandler);
  }
  attachedInput = next;
  if (!attachedInput) return;
  inputHandler = () => scheduleSave();
  attachedInput.addEventListener('input', inputHandler);
};

const restoreDraft = async (roomId) => {
  if (!roomId || restoredRoomId === roomId) return;
  restoredRoomId = roomId;
  try {
    const { data } = await axios.get(`/chat-v2/drafts/${roomId}`);
    const draft = data?.payload;
    if (!draft) return;

    const apply = () => {
      attachComposer();
      if (!attachedInput) return false;
      if (!String(attachedInput.value || '') && draft.text) {
        setNativeValue(attachedInput, draft.text);
      }
      if (draft?.meta?.replyingChat) {
        store.dispatch(setReplyingChat(draft.meta.replyingChat));
      }
      if (draft.topicId) {
        localStorage.setItem(`syncchat:topic:${roomId}`, draft.topicId);
        window.dispatchEvent(
          new CustomEvent('syncchat:topic-selected', {
            detail: { roomId, topicId: draft.topicId },
          })
        );
      }
      return true;
    };

    if (!apply()) {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (apply() || attempts >= 20) clearInterval(timer);
      }, 150);
    }
  } catch (error0) {
    // No draft or offline. Composer continues normally.
  }
};

const onStoreChange = () => {
  const room = getRoom();
  const roomId = room?.roomId || null;
  if (roomId === currentRoomId) {
    attachComposer();
    return;
  }

  if (currentRoomId) saveDraftNow().catch(() => {});
  currentRoomId = roomId;
  restoredRoomId = null;
  attachComposer();
  if (roomId) restoreDraft(roomId).catch(() => {});
};

const installChatDraftV2 = () => {
  if (installed) return;
  installed = true;

  store.subscribe(onStoreChange);
  observer = new MutationObserver(() => attachComposer());
  observer.observe(document.body, { childList: true, subtree: true });
  onStoreChange();

  socket.on('chat/ack', (payload = {}) => {
    if (!payload.accepted || !payload.roomId) return;
    axios.delete(`/chat-v2/drafts/${payload.roomId}`).catch(() => {});
  });

  window.addEventListener('beforeunload', () => {
    if (saveTimer) clearTimeout(saveTimer);
  });
};

export default installChatDraftV2;
