const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const Queue = require('bull');
const AdvancedLogger = require('./AdvancedLogger');
const FileManager = require('./fileManager');
const ApkAnalyzer = require('./apkAnalyzer');

const logger = new AdvancedLogger();
const fileManager = new FileManager(logger);

// Khởi tạo các queues
const fileQueue = new Queue('file-processing');
const apkQueue = new Queue('apk-analysis');
const backupQueue = new Queue('backup-tasks');

if (cluster.isMaster) {
    logger.info(`Master worker ${process.pid} is running`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
        cluster.fork();
    });
} else {
    // Xử lý file
    fileQueue.process(async (job) => {
        const { type, filePath, options } = job.data;
        
        try {
            switch(type) {
                case 'analyze':
                    return await fileManager.analyzeFile(filePath, options);
                case 'compress':
                    return await fileManager.compressFile(filePath, options);
                case 'backup':
                    return await fileManager.backupFile(filePath, options);
                default:
                    throw new Error('Unknown file operation type');
            }
        } catch (error) {
            logger.error(`File operation error: ${error.message}`);
            throw error;
        }
    });

    // Xử lý APK
    apkQueue.process(async (job) => {
        const { type, apkPath, options } = job.data;
        const analyzer = new ApkAnalyzer(logger);
        
        try {
            switch(type) {
                case 'analyze':
                    return await analyzer.analyze(apkPath, options);
                case 'decompile':
                    return await analyzer.decompile(apkPath, options);
                default:
                    throw new Error('Unknown APK operation type');
            }
        } catch (error) {
            logger.error(`APK operation error: ${error.message}`);
            throw error;
        }
    });

    // Xử lý backup
    backupQueue.process(async (job) => {
        const { type, data } = job.data;
        
        try {
            switch(type) {
                case 'full':
                    return await fileManager.fullBackup(data);
                case 'incremental':
                    return await fileManager.incrementalBackup(data);
                case 'restore':
                    return await fileManager.restoreBackup(data);
                default:
                    throw new Error('Unknown backup operation type');
            }
        } catch (error) {
            logger.error(`Backup operation error: ${error.message}`);
            throw error;
        }
    });

    // Xử lý lỗi queue
    [fileQueue, apkQueue, backupQueue].forEach(queue => {
        queue.on('error', error => {
            logger.error(`Queue error: ${error.message}`);
        });

        queue.on('failed', (job, error) => {
            logger.error(`Job ${job.id} failed: ${error.message}`);
        });

        queue.on('completed', job => {
            logger.info(`Job ${job.id} completed successfully`);
        });
    });

    logger.info(`Worker ${process.pid} started`);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM. Performing graceful shutdown...');
    
    try {
        await Promise.all([
            fileQueue.close(),
            apkQueue.close(),
            backupQueue.close()
        ]);
        
        logger.info('Queues closed successfully');
        process.exit(0);
    } catch (error) {
        logger.error(`Error during shutdown: ${error.message}`);
        process.exit(1);
    }
}); 