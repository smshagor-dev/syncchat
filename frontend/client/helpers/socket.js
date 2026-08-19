import { io } from 'socket.io-client';
import config from '../config';

const socket = io(config.socketUrl, {
  path: '/socket.io',
  transports: ['websocket'],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  auth(callback) {
    callback({ token: localStorage.getItem('token') || '' });
  },
});

socket.on('connect_error', (error) => {
  if (error?.data?.code === 'SOCKET_AUTH_INVALID' || error?.data?.code === 'SOCKET_AUTH_REQUIRED') {
    // The HTTP auth flow owns redirect/logout. Keep the socket closed until a fresh token exists.
    socket.disconnect();
  }
});

export default socket;
