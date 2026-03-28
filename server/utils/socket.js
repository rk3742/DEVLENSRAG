const socketIo = require('socket.io');

let io;

module.exports = {
  init: (httpServer) => {
    io = socketIo(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        methods: ["GET", "POST"]
      }
    });

    io.on('connection', (socket) => {
      console.log('New client connected: ' + socket.id);

      socket.on('disconnect', () => {
        console.log('Client disconnected: ' + socket.id);
      });
      
      // Rooms based on repoId or analysisId
      socket.on('subscribe_repo', (repoId) => {
        socket.join(`repo_${repoId}`);
        console.log(`Socket ${socket.id} subscribed to repo_${repoId}`);
      });
      
      socket.on('subscribe_analysis', (analysisId) => {
         socket.join(`analysis_${analysisId}`);
         console.log(`Socket ${socket.id} subscribed to analysis_${analysisId}`);
      });
    });

    return io;
  },
  getIo: () => {
    if (!io) {
      throw new Error('Socket.io not initialized!');
    }
    return io;
  }
};
