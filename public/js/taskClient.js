class TaskClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
        this.socket = io();
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('task:update', (data) => {
            console.log('Task update:', data);
            // Trigger custom event
            const event = new CustomEvent('taskUpdate', { detail: data });
            window.dispatchEvent(event);
        });
    }

    async executeCommand(command, options = {}) {
        try {
            // 1. Start task
            const response = await fetch(`${this.baseUrl}/api/tasks/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ command, ...options })
            });
            
            const { taskId } = await response.json();
            
            // 2. Subscribe to updates
            this.socket.emit('subscribe:task', taskId);
            
            // 3. Setup polling
            return this.pollTaskStatus(taskId, options.timeout);
        } catch (error) {
            console.error('Execute command error:', error);
            throw error;
        }
    }

    async pollTaskStatus(taskId, timeout = 30000) {
        const startTime = Date.now();
        
        const checkStatus = async () => {
            const response = await fetch(`${this.baseUrl}/api/tasks/${taskId}/status`);
            const status = await response.json();

            if (status.status === 'completed') {
                this.socket.emit('unsubscribe:task', taskId);
                return status.result;
            }

            if (status.status === 'failed') {
                this.socket.emit('unsubscribe:task', taskId);
                throw new Error(status.error);
            }

            if (Date.now() - startTime > timeout) {
                this.socket.emit('unsubscribe:task', taskId);
                throw new Error('Task timeout');
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
            return checkStatus();
        };

        return checkStatus();
    }

    async stopTask(taskId) {
        const response = await fetch(`${this.baseUrl}/api/tasks/${taskId}/stop`, {
            method: 'POST'
        });
        return response.json();
    }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaskClient;
} else {
    window.TaskClient = TaskClient;
}
