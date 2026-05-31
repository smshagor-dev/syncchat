import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import {
  DEFAULT_ROOM_APPEARANCE,
  getRoomAppearance,
  resetRoomAppearance,
  saveRoomAppearance,
} from '../../helpers/roomAppearance';

const wallpaperPresets = [
  { key: 'whatsapp', label: 'Pattern', subtitle: 'Telegram-like texture' },
  { key: 'plain', label: 'Plain', subtitle: 'Minimal clean base' },
  { key: 'sunset', label: 'Sunset', subtitle: 'Warm evening tones' },
  { key: 'ocean', label: 'Ocean', subtitle: 'Cool aqua blend' },
  { key: 'forest', label: 'Forest', subtitle: 'Natural green feel' },
];

const bubbleThemes = [
  { key: 'default', label: 'Default', sent: '#ccecff', received: '#ffffff' },
  { key: 'mint', label: 'Mint', sent: '#ccfbf1', received: '#f8fafc' },
  { key: 'amber', label: 'Amber', sent: '#fef3c7', received: '#fff7ed' },
  { key: 'violet', label: 'Violet', sent: '#ede9fe', received: '#f8fafc' },
];

const getWallpaperStyle = (appearance) => {
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
        'linear-gradient(135deg, rgba(255,203,112,0.35), rgba(255,126,95,0.45), rgba(198,93,201,0.35))',
    };
  }
  if (appearance.wallpaperPreset === 'ocean') {
    return {
      backgroundImage:
        'linear-gradient(135deg, rgba(14,165,233,0.35), rgba(6,182,212,0.35), rgba(45,212,191,0.35))',
    };
  }
  if (appearance.wallpaperPreset === 'forest') {
    return {
      backgroundImage:
        'linear-gradient(135deg, rgba(34,197,94,0.32), rgba(16,185,129,0.3), rgba(132,204,22,0.28))',
    };
  }
  if (appearance.wallpaperPreset === 'plain') {
    return {
      backgroundColor: '#e2e8f0',
      backgroundImage: 'none',
    };
  }
  return {};
};

const getWallpaperThumbClass = (presetKey) => {
  if (presetKey === 'whatsapp') {
    return 'mb-2 block h-11 w-full rounded-lg border border-slate-200 whatsapp-wallpaper dark:border-spill-700';
  }
  if (presetKey === 'plain') {
    return 'mb-2 block h-11 w-full rounded-lg border border-slate-200 bg-slate-200 dark:border-spill-700 dark:bg-spill-700';
  }
  return 'mb-2 block h-11 w-full rounded-lg border border-slate-200 dark:border-spill-700';
};

const getWallpaperThumbStyle = (appearance, presetKey) => {
  if (presetKey === 'sunset') {
    return getWallpaperStyle({
      ...appearance,
      wallpaperPreset: 'sunset',
    });
  }
  if (presetKey === 'ocean') {
    return getWallpaperStyle({
      ...appearance,
      wallpaperPreset: 'ocean',
    });
  }
  if (presetKey === 'forest') {
    return getWallpaperStyle({
      ...appearance,
      wallpaperPreset: 'forest',
    });
  }
  return {};
};

