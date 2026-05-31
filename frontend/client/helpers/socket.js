import { io } from 'socket.io-client';
import config from '../config';

const socket = io(config.socketUrl, {
  autoConnect: false,
  reconnectionAttempts: 5,
  reconnectionDelay: 1500,
});
export default socket;
