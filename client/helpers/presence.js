import moment from 'moment';

export const getPresenceMeta = (profile) => {
  if (!profile) {
    return {
      text: '',
      online: false,
      showDot: false,
    };
  }

  if (profile.canSeeOnline && profile.online) {
    return {
      text: 'online',
      online: true,
      showDot: true,
    };
  }

  if (profile.canSeeLastSeen && profile.lastSeenAt) {
    return {
      text: `last seen ${moment(profile.lastSeenAt).fromNow()}`,
      online: false,
      showDot: false,
    };
  }

  return {
    text: 'privacy protected',
    online: false,
    showDot: false,
  };
};
