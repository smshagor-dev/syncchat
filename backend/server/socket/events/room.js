const { io } = global;
const attachCallingEvents = require('./calling');

module.exports = (socket) => {
  socket.on('room/open', (args) => {
    if (args.prevRoom) socket.leave(args.prevRoom);
    socket.join(args.newRoom);
    io.to(args.newRoom).emit('room/open', args.newRoom);
  });

  attachCallingEvents(socket);
};
