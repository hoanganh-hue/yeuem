const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const AdvancedLogger = require('./AdvancedLogger');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    maxHttpBufferSize: 1e8 // 100MB
});

const logger = new AdvancedLogger();

// Middleware xác thực
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
        // Thêm logic xác thực token ở đây
        next();
    } else {
        next(new Error('Authentication error'));
    }
});

// Xử lý kết nối
io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    // Đăng ký nhận updates
    socket.on('subscribe', (channels) => {
        if (Array.isArray(channels)) {
            channels.forEach(channel => {
                socket.join(channel);
                logger.info(`Client ${socket.id} subscribed to ${channel}`);
            });
        }
    });

    // Hủy đăng ký
    socket.on('unsubscribe', (channels) => {
        if (Array.isArray(channels)) {
            channels.forEach(channel => {
                socket.leave(channel);
                logger.info(`Client ${socket.id} unsubscribed from ${channel}`);
            });
        }
    });

    // Nhận events từ client
    socket.on('event', (data) => {
        logger.info(`Received event from ${socket.id}:`, data);
        // Xử lý event và broadcast nếu cần
        io.to(data.channel).emit('event', data);
    });

    // Xử lý file upload qua socket
    socket.on('upload', (data) => {
        logger.info(`File upload started from ${socket.id}`);
        // Xử lý upload và gửi progress updates
        socket.emit('upload:progress', { progress: 0 });
        // ... xử lý upload ...
        socket.emit('upload:complete', { url: 'file_url' });
    });

    // Xử lý ngắt kết nối
    socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
    });

    // Xử lý lỗi
    socket.on('error', (error) => {
        logger.error(`Socket error from ${socket.id}:`, error);
    });
});

// API endpoints
app.get('/socket/status', (req, res) => {
    res.json({
        connections: io.engine.clientsCount,
        uptime: process.uptime()
    });
});

// Khởi động server
const PORT = process.env.SOCKET_PORT || 3002;
httpServer.listen(PORT, () => {
    logger.info(`Socket.IO server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('Received SIGTERM. Closing socket server...');
    
    io.close(() => {
        logger.info('Socket server closed');
        process.exit(0);
    });
}); 