import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';
import QRCode from 'qrcode';
import { setModal } from '../../redux/features/modal';
import config from '../../config';
import resolveUploadUrl from '../../helpers/resolveUploadUrl';

function QR() {
  const dispatch = useDispatch();
  const {
    user: { master },
    modal: { qr },
  } = useSelector((state) => state);
  const [copied, setCopied] = useState(false);
  const [qrImage, setQrImage] = useState('');
  const avatarUrl = resolveUploadUrl(
    qr?.avatar || 'assets/images/default-avatar.png'
  );
  const isGroupQr = qr?.type === 'group';

  const shareUrl = useMemo(() => {
    if (qr?.shareUrl) return qr.shareUrl;
    if (!master?.username) return '';
    const origin = window.location.origin;
    return `${origin}/chat?u=${encodeURIComponent(master.username)}`;
  }, [master?.username, qr?.shareUrl]);

  const shareText = useMemo(
    () =>
      isGroupQr
        ? `Join my group on ${config.brandName}: ${shareUrl}`
        : `Chat with me on ${config.brandName}: ${shareUrl}`,
    [isGroupQr, shareUrl]
  );

  const socialLinks = useMemo(
    () => [
      {
        key: 'whatsapp',
        label: 'WhatsApp',
        icon: <ri.RiWhatsappFill size={18} />,
        href: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
        className: 'bg-emerald-500 hover:bg-emerald-600 text-white',
      },
      {
        key: 'telegram',
        label: 'Telegram',
        icon: <ri.RiTelegramFill size={18} />,
        href: `https://t.me/share/url?url=${encodeURIComponent(
          shareUrl
        )}&text=${encodeURIComponent(`Chat with me on ${config.brandName}`)}`,
        className: 'bg-sky-500 hover:bg-sky-600 text-white',
      },
      {
        key: 'facebook',
        label: 'Facebook',
        icon: <ri.RiFacebookCircleFill size={18} />,
        href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
          shareUrl
        )}`,
        className: 'bg-blue-600 hover:bg-blue-700 text-white',
      },
      {
        key: 'twitter',
        label: 'X',
        icon: <ri.RiTwitterFill size={18} />,
        href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(
          shareUrl
        )}&text=${encodeURIComponent(`Chat with me on ${config.brandName}`)}`,
        className: 'bg-slate-800 hover:bg-black text-white',
      },
    ],
    [shareText, shareUrl]
  );

  const generateQRCode = async () => {
    if (qr && shareUrl) {
      try {
        const dataUrl = await QRCode.toDataURL(shareUrl, {
          width: 220,
          margin: 2,
        });
        setQrImage(dataUrl);
      } catch (error0) {
        console.error(error0.message);
      }
    } else {
      setQrImage('');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error0) {
      console.error(error0.message);
    }
  };

  useEffect(() => {
    generateQRCode();
  }, [!!qr, shareUrl]);

  return (
    <div
      id="qr"
      className={`
        ${qr ? 'delay-75 z-[120] opacity-100' : 'z-[-1] opacity-0 delay-300 pointer-events-none'}
        fixed inset-0 w-full h-full flex justify-center items-center
        bg-spill-600/40 dark:bg-black/60
      `}
    >
      <div
        aria-hidden
        className={`${
          !qr && 'scale-95'
        } transition w-[460px] m-6 grid rounded-md bg-white shadow-2xl dark:bg-spill-800`}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {qr && (
          <>
            <div className="h-16 pl-4 pr-2 grid grid-cols-[1fr_auto] gap-4 items-center">
              <div className="flex gap-4 items-center overflow-hidden">
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
                <span className="truncate">
                  <p className="truncate font-bold">{qr.fullname}</p>
                  <p className="truncate text-sm opacity-80">{qr.bio}</p>
                </span>
              </div>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(setModal({ target: 'qr' }));
                }}
              >
                <i>
                  <bi.BiX />
                </i>
              </button>
            </div>
            <div className="group relative p-2 flex justify-center items-center bg-spill-100 dark:bg-spill-700">
              {qrImage ? (
                <img
                  src={qrImage}
                  alt="Share QR code"
                  className="w-[220px] h-[220px] rounded-md bg-white p-1"
                />
              ) : (
                <div className="w-[220px] h-[220px] rounded-md bg-white/70 flex justify-center items-center text-xs opacity-70">
                  Generating QR...
                </div>
              )}
            </div>
            <div className="p-4 grid gap-3">
              <p className="text-sm">
                {isGroupQr
                  ? `Scan this QR to join this ${config.brandName} group.`
                  : `Scan this QR to open your ${config.brandName} profile chat directly.`}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {socialLinks.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center gap-2 transition ${item.className}`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </a>
                ))}
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="text"
                  id="qr-share-url"
                  name="qrShareUrl"
                  readOnly
                  value={shareUrl}
                  className="w-full py-2 px-3 rounded-md border border-spill-300 bg-spill-50 dark:bg-spill-900 dark:border-spill-600 text-sm"
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded-md bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1"
                  onClick={handleCopy}
                >
                  {copied ? <bi.BiCheck size={18} /> : <bi.BiCopy size={18} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default QR;
