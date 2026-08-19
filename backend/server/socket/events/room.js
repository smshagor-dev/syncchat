const { io } = global;
const attachCallingEvents = require('./calling');
const attachCallRealtimeEvents = require('./callRealtime');
const attachBackgroundCallingEvents = require('./backgroundCalling');
const attachGroupModerationEvents = require('./groupModeration');

module.exports = (socket) => {
  socket.on('room/open', (args) => {
    if (args.prevRoom) socket.leave(args.prevRoom);
    socket.join(args.newRoom);
    io.to(args.newRoom).emit('room/open', args.newRoom);
  });

  attachCallingEvents(socket);
  attachCallRealtimeEvents(socket);
  attachBackgroundCallingEvents(socket);
  attachGroupModerationEvents(socket);
};
