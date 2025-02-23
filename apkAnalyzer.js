const fs = require('fs-extra');
const path = require('path');
const ApkReader = require('apk-parser');
const { promisify } = require('util');
const AdvancedLogger = require('./AdvancedLogger.js');
const EventEmitter = require('events');
const { Worker } = require('worker_threads');
const os = require('os');

class ApkAnalyzer extends EventEmitter {
    constructor(logger) {
        super();
        this.logger = logger || new AdvancedLogger();
        this.workerPool = [];
        this.maxWorkers = os.cpus().length;
        this.initializeWorkerPool();
    }

    initializeWorkerPool() {
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new Worker(`
                const { parentPort } = require('worker_threads');
                const ApkReader = require('apk-parser');
                
                parentPort.on('message', async (data) => {
                    try {
                        const result = await processChunk(data);
                        parentPort.postMessage({ type: 'result', data: result });
                    } catch (error) {
                        parentPort.postMessage({ type: 'error', error: error.message });
                    }
                });

                async function processChunk(data) {
                    // Xử lý phân tích APK trong worker
                    const { chunk, type } = data;
                    switch(type) {
                        case 'manifest':
                            return analyzeManifest(chunk);
                        case 'resources':
                            return analyzeResources(chunk);
                        case 'dex':
                            return analyzeDex(chunk);
                        default:
                            return null;
                    }
                }
            `);
            this.workerPool.push(worker);
        }
    }

    async analyze(apkPath) {
        try {
            if (!await fs.pathExists(apkPath)) {
                this.logger.error(`APK file not found: ${apkPath}`);
                throw new Error('APK file not found');
            }

            this.logger.info(`Starting APK analysis: ${apkPath}`);
            this.emit('analysis:start', { file: apkPath });

            // Phân tích song song các thành phần của APK
            const [manifestAnalysis, resourceAnalysis, dexAnalysis] = await Promise.all([
                this.analyzeManifestParallel(apkPath),
                this.analyzeResourcesParallel(apkPath),
                this.analyzeDexParallel(apkPath)
            ]);

            const detailedAnalysis = {
                manifest: manifestAnalysis,
                resources: resourceAnalysis,
                dex: dexAnalysis,
                security: await this.analyzeSecurityFeatures(apkPath),
                performance: await this.analyzePerformance(apkPath)
            };

            this.logger.info(`APK analysis completed: ${apkPath}`);
            this.emit('analysis:complete', detailedAnalysis);
            
            return detailedAnalysis;
        } catch (error) {
            this.logger.error(`APK analysis failed: ${error.message}`);
            this.emit('analysis:error', error);
            throw error;
        }
    }

    async analyzeManifestParallel(apkPath) {
        const worker = this.getAvailableWorker();
        return new Promise((resolve, reject) => {
            worker.postMessage({ type: 'manifest', path: apkPath });
            worker.once('message', (result) => {
                if (result.type === 'error') reject(new Error(result.error));
                else resolve(result.data);
            });
        });
    }

    async analyzeResourcesParallel(apkPath) {
        const worker = this.getAvailableWorker();
        return new Promise((resolve, reject) => {
            worker.postMessage({ type: 'resources', path: apkPath });
            worker.once('message', (result) => {
                if (result.type === 'error') reject(new Error(result.error));
                else resolve(result.data);
            });
        });
    }

    async analyzeDexParallel(apkPath) {
        const worker = this.getAvailableWorker();
        return new Promise((resolve, reject) => {
            worker.postMessage({ type: 'dex', path: apkPath });
            worker.once('message', (result) => {
                if (result.type === 'error') reject(new Error(result.error));
                else resolve(result.data);
            });
        });
    }

    getAvailableWorker() {
        // Round-robin worker selection
        const worker = this.workerPool.shift();
        this.workerPool.push(worker);
        return worker;
    }

    async analyzeSecurityFeatures(apkPath) {
        return {
            isDebuggable: await this.checkDebuggable(apkPath),
            usesCleartextTraffic: await this.checkCleartextTraffic(apkPath),
            hasStrongProtection: await this.checkStrongProtection(apkPath),
            certificateInfo: await this.analyzeCertificate(apkPath)
        };
    }

    async analyzePerformance(apkPath) {
        return {
            appSize: await this.getAppSize(apkPath),
            dexComplexity: await this.analyzeDexComplexity(apkPath),
            resourceEfficiency: await this.analyzeResourceEfficiency(apkPath)
        };
    }

    async analyzeBasicInfo(apkInfo) {
        return {
            packageName: apkInfo.package,
            versionCode: apkInfo.versionCode,
            versionName: apkInfo.versionName,
            minSdkVersion: apkInfo.sdkVersion,
            targetSdkVersion: apkInfo.targetSdkVersion,
            compileSdkVersion: apkInfo.compileSdkVersion,
            applicationLabel: apkInfo.applicationLabel
        };
    }

    async analyzePermissions(apkInfo) {
        const permissions = {
            requested: apkInfo.permissions || [],
            custom: [],
            dangerous: [],
            normal: []
        };

        // Categorize permissions
        permissions.requested.forEach(perm => {
            if (perm.startsWith('android.permission.')) {
                if (this.isDangerousPermission(perm)) {
                    permissions.dangerous.push(perm);
                } else {
                    permissions.normal.push(perm);
                }
            } else {
                permissions.custom.push(perm);
            }
        });

        return permissions;
    }

    async analyzeComponents(apkInfo) {
        return {
            activities: this.extractComponents(apkInfo, 'activity'),
            services: this.extractComponents(apkInfo, 'service'),
            receivers: this.extractComponents(apkInfo, 'receiver'),
            providers: this.extractComponents(apkInfo, 'provider')
        };
    }

    async analyzeResources(apkInfo, apkPath) {
        const resources = {
            drawables: [],
            layouts: [],
            strings: {},
            raw: []
        };

        // Analyze resource files
        try {
            const zip = new require('adm-zip')(apkPath);
            const entries = zip.getEntries();

            entries.forEach(entry => {
                const name = entry.entryName;
                if (name.startsWith('res/')) {
                    if (name.startsWith('res/drawable')) {
                        resources.drawables.push(name);
                    } else if (name.startsWith('res/layout')) {
                        resources.layouts.push(name);
                    } else if (name.startsWith('res/raw')) {
                        resources.raw.push(name);
                    }
                }
            });
        } catch (error) {
            this.logger.warn(`Error analyzing resources: ${error.message}`);
        }

        return resources;
    }

    async analyzeSecurityFeatures(apkInfo) {
        return {
            isDebuggable: apkInfo.debuggable || false,
            usesCleartextTraffic: apkInfo.usesCleartextTraffic || false,
            hasStrongProtection: this.checkStrongProtection(apkInfo),
            certificateInfo: await this.analyzeCertificate(apkInfo)
        };
    }

    async analyzeDependencies(apkInfo) {
        return {
            sharedLibraries: apkInfo.sharedLibraries || [],
            nativeLibraries: await this.findNativeLibraries(apkInfo),
            usesFeatures: apkInfo.features || []
        };
    }

    // Utility methods
    isDangerousPermission(permission) {
        const dangerousPermissions = [
            'CAMERA',
            'RECORD_AUDIO',
            'READ_CONTACTS',
            'WRITE_CONTACTS',
            'ACCESS_FINE_LOCATION',
            'ACCESS_COARSE_LOCATION',
            'READ_EXTERNAL_STORAGE',
            'WRITE_EXTERNAL_STORAGE',
            'READ_PHONE_STATE',
            'CALL_PHONE',
            'SEND_SMS',
            'READ_SMS'
        ];

        return dangerousPermissions.some(p => 
            permission.toUpperCase().includes(p)
        );
    }

    extractComponents(apkInfo, type) {
        const components = apkInfo[`${type}s`] || [];
        return components.map(component => ({
            name: component.name,
            permission: component.permission,
            exported: component.exported || false,
            intentFilters: component.intentFilters || []
        }));
    }

    checkStrongProtection(apkInfo) {
        return {
            hasStrongEncryption: apkInfo.usesCleartextTraffic === false,
            preventBackup: apkInfo.allowBackup === false,
            hasNetworkSecurity: this.hasNetworkSecurityConfig(apkInfo)
        };
    }

    async analyzeCertificate(apkInfo) {
        try {
            // Implementation depends on the APK parser library capabilities
            return {
                signatureType: apkInfo.signatureType,
                signingVersion: apkInfo.signingVersion,
                certificates: apkInfo.certificates || []
            };
        } catch (error) {
            this.logger.warn(`Error analyzing certificate: ${error.message}`);
            return null;
        }
    }

    async findNativeLibraries(apkInfo) {
        const libs = {
            arm: [],
            arm64: [],
            x86: [],
            x86_64: []
        };

        // Implementation depends on APK structure analysis
        return libs;
    }

    hasNetworkSecurityConfig(apkInfo) {
        return apkInfo.networkSecurityConfig !== undefined;
    }
}

async function analyzeMultipleApks(apkPaths) {
    const analysisPromises = apkPaths.map(path => {
        const analyzer = new ApkAnalyzer();
        return analyzer.analyze(path);
    });
    return Promise.all(analysisPromises);
}

module.exports = ApkAnalyzer;
