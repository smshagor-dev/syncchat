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
});
export default socket;
