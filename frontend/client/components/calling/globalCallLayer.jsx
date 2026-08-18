import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import socket from '../../helpers/socket';
import { setModal } from '../../redux/features/modal';
import CallPanelRuntime from '../modals/callPanelRuntime';

const normalizeCall = (payload = {}) => {
  if (!payload?.callId || !payload?.roomId) return null;
  return {
    callId: String(payload.callId),
    roomId: String(payload.roomId),
    roomType: payload.roomType === 'group' ? 'group' : 'private',
    mediaType: payload.mediaType === 'video' ? 'video' : 'audio',
    fromUserId: String(payload.fromUserId || ''),
    fromName: String(payload.fromName || ''),
    fromUsername: String(payload.fromUsername || ''),
    ringingTimeoutSec: Math.max(10, Number(payload.ringingTimeoutSec || 45)),
  };
};

const readLaunchAction = () => {
  const params = new URLSearchParams(window.location.search);
  const action = params.get('callAction');
  const callId = params.get('callId');
  const roomId = params.get('roomId');
  if (!action || !callId || !roomId) return null;

  return {
    action: ['accept', 'decline'].includes(action) ? action : 'open',
    call: normalizeCall({
      callId,
      roomId,
      roomType: params.get('roomType'),
      mediaType: params.get('mediaType'),
      fromUserId: params.get('fromUserId'),
      fromName: params.get('fromName'),
      fromUsername: params.get('fromUsername'),
      ringingTimeoutSec: params.get('ringingTimeoutSec'),
    }),
  };
};

const clearLaunchAction = () => {
  const url = new URL(window.location.href);
  [
    'callAction',
    'callId',
    'roomId',
    'roomType',
    'mediaType',
    'fromUserId',
    'fromName',
    'fromUsername',
    'ringingTimeoutSec',
  ].forEach((key) => url.searchParams.delete(key));
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
};

function GlobalCallLayer() {
  const dispatch = useDispatch();
  const master = useSelector((state) => state.user.master);
  const callPanel = useSelector((state) => state.modal.callPanel);
  const pendingActionRef = useRef(null);
  const launchHandledRef = useRef(false);

  const openIncoming = (payload, action = 'open') => {
    if (!master?._id) return false;
    const call = normalizeCall(payload);
    if (!call || call.fromUserId === master._id) return false;

    if (action === 'accept' || action === 'decline') {
      pendingActionRef.current = { action, callId: call.callId };
    }

    if (!callPanel || callPanel.callId === call.callId) {
      dispatch(
        setModal({
          target: 'callPanel',
          data: {
            ...(callPanel?.callId === call.callId ? callPanel : {}),
            ...call,
            mode: 'incoming',
          },
        })
      );
      return true;
    }

    return false;
  };

  useEffect(() => {
    const onIncoming = (payload) => {
      openIncoming(payload, 'open');
    };

    socket.on('call/incoming', onIncoming);
    return () => {
      socket.off('call/incoming', onIncoming);
    };
  }, [dispatch, master?._id, callPanel]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    const onMessage = (event) => {
      const message = event?.data || {};
      if (message.type !== 'syncchat/call-action') return;
      openIncoming(message.call, message.action || 'open');
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [dispatch, master?._id, callPanel]);

  useEffect(() => {
    if (!master?._id || launchHandledRef.current) return;
    const launch = readLaunchAction();
    if (!launch?.call) return;

    launchHandledRef.current = true;
    openIncoming(launch.call, launch.action);
    clearLaunchAction();
  }, [master?._id, callPanel]);

  useEffect(() => {
    const pending = pendingActionRef.current;
    if (!pending || !callPanel || callPanel.callId !== pending.callId) return undefined;

    let attempts = 0;
    const selector = pending.action === 'accept' ? '[aria-label="Accept"]' : '[aria-label="Reject"]';
    const timer = setInterval(() => {
      attempts += 1;
      const button = document.querySelector(selector);
      if (button && !button.disabled) {
        pendingActionRef.current = null;
        clearInterval(timer);
        button.click();
        return;
      }
      if (attempts >= 40) {
        pendingActionRef.current = null;
        clearInterval(timer);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [callPanel?.callId]);

  return <CallPanelRuntime />;
}

export default GlobalCallLayer;
