import React from 'react';
import {
  MdBatteryFull,
  MdCall,
  MdCallEnd,
  MdMessage,
  MdMicOff,
  MdScreenShare,
  MdSignalCellular4Bar,
  MdVideocam,
  MdVolumeUp,
} from 'react-icons/md';

const PROFILE_IMAGE =
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80';

function StatusIcons() {
  return (
    <div className="absolute right-6 top-6 flex items-center gap-2 text-white/95">
      <MdSignalCellular4Bar size={17} />
      <MdBatteryFull size={17} />
    </div>
  );
}

function IncomingScreen() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[42px] border border-white/15 bg-[#12281d] shadow-[0_35px_80px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(116,194,142,0.45),transparent_42%),radial-gradient(circle_at_72%_20%,rgba(172,228,188,0.38),transparent_48%),radial-gradient(circle_at_50%_72%,rgba(63,142,94,0.5),transparent_58%),linear-gradient(140deg,#173724,#0f271a_40%,#0b1d14)]" />
      <div className="absolute -left-20 top-20 h-44 w-44 rounded-full bg-emerald-200/30 blur-3xl" />
      <div className="absolute -right-16 bottom-32 h-52 w-52 rounded-full bg-lime-200/25 blur-3xl" />

      <StatusIcons />

      <div className="relative z-10 flex h-full flex-col items-center px-10 pt-24 text-white">
        <h2 className="text-[34px] font-semibold tracking-tight">Atia Rahman</h2>
        <p className="mt-1 text-base text-white/85">Incoming Call...</p>

        <div className="mt-14 h-48 w-48 overflow-hidden rounded-full border-4 border-white/30 shadow-[0_18px_35px_rgba(0,0,0,0.35)]">
          <img
            src={PROFILE_IMAGE}
            alt="Atia Rahman"
            className="h-full w-full object-cover"
          />
        </div>

        <div className="mt-auto w-full pb-14">
          <div className="mx-auto grid w-[78%] grid-cols-2 gap-8">
            <div className="flex flex-col items-center">
              <button
                type="button"
                className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-[0_10px_24px_rgba(239,68,68,0.45)]"
              >
                <MdCallEnd size={29} className="text-white" />
              </button>
              <span className="mt-2 text-sm text-white/95">Decline</span>
            </div>

            <div className="flex flex-col items-center">
              <button
                type="button"
                className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 shadow-[0_10px_24px_rgba(16,185,129,0.5)]"
              >
                <MdCall size={29} className="text-white" />
              </button>
              <span className="mt-2 text-sm text-white/95">Accept</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutgoingControls() {
  const controls = [
    { icon: <MdScreenShare size={20} />, label: 'Share Screen' },
    { icon: <MdMessage size={20} />, label: 'Message' },
    { icon: <MdVideocam size={20} />, label: 'Video' },
    { icon: <MdVolumeUp size={20} />, label: 'Speaker' },
    { icon: <MdMicOff size={20} />, label: 'Mute' },
  ];

  return (
    <div className="w-[84%] rounded-[30px] border border-white/15 bg-black/35 px-4 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="grid grid-cols-5 gap-2">
        {controls.map((item) => (
          <div key={item.label} className="flex flex-col items-center text-white">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10">
              {item.icon}
            </span>
            <span className="mt-1 text-[11px] text-white/90">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutgoingScreen() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[42px] border border-white/15 bg-[#112b1f] shadow-[0_35px_80px_rgba(0,0,0,0.45)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(163,241,194,0.32),transparent_36%),radial-gradient(circle_at_80%_18%,rgba(120,201,154,0.32),transparent_40%),radial-gradient(circle_at_50%_78%,rgba(42,121,79,0.45),transparent_58%),linear-gradient(155deg,#1c4b31,#163824_38%,#0f281a)]" />
      <div className="absolute -left-24 top-28 h-56 w-56 rounded-full bg-emerald-200/20 blur-3xl" />
      <div className="absolute -right-20 bottom-24 h-56 w-56 rounded-full bg-green-200/20 blur-3xl" />

      <StatusIcons />

      <div className="relative z-10 flex h-full flex-col items-center px-10 pt-24 text-white">
        <h2 className="text-[34px] font-semibold tracking-tight">Atia Rahman</h2>
        <p className="mt-1 text-base text-white/85">Calling...</p>

        <div className="mt-14 h-48 w-48 overflow-hidden rounded-full border-4 border-white/30 shadow-[0_18px_35px_rgba(0,0,0,0.35)]">
          <img
            src={PROFILE_IMAGE}
            alt="Atia Rahman"
            className="h-full w-full object-cover"
          />
        </div>

        <div className="mt-auto w-full pb-12">
          <div className="flex flex-col items-center gap-8">
            <OutgoingControls />
            <button
              type="button"
              className="grid h-16 w-16 place-items-center rounded-full bg-red-500 shadow-[0_10px_24px_rgba(239,68,68,0.45)]"
            >
              <MdCallEnd size={30} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CallUiPreview() {
  return (
    <div className="absolute inset-0 overflow-auto bg-[linear-gradient(145deg,#dfe9df,#cfd9d2)] p-10">
      <div className="mx-auto flex min-h-full max-w-[1300px] items-center justify-center">
        <div className="grid grid-cols-2 gap-10">
          <div className="h-[840px] w-[390px]">
            <IncomingScreen />
          </div>
          <div className="h-[840px] w-[390px]">
            <OutgoingScreen />
          </div>
        </div>
      </div>
    </div>
  );
}

export default CallUiPreview;
