const os = require('os');
const fs = require('fs-extra');
const si = require('systeminformation');
const express = require('express');
const prometheus = require('prom-client');
const AdvancedLogger = require('./AdvancedLogger');

const app = express();
const logger = new AdvancedLogger();
const register = new prometheus.Registry();

// Khởi tạo các metrics
const cpuUsageGauge = new prometheus.Gauge({
    name: 'cpu_usage_percent',
    help: 'CPU usage percentage'
});

const memoryUsageGauge = new prometheus.Gauge({
    name: 'memory_usage_bytes',
    help: 'Memory usage in bytes'
});

const diskUsageGauge = new prometheus.Gauge({
    name: 'disk_usage_bytes',
    help: 'Disk usage in bytes'
});

const networkTrafficCounter = new prometheus.Counter({
    name: 'network_traffic_bytes',
    help: 'Network traffic in bytes'
});

const apiRequestsCounter = new prometheus.Counter({
    name: 'api_requests_total',
    help: 'Total number of API requests',
    labelNames: ['method', 'endpoint', 'status']
});

const apiLatencyHistogram = new prometheus.Histogram({
    name: 'api_request_duration_seconds',
    help: 'API request duration in seconds',
    buckets: [0.1, 0.5, 1, 2, 5]
});

register.registerMetric(cpuUsageGauge);
register.registerMetric(memoryUsageGauge);
register.registerMetric(diskUsageGauge);
register.registerMetric(networkTrafficCounter);
register.registerMetric(apiRequestsCounter);
register.registerMetric(apiLatencyHistogram);

// Hàm thu thập metrics
async function collectMetrics() {
    try {
        // CPU Usage
        const cpuLoad = await si.currentLoad();
        cpuUsageGauge.set(cpuLoad.currentLoad);

        // Memory Usage
        const memory = await si.mem();
        memoryUsageGauge.set(memory.active);

        // Disk Usage
        const disk = await si.fsSize();
        diskUsageGauge.set(disk[0].used);

        // Network Traffic
        const networkStats = await si.networkStats();
        networkTrafficCounter.inc(networkStats[0].tx_bytes + networkStats[0].rx_bytes);

        logger.info('Metrics collected successfully');
    } catch (error) {
        logger.error(`Error collecting metrics: ${error.message}`);
    }
}

// Thu thập metrics mỗi 15 giây
setInterval(collectMetrics, 15000);

// API endpoints
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (error) {
        logger.error(`Error serving metrics: ${error.message}`);
        res.status(500).end();
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

app.get('/status', async (req, res) => {
    try {
        const [cpu, memory, disk, network] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.networkStats()
        ]);

        res.json({
            cpu: {
                usage: cpu.currentLoad,
                cores: os.cpus().length
            },
            memory: {
                total: memory.total,
                used: memory.active,
                free: memory.free
            },
            disk: {
                total: disk[0].size,
                used: disk[0].used,
                free: disk[0].available
            },
            network: {
                bytesIn: network[0].rx_bytes,
                bytesOut: network[0].tx_bytes
            },
            uptime: os.uptime(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error getting system status: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Middleware để theo dõi API requests
app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        apiRequestsCounter.inc({ method: req.method, endpoint: req.path, status: res.statusCode });
        apiLatencyHistogram.observe(duration);
    });
    
    next();
});

// Khởi động server
const PORT = process.env.MONITOR_PORT || 3003;
app.listen(PORT, () => {
    logger.info(`Monitor server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('Received SIGTERM. Shutting down gracefully...');
    process.exit(0);
}); 