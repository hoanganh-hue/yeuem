const EventEmitter = require('events');
const crypto = require('crypto');

class TaskManager extends EventEmitter {
    constructor(logger) {
        super();
        this.logger = logger;
        this.tasks = new Map();
        this.taskResults = new Map();
        this.taskTimeouts = new Map();
    }

    createTask(type, data) {
        const taskId = crypto.randomUUID();
        const task = {
            id: taskId,
            type,
            data,
            status: 'pending',
            startTime: Date.now(),
            progress: 0,
            result: null,
            error: null
        };
        
        this.tasks.set(taskId, task);
        return taskId;
    }

    updateTask(taskId, updates) {
        const task = this.tasks.get(taskId);
        if (task) {
            Object.assign(task, updates);
            this.emit('taskUpdate', task);
            return true;
        }
        return false;
    }

    async waitForTask(taskId, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const task = this.tasks.get(taskId);
            if (!task) {
                return reject(new Error('Task not found'));
            }

            if (task.status === 'completed') {
                return resolve(task.result);
            }

            if (task.status === 'failed') {
                return reject(task.error);
            }

            const timeoutId = setTimeout(() => {
                this.removeListener('taskUpdate', checkStatus);
                reject(new Error('Task timeout'));
            }, timeout);

            const checkStatus = (updatedTask) => {
                if (updatedTask.id === taskId) {
                    if (updatedTask.status === 'completed') {
                        clearTimeout(timeoutId);
                        this.removeListener('taskUpdate', checkStatus);
                        resolve(updatedTask.result);
                    } else if (updatedTask.status === 'failed') {
                        clearTimeout(timeoutId);
                        this.removeListener('taskUpdate', checkStatus);
                        reject(updatedTask.error);
                    }
                }
            };

            this.on('taskUpdate', checkStatus);
        });
    }

    getTaskStatus(taskId) {
        return this.tasks.get(taskId);
    }
}

module.exports = TaskManager;
