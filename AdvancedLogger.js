const winston = require('winston');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { Tail } = require('tail');

class AdvancedLogger {
    constructor(options = {}) {
        this.config = {
            logDir: options.logDir || 'logs',
            level: options.level || 'info',
            maxFiles: options.maxFiles || 7,
            maxSize: options.maxSize || '10m',
            format: options.format || 'json',
            console: options.console !== false,
            errorFile: options.errorFile !== false,
            combinedFile: options.combinedFile !== false,
            rotateInterval: options.rotateInterval || '1d',
            bufferLogs: true,
            bufferSize: 100  // Lưu trữ tối đa 100 mục log trước khi ghi vào ổ cứng
        };

        fs.ensureDirSync(this.config.logDir);
        this.logger = this.initLogger();
        this.setupRotation();
        this.logBuffer = [];
        this.enableFullLogging();

        return this.logger; // Trả về logger trực tiếp để dùng trong index.js
    }

    enableFullLogging() {
        // Đặt level logging thành thấp nhất để ghi mọi thứ
        this.logger.level = 'debug';
        
        // Ghi log với quyền cao nhất
        fs.chmodSync('logs', '0777');
        
        this.logger.info('Full logging enabled with maximum permissions');
    }

    initLogger() {
        const { format } = winston;

        const jsonFormat = format.combine(
            format.timestamp(),
            format.errors({ stack: true }),
            format.metadata({ fillWith: ['timestamp', 'level', 'message', 'stack', 'service'] }),
            format.json()
        );

        const coloredConsoleFormat = format.combine(
            format.colorize(),
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            format.printf(({ level, message, timestamp, metadata = {} }) => {
                const icons = {
                    error: '❌',
                    warn: '⚠️',
                    info: 'ℹ️',
                    debug: '🔍',
                    verbose: '📝'
                };
                const icon = icons[level] || '📌';
                const metaInfo = Object.keys(metadata).length ? `\n${JSON.stringify(metadata, null, 2)}` : '';
                return `${icon} ${timestamp} [${level.toUpperCase()}]: ${message}${metaInfo}`;
            })
        );

        const transports = [];

        if (this.config.console) {
            transports.push(new winston.transports.Console({
                level: this.config.level,
                format: coloredConsoleFormat
            }));
        }

        if (this.config.errorFile) {
            transports.push(new winston.transports.File({
                filename: path.join(this.config.logDir, 'error.log'),
                level: 'error',
                format: jsonFormat,
                maxsize: this.convertSize(this.config.maxSize),
                maxFiles: this.config.maxFiles,
                tailable: true
            }));
        }

        if (this.config.combinedFile) {
            transports.push(new winston.transports.File({
                filename: path.join(this.config.logDir, 'combined.log'),
                format: jsonFormat,
                maxsize: this.convertSize(this.config.maxSize),
                maxFiles: this.config.maxFiles,
                tailable: true
            }));
        }

        return winston.createLogger({
            level: this.config.level,
            transports,
            exitOnError: false
        });
    }

    convertSize(size) {
        const unitMap = { k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
        const match = size.toLowerCase().match(/^(\d+)([kmg])?$/);
        if (!match) throw new Error(`Invalid size format: ${size}`);
        return parseInt(match[1], 10) * (unitMap[match[2]] || 1);
    }

    setupRotation() {
        if (!this.config.rotateInterval) return;

        const logFile = path.join(this.config.logDir, 'combined.log');

        setInterval(() => {
            if (fs.existsSync(logFile) && fs.statSync(logFile).size > 0) {
                const rotatedFile = `${logFile}.${Date.now()}.gz`;
                const input = fs.createReadStream(logFile);
                const output = fs.createWriteStream(rotatedFile);
                input.pipe(zlib.createGzip()).pipe(output).on('finish', () => {
                    fs.truncateSync(logFile, 0);
                    this.logger.info(`Log file rotated: ${rotatedFile}`);
                });
            }
        }, this.parseInterval(this.config.rotateInterval));
    }

    parseInterval(interval) {
        const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
        const match = interval.toLowerCase().match(/^(\d+)([smhd])$/);
        if (!match) throw new Error(`Invalid interval format: ${interval}`);
        return parseInt(match[1], 10) * units[match[2]];
    }

    logSystemInfo() {
        const sysInfo = {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            cpuCount: os.cpus().length,
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem()
            },
            networkInterfaces: os.networkInterfaces(),
            uptime: os.uptime()
        };

        this.logger.info('System Information', sysInfo);
        return sysInfo;
    }

    log(message) {
        this.logBuffer.push(message);
        if (this.logBuffer.length >= this.config.bufferSize) {
            this.flushLogs();
        }
    }

    flushLogs() {
        this.logBuffer.forEach(log => {
            this.logger.info(log);
        });
        this.logBuffer = [];
    }

    info(message) {
        this.logger.info(message);
    }

    error(message, error = null) {
        if (error) {
            this.logger.error(`${message} ${error.message || error}`);
        } else {
            this.logger.error(message);
        }
    }

    warn(message) {
        this.logger.warn(message);
    }

    debug(message) {
        this.logger.debug(message);
    }
}

module.exports = AdvancedLogger;
