import React, { useEffect, useRef, useState } from 'react';
import * as bi from 'react-icons/bi';

function QrScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);

  const stopStream = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const detectLoop = async () => {
    try {
      const detector = detectorRef.current;
      const video = videoRef.current;
      if (!detector || !video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detectLoop);
        return;
      }
      const results = await detector.detect(video);
      if (results && results.length > 0) {
        const value = results[0]?.rawValue || '';
        if (value) {
          onDetected(value);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(detectLoop);
    } catch (error0) {
      setError(error0?.message || 'QR scan failed.');
    }
  };

  const startScanner = async () => {
    try {
      setError('');
      if (!window.BarcodeDetector) {
        setSupported(false);
        return;
      }
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      rafRef.current = requestAnimationFrame(detectLoop);
    } catch (error0) {
      setError(
        error0?.message ||
          'Camera access failed. Please allow camera permission and try again.'
      );
    }
  };

  useEffect(() => {
    if (!open) {
      stopStream();
      setError('');
      setSupported(true);
      return;
    }
    startScanner();
    return () => stopStream();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 px-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-700">Scan QR code</p>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label="Close scanner"
          >
            <bi.BiX size={18} />
          </button>
        </div>

        <div className="bg-slate-950">
          <video ref={videoRef} className="h-72 w-full object-cover" />
        </div>

        <div className="grid gap-2 px-4 py-3 text-sm">
          {!supported && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
              QR scanning is not supported in this browser. Please paste the QR
              link manually.
            </p>
          )}
          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">
              {error}
            </p>
          )}
          <p className="text-slate-500">
            Point your camera at the QR from your signed-in device.
          </p>
        </div>
      </div>
    </div>
  );
}

export default QrScanner;
