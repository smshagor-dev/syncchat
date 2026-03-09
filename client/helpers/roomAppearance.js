const STORAGE_KEY = 'syncchat:room-appearance:v1';
export const ROOM_APPEARANCE_EVENT = 'room-appearance-updated';
export const WALLPAPER_PRESETS = [
  { key: 'whatsapp', label: 'Pattern', subtitle: 'Soft texture background' },
  { key: 'plain', label: 'Plain', subtitle: 'Minimal clean base' },
  { key: 'sunset', label: 'Sunset', subtitle: 'Warm evening tones' },
  { key: 'ocean', label: 'Ocean', subtitle: 'Cool aqua blend' },
  { key: 'forest', label: 'Forest', subtitle: 'Natural green feel' },
];

export const DEFAULT_ROOM_APPEARANCE = {
  wallpaperPreset: 'whatsapp',
  wallpaperImage: '',
  sentBubbleBg: '#ccecff',
  receivedBubbleBg: '#ffffff',
};

export const getWallpaperStyle = (appearance = DEFAULT_ROOM_APPEARANCE) => {
  if (
    appearance.wallpaperPreset === 'custom-image' &&
    appearance.wallpaperImage
  ) {
    return {
      backgroundImage: `url(${appearance.wallpaperImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  if (appearance.wallpaperPreset === 'sunset') {
    return {
      backgroundImage:
        'linear-gradient(135deg, rgba(255,203,112,0.22), rgba(255,126,95,0.25), rgba(198,93,201,0.2))',
    };
  }
  if (appearance.wallpaperPreset === 'ocean') {
    return {
      backgroundImage:
        'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(6,182,212,0.2), rgba(45,212,191,0.22))',
    };
  }
  if (appearance.wallpaperPreset === 'forest') {
    return {
      backgroundImage:
        'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.2), rgba(132,204,22,0.18))',
    };
  }
  if (appearance.wallpaperPreset === 'plain') {
    return {
      backgroundImage: 'none',
      backgroundColor: '#e2e8f0',
    };
  }
  return {};
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
