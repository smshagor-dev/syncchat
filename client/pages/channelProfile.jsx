import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setPage } from '../redux/features/page';
import GroupProfile from './groupProfile';

function ChannelProfile() {
  const dispatch = useDispatch();
  const channelProfile = useSelector((state) => state.page.channelProfile);
  const chatRoom = useSelector((state) => state.room.chat);

  React.useEffect(() => {
    if (!channelProfile || typeof channelProfile === 'object') return;
    if (!chatRoom?.data?.channel?._id) return;

    dispatch(
      setPage({
        target: 'channelProfile',
        data: {
          channelId: chatRoom.data.channel._id,
          roomId: chatRoom.data.roomId || null,
        },
      })
    );
  }, [channelProfile, chatRoom?.data?.channel?._id, chatRoom?.data?.roomId, dispatch]);

  return <GroupProfile mode="channel" />;
}

export default ChannelProfile;
