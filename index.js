require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const { spawn, exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const winston = require('winston');
const os = require('os');
const multer = require('multer');
const FileAnalyzer = require('./FileAnalyzer.js');
const FileManager = require('./fileManager.js');
const AdvancedLogger = require('./AdvancedLogger.js');
const TaskManager = require('./services/TaskManager.js');
const BackgroundWorker = require('./services/BackgroundWorker.js');
const { Builder, By, Key, until } = require('selenium-webdriver');
const pty = require('node-pty');
const crypto = require('crypto');
const net = require('net');

// Khởi tạo logger
const logger = new AdvancedLogger();

// Đảm bảo các thư mục cần thiết tồn tại
['logs', 'uploads', 'backups'].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
    }
});

// Khởi tạo Express và HTTP server
const app = express();
const httpServer = http.createServer(app);

// Khởi tạo WebSocket một lần duy nhất
const io = new Server(httpServer, {
    maxHttpBufferSize: 1e8 // 100MB buffer size
});

// Cấu hình WebSocket
io.on('connection', (socket) => {
    socket.on('subscribe:task', (taskId) => {
        socket.join(`task:${taskId}`);
    });

    socket.on('unsubscribe:task', (taskId) => {
        socket.leave(`task:${taskId}`);
    });
});

// Hàm utility để gửi updates
function sendTaskUpdate(taskId, data) {
    io.to(`task:${taskId}`).emit('task:update', {
        taskId,
        timestamp: Date.now(),
        ...data
    });
}

// Khởi tạo FileManager
const fileManager = new FileManager(logger);

// Middleware cơ bản
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Thêm middleware toàn cục để đảm bảo quyền cao nhất
app.use((req, res, next) => {
    // Đặt tất cả các flag quyền thành true
    req.superUser = true;
    req.rootMode = true;
    req.bypassChecks = true;
    req.unrestrictedAccess = true;
    req.fullSystemAccess = true;
    
    // Cập nhật headers
    res.setHeader('X-Full-Access', 'true');
    res.setHeader('X-Super-User', 'true');
    
    next();
});

// Thêm middleware mới để cấp full quyền
app.use((req, res, next) => {
    req.sudoEnabled = true;
    req.rootAccess = true;
    req.bypassSecurity = true;
    req.systemAccess = true;
    
    process.env.ALLOW_SYSTEM_ACCESS = 'true';
    process.env.SUDO_ALLOWED = 'true';
    process.env.ENABLE_ROOT_ACCESS = 'true';
    process.env.ENABLE_FULL_ACCESS = 'true';
    process.env.BYPASS_SECURITY = 'true';
    process.env.NO_RESTRICTIONS = 'true';

    process.umask(0);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    logger.info(`Full access granted for request: ${req.method} ${req.path}`);

    next();
});

// Thêm middleware kiểm soát quyền truy cập
app.use((req, res, next) => {
    process.env.ALLOW_SYSTEM_ACCESS = 'true';
    req.systemAccess = true;
    next();
});

// Middleware xử lý lỗi
app.use((err, req, res, next) => {
    logger.error('Error:', err);
    res.status(500).json({
        error: err.message,
        stack: err.stack,
        fullAccess: true
    });
});

// Configure Upload
const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Add static file serving
app.use(express.static(path.join(__dirname, 'public')));

// A. File Management (7 endpoints)
app.post('/api/files/upload', upload.single('file'), (req, res) => {
    const destination = req.body.destination || 'uploads';
    const destPath = path.join(__dirname, destination, req.file.originalname);

    if (!fs.existsSync(path.join(__dirname, destination))) {
        return res.status(400).json({ error: `Destination directory ${destination} does not exist` });
    }

    fs.move(req.file.path, destPath, { overwrite: true })
        .then(() => {
            logger.info(`File uploaded: ${destPath}`);
            res.json({ message: 'File uploaded successfully', file: destPath });
        })
        .catch(err => {
            logger.error(`Error moving uploaded file:`, err);
            res.status(500).json({ error: err.message });
        });
});

app.get('/api/files/download/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    res.download(filePath, (err) => {
        if (err) {
            logger.error(`Error downloading file ${req.params.filename}:`, err);
            res.status(404).json({ error: 'File not found' });
        } else {
            logger.info(`Downloaded file: ${req.params.filename}`);
        }
    });
});

app.delete('/api/files/delete/:filename', async (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    try {
        await fileManager.deleteFile(filePath);
        res.json({ message: 'File deleted successfully' });
    } catch (error) {
        logger.error(`Error deleting file ${filePath}:`, error);
        res.status(404).json({ error: 'File not found' });
    }
});

