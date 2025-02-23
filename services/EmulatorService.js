const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class EmulatorService {
    constructor(logger) {
        this.logger = logger;
    }

    async executeAdbCommand(command, emulatorSerial) {
        const adbCommand = emulatorSerial ? 
            `adb -s ${emulatorSerial} ${command}` : 
            `adb ${command}`;

        try {
            const { stdout, stderr } = await execAsync(adbCommand);
            return { output: stdout, error: stderr };
        } catch (error) {
            this.logger.error(`ADB execution error: ${error.message}`);
            throw error;
        }
    }

    async checkEmulatorStatus(serial) {
        const { stdout } = await execAsync('adb devices');
        const lines = stdout.split('\n');
        const devices = lines
            .slice(1)
            .filter(line => line.trim())
            .map(line => {
                const [deviceId, status] = line.split('\t');
                return {
                    serial: deviceId.trim(),
                    status: status.trim(),
                    isTarget: deviceId.trim() === serial
                };
            });

        return {
            devices,
            targetDevice: devices.find(d => d.isTarget) || null
        };
    }
}

module.exports = EmulatorService;
