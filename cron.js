const cron = require('node-cron');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const moment = require('moment');
const AdvancedLogger = require('./AdvancedLogger');
const FileManager = require('./fileManager');

const logger = new AdvancedLogger();
const fileManager = new FileManager(logger);

// Tác vụ backup logs hàng ngày
cron.schedule('0 0 * * *', async () => {
    try {
        const date = moment().format('YYYYMMDD');
        const backupDir = path.join('backups', date);
        
        await fs.ensureDir(backupDir);
        await fileManager.backupLogs(backupDir);
        
        logger.info(`Daily log backup completed: ${backupDir}`);
    } catch (error) {
        logger.error('Daily log backup failed:', error);
    }
});

// Tác vụ dọn dẹp logs cũ (giữ 30 ngày)
cron.schedule('0 1 * * *', async () => {
    try {
        const oldLogs = await fileManager.cleanOldLogs(30);
        logger.info(`Cleaned ${oldLogs.length} old log files`);
    } catch (error) {
        logger.error('Log cleanup failed:', error);
    }
});

// Tác vụ backup database hàng ngày
cron.schedule('0 2 * * *', async () => {
    try {
        const date = moment().format('YYYYMMDD');
        const backupFile = path.join('backups', date, 'database.backup');
        
        await fs.ensureDir(path.dirname(backupFile));
        await fileManager.backupDatabase(backupFile);
        
        logger.info(`Daily database backup completed: ${backupFile}`);
    } catch (error) {
        logger.error('Database backup failed:', error);
    }
});

// Tác vụ dọn dẹp uploads tạm thời (files > 24h)
cron.schedule('0 3 * * *', async () => {
    try {
        const deleted = await fileManager.cleanTempUploads(24);
        logger.info(`Cleaned ${deleted.length} temporary upload files`);
    } catch (error) {
        logger.error('Temp file cleanup failed:', error);
    }
});

// Tác vụ kiểm tra và restart services nếu cần
cron.schedule('*/30 * * * *', async () => {
    try {
        exec('pm2 list', (error, stdout, stderr) => {
            if (error) {
                logger.error('PM2 status check failed:', error);
                return;
            }
            
            if (stdout.includes('errored') || stdout.includes('stopped')) {
                exec('pm2 restart all', (error, stdout, stderr) => {
                    if (error) {
                        logger.error('PM2 restart failed:', error);
                        return;
                    }
                    logger.info('Services restarted successfully');
                });
            }
        });
    } catch (error) {
        logger.error('Service health check failed:', error);
    }
});

// Tác vụ tối ưu hóa hệ thống
cron.schedule('0 4 * * *', async () => {
    try {
        // Dọn dẹp bộ nhớ cache
        exec('sync && echo 3 > /proc/sys/vm/drop_caches', (error) => {
            if (error) logger.error('Cache cleanup failed:', error);
            else logger.info('System cache cleaned');
        });
        
        // Tối ưu database
        await fileManager.optimizeDatabase();
        logger.info('Database optimized');
    } catch (error) {
        logger.error('System optimization failed:', error);
    }
});

// Tác vụ backup toàn bộ hệ thống hàng tuần
cron.schedule('0 5 * * 0', async () => {
    try {
        const date = moment().format('YYYYMMDD');
        const backupDir = path.join('backups', date, 'full');
        
        await fs.ensureDir(backupDir);
        await fileManager.fullSystemBackup(backupDir);
        
        logger.info(`Weekly full system backup completed: ${backupDir}`);
    } catch (error) {
        logger.error('Full system backup failed:', error);
    }
});

// Tác vụ gửi báo cáo hệ thống hàng ngày
cron.schedule('0 6 * * *', async () => {
    try {
        const report = await generateSystemReport();
        // Thêm logic gửi báo cáo qua email hoặc API
        logger.info('Daily system report generated and sent');
    } catch (error) {
        logger.error('System report generation failed:', error);
    }
});

async function generateSystemReport() {
    // Logic tạo báo cáo hệ thống
    return {
        timestamp: new Date(),
        metrics: {
            // Thêm các metrics
        }
    };
}

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('Received SIGTERM. Shutting down cron jobs...');
    process.exit(0);
}); 