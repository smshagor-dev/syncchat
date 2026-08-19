import { io } from 'socket.io-client';
import config from '../config';

const readToken = () => {
  try {
    return localStorage.getItem('token') || '';
  } catch (error0) {
    return '';
  }
};

const socket = io(config.socketUrl, {
  path: '/socket.io',
  transports: ['websocket'],
  autoConnect: Boolean(readToken()),
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 250,
  reconnectionDelayMax: 1500,
  randomizationFactor: 0.25,
  timeout: 8000,
  auth(callback) {
    callback({ token: readToken() });
  },
});

socket.on('connect_error', (error) => {
  if (error?.data?.code === 'SOCKET_AUTH_INVALID' || error?.data?.code === 'SOCKET_AUTH_REQUIRED') {
    // The HTTP auth flow owns redirect/logout. Keep the socket closed until a fresh token exists.
    socket.disconnect();
  }
});

export default socket;
