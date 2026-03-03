const STORAGE_KEY = 'syncchat:room-appearance:v1';
export const ROOM_APPEARANCE_EVENT = 'room-appearance-updated';

export const DEFAULT_ROOM_APPEARANCE = {
  wallpaperPreset: 'whatsapp',
  wallpaperImage: '',
  sentBubbleBg: '#ccecff',
  receivedBubbleBg: '#ffffff',
};

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch (error0) {
    return {};
  }
};

const readStore = () => {
  if (typeof window === 'undefined') return {};
  return safeParse(window.localStorage.getItem(STORAGE_KEY) || '{}');
};

const writeStore = (next) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

export const getRoomAppearance = (roomId) => {
  if (!roomId) return { ...DEFAULT_ROOM_APPEARANCE };
  const store = readStore();
  return {
    ...DEFAULT_ROOM_APPEARANCE,
    ...(store[roomId] || {}),
  };
};

export const saveRoomAppearance = (roomId, data) => {
  if (!roomId) return;
  const store = readStore();
  store[roomId] = {
    ...DEFAULT_ROOM_APPEARANCE,
    ...(store[roomId] || {}),
    ...data,
  };
  writeStore(store);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(ROOM_APPEARANCE_EVENT, {
        detail: { roomId },
      })
    );
  }
};

export const resetRoomAppearance = (roomId) => {
  if (!roomId) return;
  const store = readStore();
  delete store[roomId];
  writeStore(store);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(ROOM_APPEARANCE_EVENT, {
        detail: { roomId },
      })
    );
  }
};
