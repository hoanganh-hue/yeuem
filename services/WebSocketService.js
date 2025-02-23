const { Server } = require('socket.io');

class WebSocketService {
    constructor(server, logger) {
        this.io = new Server(server);
        this.logger = logger;
        this.setupHandlers();
    }

    setupHandlers() {
        this.io.on('connection', (socket) => {
            socket.on('subscribe:task', (taskId) => {
                socket.join(`task:${taskId}`);
            });

            socket.on('unsubscribe:task', (taskId) => {
                socket.leave(`task:${taskId}`); 
            });
        });
    }

    sendTaskUpdate(taskId, data) {
        this.io.to(`task:${taskId}`).emit('task:update', {
            taskId,
            timestamp: Date.now(),
            ...data
        });
    }
}

module.exports = WebSocketService;
