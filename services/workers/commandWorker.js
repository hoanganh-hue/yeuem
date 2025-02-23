const { parentPort, workerData } = require('worker_threads');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function executeCommand(command) {
    try {
        const { stdout, stderr } = await execAsync(command, {
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        });

        return {
            success: true,
            stdout,
            stderr
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            stderr: error.stderr
        };
    }
}

async function run() {
    const { taskId, taskData } = workerData;
    const { command } = taskData;

    try {
        // Báo cáo tiến độ
        parentPort.postMessage({
            type: 'progress',
            progress: 10,
            message: 'Starting command execution'
        });

        const result = await executeCommand(command);

        // Kiểm tra kết quả và retry nếu cần
        if (!result.success && !result.error.includes('permission denied')) {
            // Thử lại sau 5 giây
            await new Promise(resolve => setTimeout(resolve, 5000));
            const retryResult = await executeCommand(command);
            
            if (retryResult.success) {
                parentPort.postMessage({
                    type: 'complete',
                    result: retryResult
                });
                return;
            }
        }

        parentPort.postMessage({
            type: 'complete',
            result
        });

    } catch (error) {
        parentPort.postMessage({
            type: 'error',
            error: error.message
        });
    }
}

run();