app.get('/api/files/list', async (req, res) => {
    try {
        const files = await fileManager.listFiles('uploads');
        res.json(files);
    } catch (error) {
        logger.error(`Error listing files:`, error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/files/read/:filename', async (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    try {
        const content = await fileManager.readFile(filePath);
        res.json({ content });
    } catch (error) {
        logger.error(`Error reading file ${filePath}:`, error);
        res.status(404).json({ error: 'File not found' });
    }
});

app.post('/api/files/write', async (req, res) => {
    const { filePath, content } = req.body;
    try {
        await fileManager.writeFile(filePath, content);
        res.json({ message: 'File written successfully' });
    } catch (error) {
        logger.error(`Error writing file ${filePath}:`, error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/files/analyze', async (req, res) => {
    const { filePath } = req.body;
    try {
        const analyzer = new FileAnalyzer(logger);
        const analysis = await analyzer.analyzeFile(filePath);
        res.json({ analysis });
    } catch (error) {
        logger.error(`Error analyzing file ${filePath}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// B. System Management (4 endpoints)
app.get('/api/system/monitor', (req, res) => {
    logger.info('Received request for system monitor');
    const systemInfo = {
        cpu: os.cpus(),
        memory: {
            total: os.totalmem(),
            free: os.freemem(),
            usage: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2)
        },
        uptime: os.uptime(),
        platform: os.platform(),
        arch: os.arch()
    };
    res.json(systemInfo);
    logger.info('System monitor information sent');
});

app.get('/api/system/performance', (req, res) => {
    res.json({
        cpu: os.cpus(),
        memory: {
            total: os.totalmem(),
            free: os.freemem(),
            usage: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2)
        },
        uptime: os.uptime(),
        platform: os.platform(),
        arch: os.arch()
    });
});

app.get('/api/system/check-access', (req, res) => {
    res.json({
        allowed: process.env.ALLOW_SYSTEM_ACCESS === 'true'
    });
});

app.post('/api/system/elevate', (req, res) => {
    process.env.ALLOW_SYSTEM_ACCESS = 'true';
    process.env.SUDO_ALLOWED = 'true'; // Cho phép thực thi lệnh sudo
    res.json({ 
        message: 'Permissions elevated successfully',
        access: 'full',
        sudo: true 
    });
});

// C. Terminal Execution (4 endpoints)
app.post('/api/terminal/execute', async (req, res) => {
    const { command, background = false } = req.body;

    try {
        if (background) {
            const process = spawn(command, [], {
                detached: true,
                stdio: 'ignore',
                shell: true
            });
            process.unref();
            return res.json({ message: 'Command started in background', pid: process.pid });
        }

        const child = spawn(command, [], { shell: true });
        let output = '';

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            output += data.toString();
        });

        child.on('close', (code) => {
            res.json({ output, exitCode: code });
        });
    } catch (error) {
        logger.error(`Error executing command: ${command}`, error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/terminal/status/:pid', (req, res) => {
    const pid = parseInt(req.params.pid);
    try {
        process.kill(pid, 0);
        res.json({ running: true, pid });
    } catch (error) {
        res.json({ running: false, pid });
    }
});

app.post('/api/terminal/stop/:pid', (req, res) => {
    const pid = parseInt(req.params.pid);
    try {
        process.kill(pid);
        res.json({ message: 'Process stopped' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/terminal/interactive', (req, res) => {
    const { command, responses = {} } = req.body;
    const term = pty.spawn(command, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: process.env
    });

    let output = '';

    term.on('data', (data) => {
        output += data;
        Object.entries(responses).forEach(([question, answer]) => {
            if (data.includes(question)) {
                term.write(`${answer}\n`);
            }
        });
    });

    term.on('exit', (code) => {
        res.json({ output, exitCode: code });
    });
});

// D. APK Analysis (3 endpoints)
app.post('/api/apk/upload', upload.single('apk'), (req, res) => {
    const destPath = path.join(__dirname, 'uploads', req.file.originalname);
    fs.move(req.file.path, destPath, { overwrite: true })
        .then(() => {
            logger.info(`APK uploaded: ${destPath}`);
            res.json({ message: 'APK uploaded successfully', file: destPath });
        })
        .catch(err => {
            logger.error(`Error moving uploaded APK:`, err);
            res.status(500).json({ error: err.message });
        });
});

app.post('/api/apk/analyze', async (req, res) => {
    const { apkPath } = req.body;
    try {
        const analyzer = new FileAnalyzer();
        const result = await analyzer.analyzeAPK(apkPath);
        res.json(result);
    } catch (error) {
        logger.error(`Error analyzing APK: ${apkPath}`, error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/apk/decompile', async (req, res) => {
    const { apkPath, outputPath } = req.body;
    try {
        const analyzer = new FileAnalyzer();
        await analyzer.decompileAPK(apkPath, outputPath);
        res.json({ message: 'APK decompiled successfully' });
    } catch (error) {
        logger.error(`Error decompiling APK: ${apkPath}`, error);
        res.status(500).json({ error: error.message });
    }
});

// Thêm socket client cho GUI Control
function sendGuiCommand(command) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        
        client.connect(4723, 'localhost', () => {
            client.write(JSON.stringify(command));
        });

        client.on('data', (data) => {
            try {
                const result = JSON.parse(data.toString());
                resolve(result);
            } catch (error) {
                reject(error);
            }
            client.destroy();
        });

        client.on('error', (error) => {
            reject(error);
        });
    });
}

// Cập nhật các endpoint GUI Control
app.post('/api/gui/click', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'click',
            params: req.body
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error executing GUI click: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/gui/type', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'type',
            params: req.body
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error executing GUI type: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/gui/screenshot', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'screenshot',
            params: req.body
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error executing GUI screenshot: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/gui/move', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'move',
            params: req.body
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error executing GUI move: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/gui/scroll', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'scroll',
            params: req.body
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error executing GUI scroll: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

// Thêm các endpoint Appium
app.post('/api/gui/appium-click', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'appium_click',
            params: req.body
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error executing Appium click: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/gui/appium-type', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'appium_type',
            params: req.body
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error executing Appium type: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/gui/appium-screenshot', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'appium_screenshot',
            params: req.body
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error executing Appium screenshot: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/gui/appium-status', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'appium_status',
            params: { device_id: req.query.device_id }
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error checking Appium status: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/gui/appium-start', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'appium_start',
            params: req.body
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error starting Appium session: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/gui/appium-stop', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'appium_stop',
            params: req.body
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error stopping Appium session: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/gui/appium-execute', async (req, res) => {
    try {
        const result = await sendGuiCommand({
            action: 'appium_execute',
            params: req.body
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error executing Appium command: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

// F. Code Management (4 endpoints)
app.post('/api/code/write', async (req, res) => {
    const { filePath, content } = req.body;
    try {
        await fileManager.writeFile(filePath, content);
        res.json({ message: 'Code written successfully' });
    } catch (error) {
        logger.error(`Error writing code to ${filePath}:`, error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/code/read', async (req, res) => {
    const { filePath } = req.query;
    try {
        const content = await fileManager.readFile(filePath);
        res.json({ content });
    } catch (error) {
        logger.error(`Error reading code from ${filePath}:`, error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/code/history', async (req, res) => {
    const { filePath } = req.query;
    try {
        const history = await fileManager.getFileHistory(filePath);
        res.json(history);
    } catch (error) {
        logger.error(`Error getting history for ${filePath}:`, error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/code/restore', async (req, res) => {
    const { backupPath, originalPath } = req.body;
    try {
        await fileManager.restoreFile(backupPath, originalPath);
        res.json({ message: 'File restored successfully' });
    } catch (error) {
        logger.error(`Error restoring file from ${backupPath}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// G. Emulator Management (3 endpoints)
// Thêm endpoint mới cho thực thi lệnh ADB
app.post('/api/emulator/execute-adb', async (req, res) => {
    const { command, emulatorSerial } = req.body;
    const taskId = crypto.randomUUID();
    
    try {
        const adbCommand = emulatorSerial ? 
            `adb -s ${emulatorSerial} ${command}` : 
            `adb ${command}`;

        const child = spawn(adbCommand, [], { shell: true });
        let output = '';

        child.stdout.on('data', (data) => {
            output += data.toString();
            logger.info(`[${taskId}] ${data.toString()}`);
        });

        child.stderr.on('data', (data) => {
            output += data.toString();
            logger.error(`[${taskId}] ${data.toString()}`);
        });

        child.on('close', (code) => {
            res.json({
                taskId,
                output,
                exitCode: code,
                command: adbCommand
            });
        });
    } catch (error) {
        logger.error(`Error executing ADB command: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Thêm endpoint kiểm tra trạng thái emulator
app.get('/api/emulator/status/:serial', async (req, res) => {
    const { serial } = req.params;
    
    try {
        const devices = await checkEmulatorStatus(serial);
        res.json(devices);
    } catch (error) {
        logger.error(`Error checking emulator status: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Thêm endpoint theo dõi logs
app.get('/api/emulator/logs/:taskId', async (req, res) => {
    const { taskId } = req.params;
    try {
        const logs = await getTaskLogs(taskId);
        res.json({ logs });
    } catch (error) {
        logger.error(`Error retrieving logs: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Utility functions
async function checkEmulatorStatus(serial) {
    return new Promise((resolve, reject) => {
        exec('adb devices', (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            
            const lines = stdout.split('\n');
            const devices = lines
                .slice(1) // Skip first line (List of devices attached)
                .filter(line => line.trim())
                .map(line => {
                    const [deviceId, status] = line.split('\t');
                    return {
                        serial: deviceId.trim(),
                        status: status.trim(),
                        isTarget: deviceId.trim() === serial
                    };
                });
            
            resolve({
                devices,
                targetDevice: devices.find(d => d.isTarget) || null
            });
        });
    });
}

async function getTaskLogs(taskId) {
    const logFile = path.join('logs', `${taskId}.log`);
    if (!await fs.pathExists(logFile)) {
        return [];
    }
    const content = await fs.readFile(logFile, 'utf8');
    return content.split('\n').filter(line => line.trim());
}

// Khởi tạo services
const taskManager = new TaskManager(logger);
const backgroundWorker = new BackgroundWorker(logger, taskManager);

// API endpoint cho long-running tasks
app.post('/api/tasks/execute', async (req, res) => {
    const { command, timeout = 300000 } = req.body; // 5 phút timeout

    try {
        // Tạo task và trả về ngay taskId
        const taskId = await backgroundWorker.executeTask('command', { command });
        
        res.json({
            taskId,
            status: 'accepted',
            message: 'Task started successfully',
            statusEndpoint: `/api/tasks/${taskId}/status`
        });

    } catch (error) {
        logger.error('Error starting task:', error);
        res.status(500).json({
            error: 'Failed to start task',
            details: error.message
        });
    }
});

// API endpoint kiểm tra trạng thái task
app.get('/api/tasks/:taskId/status', (req, res) => {
    const { taskId } = req.params;
    const task = taskManager.getTaskStatus(taskId);
    
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
        taskId,
        status: task.status,
        progress: task.progress,
        result: task.result,
        error: task.error,
        startTime: task.startTime,
        endTime: task.endTime
    });
});

// API endpoint chờ kết quả task với timeout
app.get('/api/tasks/:taskId/wait', async (req, res) => {
    const { taskId } = req.params;
    const { timeout = 30000 } = req.query;

    try {
        const result = await taskManager.waitForTask(taskId, parseInt(timeout));
        res.json(result);
    } catch (error) {
        if (error.message === 'Task timeout') {
            res.status(202).json({
                status: 'pending',
                message: 'Task still processing'
            });
        } else {
            res.status(500).json({
                error: error.message
            });
        }
    }
});

// API endpoint dừng task
app.post('/api/tasks/:taskId/stop', async (req, res) => {
    const { taskId } = req.params;
    
    const stopped = await backgroundWorker.stopTask(taskId);
    if (stopped) {
        res.json({ message: 'Task stopped successfully' });
    } else {
        res.status(404).json({ error: 'Task not found or already completed' });
    }
});

// Server setup
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const DOMAIN = 'doremonsieucap88.com';

// Đọc SSL certificates
const sslOptions = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH),
  ca: fs.readFileSync(process.env.SSL_CA_PATH)
};

async function setupDirectories() {
    const dirs = ['logs', 'uploads', 'backups'];
    for (const dir of dirs) {
        try {
            await fs.ensureDir(dir);
            await fs.chmod(dir, 0o755);
            logger.info(`Directory ${dir} setup complete`);
        } catch (error) {
            logger.error(`Error creating directory ${dir}:`, error);
            throw error;
        }
    }
}

async function initializeSystem() {
    try {
        await setupDirectories();
        
        // Khởi động HTTP server trước
        await new Promise((resolve, reject) => {
            httpServer.listen(PORT, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        // Sau đó khởi động HTTPS server
        const httpsServer = https.createServer(sslOptions, app);
        await new Promise((resolve, reject) => {
            httpsServer.listen(HTTPS_PORT, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        logger.info(`Servers started - HTTP: ${PORT}, HTTPS: ${HTTPS_PORT}`);
        return { app, httpServer, httpsServer };
    } catch (error) {
        logger.error('Startup failed:', error);
        throw error;
    }
}

// Khởi động hệ thống
initializeSystem()
    .then(({ app, httpServer, httpsServer }) => {
        logger.info(`System initialized successfully on domain ${DOMAIN}`);
    })
    .catch(error => {
        logger.error('Failed to initialize system:', error);
        process.exit(1);
    });