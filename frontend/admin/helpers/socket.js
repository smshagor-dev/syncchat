import { io } from 'socket.io-client';
import config from '../config';

const socket = io(config.socketUrl, {
  path: '/socket.io',
  transports: ['websocket'],
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1500,
  auth(callback) {
    callback({ adminToken: localStorage.getItem('admin_token') || '' });
  },
});

export default socket;
