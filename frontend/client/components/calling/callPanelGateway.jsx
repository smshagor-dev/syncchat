import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import CallPanelRuntime from '../modals/callPanelRuntime';
import GroupCallLiveKit from '../modals/groupCallLiveKit';
import { getCallingConfig, shouldUseGroupSfu } from '../../helpers/callingConfig';

function CallPanelGateway() {
  const call = useSelector((state) => state.modal.callPanel);
  const chat = useSelector((state) => state.room.chat);
  const [config, setConfig] = useState(null);
  const [sessionMode, setSessionMode] = useState(null);
  const [error, setError] = useState('');

  const roomType = call?.roomType || chat?.data?.roomType || 'private';
  const recipients = Array.isArray(call?.recipientsId) ? call.recipientsId : [];
  const participants = roomType === 'group' ? Math.max(3, recipients.length + 1) : 2;

  useEffect(() => {
    if (!call) {
      setConfig(null);
      setSessionMode(null);
      setError('');
      return undefined;
    }
    let dead = false;
    const tasks = [getCallingConfig({ force: true })];
    if (call.callId) {
      tasks.push(
        axios
          .get(`/calling/session/${encodeURIComponent(call.callId)}`)
          .then((res) => res?.data?.payload || null)
          .catch(() => null)
      );
    }

    Promise.all(tasks)
      .then(([runtimeConfig, session]) => {
        if (dead) return;
        setConfig(runtimeConfig);
        setSessionMode(session?.mediaMode || call?.mediaMode || null);
      })
      .catch((error0) => {
        if (!dead) setError(error0?.response?.data?.message || error0.message);
      });
    return () => {
      dead = true;
    };
  }, [call?.roomId, call?.callId, call?.mode]);

  if (!call) return null;
  if (error) return <CallPanelRuntime />;
  if (!config) return <CallPanelRuntime />;

  const useSfu =
    roomType === 'group' &&
    (sessionMode === 'sfu' ||
      (!call.callId && shouldUseGroupSfu(config, participants)));

  return useSfu ? <GroupCallLiveKit config={config} /> : <CallPanelRuntime />;
}

export default CallPanelGateway;