function RoomAppearance() {
  const dispatch = useDispatch();
  const {
    modal: { roomAppearance },
    room: { chat: chatRoom },
  } = useSelector((state) => state);

  const active = !!roomAppearance;
  const roomId = useMemo(
    () =>
      typeof roomAppearance === 'string'
        ? roomAppearance
        : chatRoom?.data?.roomId,
    [roomAppearance, chatRoom?.data?.roomId]
  );
  const [appearance, setAppearance] = useState(() => getRoomAppearance(roomId));
  const uploadInputRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    setAppearance(getRoomAppearance(roomId));
  }, [active, roomId]);

  if (!active) return null;

  const close = () =>
    dispatch(setModal({ target: 'roomAppearance', data: false }));

  const handleUpload = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (!result) return;
      setAppearance((prev) => ({
        ...prev,
        wallpaperPreset: 'custom-image',
        wallpaperImage: result,
      }));
    };
    reader.readAsDataURL(file);
  };

  const save = () => {
    saveRoomAppearance(roomId, appearance);
    close();
  };

  const reset = () => {
    resetRoomAppearance(roomId);
    setAppearance({ ...DEFAULT_ROOM_APPEARANCE });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-spill-600/40 dark:bg-black/60 grid place-items-center"
      aria-hidden
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-[920px] max-w-[95vw] rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-2xl dark:border-spill-700 dark:bg-spill-800 dark:text-spill-100">
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-spill-700">
          <div>
            <h2 className="text-xl font-bold">Room Appearance</h2>
            <p className="text-xs opacity-70">
              Customize wallpaper and message bubble style
            </p>
          </div>
          <button
            type="button"
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-spill-700"
            onClick={close}
          >
            <bi.BiX />
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.9fr]">
          <div className="grid gap-4">
            <div>
              <p className="mb-2 text-sm font-semibold">Wallpaper</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {wallpaperPresets.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`rounded-xl border p-2.5 text-left transition ${
                      appearance.wallpaperPreset === item.key
                        ? 'border-sky-500 bg-sky-50 shadow-sm dark:bg-sky-900/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-spill-700 dark:hover:bg-spill-700/50'
                    }`}
                    onClick={() =>
                      setAppearance((prev) => ({
                        ...prev,
                        wallpaperPreset: item.key,
                        wallpaperImage: prev.wallpaperImage,
                      }))
                    }
                  >
                    <span
                      className={getWallpaperThumbClass(item.key)}
                      style={getWallpaperThumbStyle(appearance, item.key)}
                    />
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-[11px] opacity-70">{item.subtitle}</p>
                  </button>
                ))}
                <button
                  type="button"
                  className={`rounded-xl border p-2.5 text-left transition ${
                    appearance.wallpaperPreset === 'custom-image'
                      ? 'border-sky-500 bg-sky-50 shadow-sm dark:bg-sky-900/20'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-spill-700 dark:hover:bg-spill-700/50'
                  }`}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <span
                    className="mb-2 block h-11 w-full rounded-lg border border-dashed border-slate-300 bg-slate-100 dark:border-spill-600 dark:bg-spill-700"
                    style={getWallpaperStyle({
                      ...appearance,
                      wallpaperPreset: 'custom-image',
                    })}
                  />
                  <p className="text-sm font-medium">Custom Image</p>
                  <p className="text-[11px] opacity-70">
                    Upload your wallpaper
                  </p>
                </button>
              </div>
              <input
                ref={uploadInputRef}
                id="room-wallpaper-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Bubble Theme</p>
              <div className="grid grid-cols-2 gap-2">
                {bubbleThemes.map((theme) => (
                  <button
                    key={theme.key}
                    type="button"
                    className={`rounded-xl border p-2 transition ${
                      appearance.sentBubbleBg === theme.sent &&
                      appearance.receivedBubbleBg === theme.received
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-spill-700 dark:hover:bg-spill-700/50'
                    }`}
                    onClick={() =>
                      setAppearance((prev) => ({
                        ...prev,
                        sentBubbleBg: theme.sent,
                        receivedBubbleBg: theme.received,
                      }))
                    }
                  >
                    <p className="mb-1 text-left text-xs font-semibold">
                      {theme.label}
                    </p>
                    <div className="grid gap-1">
                      <div
                        className="ml-auto w-[70%] rounded-lg px-2 py-1 text-[11px]"
                        style={{ backgroundColor: theme.sent }}
                      >
                        Sent
                      </div>
                      <div
                        className="w-[70%] rounded-lg px-2 py-1 text-[11px]"
                        style={{ backgroundColor: theme.received }}
                      >
                        Received
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="grid gap-1">
                <span className="text-sm font-medium">
                  Sent message background
                </span>
                <input
                  aria-label="Sent message background"
                  type="color"
                  value={appearance.sentBubbleBg}
                  onChange={(e) =>
                    setAppearance((prev) => ({
                      ...prev,
                      sentBubbleBg: e.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-md border border-slate-200 dark:border-spill-700"
                />
              </div>
              <div className="grid gap-1">
                <span className="text-sm font-medium">
                  Received message background
                </span>
                <input
                  aria-label="Received message background"
                  type="color"
                  value={appearance.receivedBubbleBg}
                  onChange={(e) =>
                    setAppearance((prev) => ({
                      ...prev,
                      receivedBubbleBg: e.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-md border border-slate-200 dark:border-spill-700"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-3 dark:border-spill-700">
            <p className="mb-2 text-sm font-semibold">Live Preview</p>
            <div
              className={`relative h-[420px] overflow-hidden rounded-2xl border border-slate-200 p-3 dark:border-spill-700 ${
                appearance.wallpaperPreset === 'whatsapp'
                  ? 'whatsapp-wallpaper'
                  : ''
              }`}
              style={getWallpaperStyle(appearance)}
            >
              <div className="absolute inset-x-0 top-0 h-10 bg-white/70 px-3 backdrop-blur-sm dark:bg-spill-800/75">
                <div className="h-full flex items-center gap-2 text-xs">
                  <span className="font-semibold">Atia Rahman</span>
                  <span className="opacity-70">online</span>
                </div>
              </div>
              <div className="absolute inset-x-0 top-12 bottom-0 space-y-2 p-3">
                <div
                  className="w-fit max-w-[78%] rounded-2xl rounded-bl-md px-3 py-2 text-sm text-slate-900 shadow-sm"
                  style={{ backgroundColor: appearance.receivedBubbleBg }}
                >
                  This looks much better now.
                </div>
                <div
                  className="ml-auto w-fit max-w-[78%] rounded-2xl rounded-br-md px-3 py-2 text-sm text-slate-900 shadow-sm"
                  style={{ backgroundColor: appearance.sentBubbleBg }}
                >
                  Yes, Telegram style and clean.
                </div>
                <div
                  className="w-fit max-w-[78%] rounded-2xl rounded-bl-md px-3 py-2 text-sm text-slate-900 shadow-sm"
                  style={{ backgroundColor: appearance.receivedBubbleBg }}
                >
                  Perfect for daily chat use.
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs opacity-70">
              Preview is saved only for this room.
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-spill-700 dark:hover:bg-spill-700"
            onClick={reset}
          >
            Reset
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700"
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default RoomAppearance;
