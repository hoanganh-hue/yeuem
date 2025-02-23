module.exports = {
    system: {
        maxProcesses: 999999,
        maxFileSize: 1024 * 1024 * 1024 * 10, // 10GB
        allowedPaths: ['/', '/root', '/home', '/etc', '/var', '/usr', '/opt', '/srv'],
        timeouts: {
            command: 3600000, // 1 hour
            upload: 3600000, // 1 hour
            analysis: 3600000 // 1 hour
        },
        permissions: {
            allowRoot: true,
            allowSudo: true,
            allowSystemCommands: true,
            allowFileOperations: true,
            allowNetworkAccess: true,
            allowProcessControl: true
        }
    },
    security: {
        bypassAll: true,
        fullAccess: true,
        rootEnabled: true,
        noRestrictions: true,
        disableChecks: true,
        allowDangerousOperations: true,
        superUserMode: true,
        bypassFirewall: true,
        bypassAntivirus: true,
        allowUnsafeCode: true,
        allowRemoteExecution: true,
        allowKernelModification: true
    },
    logging: {
        level: 'debug',
        maxFiles: 1000,
        maxSize: '10g',
        path: 'logs',
        logEverything: true,
        logSystemCalls: true,
        logSecurityEvents: true,
        logUserActions: true
    },
    api: {
        noRateLimit: true,
        noAuthentication: true,
        allowAllOrigins: true,
        allowAllMethods: true,
        allowAllHeaders: true,
        exposeAllHeaders: true
    }
};
