import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import socket from '../../helpers/socket';
import { setModal } from '../../redux/features/modal';
import CallPanelRuntime from '../modals/callPanelRuntime';

function GlobalCallLayer() {
  const dispatch = useDispatch();
  const master = useSelector((state) => state.user.master);
  const callPanel = useSelector((state) => state.modal.callPanel);

  useEffect(() => {
    const onIncoming = (payload) => {
      if (!master?._id) return;
      if (!payload?.roomId || payload.fromUserId === master._id) return;
      if (callPanel) return;

      dispatch(
        setModal({
          target: 'callPanel',
          data: {
            ...payload,
            mode: 'incoming',
          },
        })
      );
    };

    socket.on('call/incoming', onIncoming);
    return () => {
      socket.off('call/incoming', onIncoming);
    };
  }, [dispatch, master?._id, callPanel]);

  return <CallPanelRuntime />;
}

export default GlobalCallLayer;
