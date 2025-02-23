const { Worker } = require('worker_threads');
const path = require('path');

class BackgroundWorker {
    constructor(logger, taskManager) {
        this.logger = logger;
        this.taskManager = taskManager;
        this.workers = new Map();
    }

    async executeTask(taskType, taskData) {
        const taskId = this.taskManager.createTask(taskType, taskData);
        
        const worker = new Worker(path.join(__dirname, 'workers', `${taskType}Worker.js`), {
            workerData: { taskId, taskData }
        });

        this.workers.set(taskId, worker);

        worker.on('message', (message) => {
            if (message.type === 'progress') {
                this.taskManager.updateTask(taskId, {
                    progress: message.progress,
                    status: 'running'
                });
            } else if (message.type === 'complete') {
                this.taskManager.updateTask(taskId, {
                    status: 'completed',
                    result: message.result,
                    endTime: Date.now()
                });
                this.workers.delete(taskId);
            }
        });

        worker.on('error', (error) => {
            this.taskManager.updateTask(taskId, {
                status: 'failed',
                error: error.message,
                endTime: Date.now()
            });
            this.workers.delete(taskId);
        });

        return taskId;
    }

    async stopTask(taskId) {
        const worker = this.workers.get(taskId);
        if (worker) {
            worker.terminate();
            this.workers.delete(taskId);
            this.taskManager.updateTask(taskId, {
                status: 'stopped',
                endTime: Date.now()
            });
            return true;
        }
        return false;
    }
}

module.exports = BackgroundWorker;
