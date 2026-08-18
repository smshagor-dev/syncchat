import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import CallPanelRuntime from '../modals/callPanelRuntime';
import GroupCallLiveKit from '../modals/groupCallLiveKit';
import { getCallingConfig, shouldUseGroupSfu } from '../../helpers/callingConfig';

function CallPanelGateway() {
  const call = useSelector((state) => state.modal.callPanel);
  const chat = useSelector((state) => state.room.chat);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');

  const roomType = call?.roomType || chat?.data?.roomType || 'private';
  const recipients = Array.isArray(call?.recipientsId) ? call.recipientsId : [];
  const participants = roomType === 'group' ? Math.max(3, recipients.length + 1) : 2;

  useEffect(() => {
    if (!call) {
      setConfig(null);
      setError('');
      return undefined;
    }
    let dead = false;
    getCallingConfig({ force: true })
      .then((value) => {
        if (!dead) setConfig(value);
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
    (call?.mediaMode === 'sfu' || shouldUseGroupSfu(config, participants));

  return useSfu ? <GroupCallLiveKit config={config} /> : <CallPanelRuntime />;
}

export default CallPanelGateway;
