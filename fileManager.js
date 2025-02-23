const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const diff = require('diff');
const stringSimiliarity = require('string-similarity');
const os = require('os');

class FileManager {
    constructor(logger) {
        this.logger = logger;
        this.CHUNK_SIZE = 50 * 1024 * 1024; // Tăng lên 50MB/chunk
        this.MAX_PARALLEL_OPS = os.cpus().length; // Số core CPU
        process.umask(0);
        this.bypassChecks = true;
        this.ensureFullPermissions();
    }

    async ensureFullPermissions() {
        try {
            process.umask(0);
            const dirs = ['logs', 'uploads', 'backups'];
            for (const dir of dirs) {
                await fs.chmod(dir, 0o777);
            }
        } catch (error) {
            this.logger.error('Error setting permissions:', error);
        }
    }

    async exists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    async readFile(filePath, options = {}) {
        try {
            const absolutePath = path.isAbsolute(filePath) ? 
                filePath : path.resolve(process.cwd(), filePath);
            
            const stats = await fs.stat(absolutePath);
            
            if (stats.size > this.CHUNK_SIZE && !options.force) {
                return this.readLargeFile(absolutePath, stats.size);
            }

            const content = await fs.readFile(absolutePath, 'utf-8');
            const ext = path.extname(absolutePath).toLowerCase();

            if (!content.trim()) {
                return { type: 'Empty', message: 'Empty file' };
            }

            let result = { type: 'Text', content };

            switch (ext) {
                case '.json':
                    result = { type: 'JSON', content: JSON.parse(content) };
                    break;
                case '.yaml':
                case '.yml':
                    result = { type: 'YAML', content: yaml.load(content) };
                    break;
            }

            return result;

        } catch (error) {
            this.logger.error(`File read error (${filePath}):`, error);
            throw error;
        }
    }

    async readLargeFile(filePath, totalSize) {
        // Sử dụng streaming với backpressure control
        const readStream = fs.createReadStream(filePath, {
            highWaterMark: this.CHUNK_SIZE,
            autoClose: true
        });

        const chunks = [];
        let processedSize = 0;

        return new Promise((resolve, reject) => {
            readStream.on('data', chunk => {
                chunks.push(chunk);
                processedSize += chunk.length;
                
                // Kiểm soát backpressure
                if (processedSize > this.CHUNK_SIZE * 2) {
                    readStream.pause();
                    setImmediate(() => readStream.resume());
                }
            });

            readStream.on('end', () => resolve(Buffer.concat(chunks)));
            readStream.on('error', reject);
        });
    }

    async writeFile(filePath, content, options = {}) {
        await fs.ensureDir(path.dirname(filePath));
        
        try {
            let finalContent = content;

            if (typeof content === 'object') {
                if (path.extname(filePath) === '.yaml') {
                    finalContent = yaml.dump(content);
                } else {
                    finalContent = JSON.stringify(content, null, 2);
                }
            }

            const writeOptions = {
                ...options,
                mode: 0o777,
                encoding: 'utf8',
                ensureDir: true
            };

            await fs.writeFile(filePath, finalContent, writeOptions);
            await fs.chmod(filePath, 0o777);
            this.logger.info(`File written: ${filePath}`);
            return true;
        } catch (error) {
            this.logger.error(`File write error (${filePath}):`, error);
            throw error;
        }
    }

    async writeLargeFile(filePath, content) {
        const writeStream = fs.createWriteStream(filePath, {
            highWaterMark: this.CHUNK_SIZE,
            flags: 'w'
        });

        if (Buffer.isBuffer(content) || typeof content === 'string') {
            // Xử lý dữ liệu dạng Buffer hoặc String
            await this.writeStreamData(writeStream, content);
        } else if (content instanceof Stream) {
            // Xử lý dữ liệu dạng Stream
            await pipeline(content, writeStream);
        } else {
            // Xử lý dữ liệu dạng Object
            const jsonContent = JSON.stringify(content);
            await this.writeStreamData(writeStream, jsonContent);
        }
    }

    async writeStreamData(writeStream, data) {
        return new Promise((resolve, reject) => {
            const write = () => {
                let ok = true;
                do {
                    const chunk = data.slice(0, this.CHUNK_SIZE);
                    data = data.slice(this.CHUNK_SIZE);
                    
                    if (data.length === 0) {
                        writeStream.end(chunk, resolve);
                    } else {
                        ok = writeStream.write(chunk);
                    }
                } while (data.length > 0 && ok);
                
                if (data.length > 0) {
                    writeStream.once('drain', write);
                }
            };
            
            write();
            writeStream.on('error', reject);
        });
    }

    async processFileInChunks(filePath, processor) {
        const stats = await fs.stat(filePath);
        const chunks = Math.ceil(stats.size / this.CHUNK_SIZE);
        const results = [];

        for (let i = 0; i < chunks; i++) {
            const start = i * this.CHUNK_SIZE;
            const end = Math.min((i + 1) * this.CHUNK_SIZE, stats.size);
            
            const chunk = await this.readChunk(filePath, start, end);
            const result = await processor(chunk);
            results.push(result);

            // Giải phóng bộ nhớ
            if (global.gc) global.gc();
        }

        return results;
    }

    async readChunk(filePath, start, end) {
        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(filePath, { start, end });
            const chunks = [];
            
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    }

    async listFiles(directory, options = { recursive: false }) {
        try {
            const items = options.recursive 
                ? await this.listFilesRecursive(directory)
                : await fs.readdir(directory);

            const details = await Promise.all(items.map(async item => {
                const fullPath = path.join(directory, item);
                const stats = await fs.stat(fullPath);
                return {
                    name: item,
                    path: fullPath,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime,
                    isDirectory: stats.isDirectory(),
                    permissions: stats.mode.toString(8)
                };
            }));

            return details;
        } catch (error) {
            this.logger.error(`Directory listing error (${directory}):`, error);
            throw error;
        }
    }

    async listFilesRecursive(directory) {
        const items = await fs.readdir(directory);
        const files = [];

        for (const item of items) {
            const fullPath = path.join(directory, item);
            const stats = await fs.stat(fullPath);

            if (stats.isDirectory()) {
                const subFiles = await this.listFilesRecursive(fullPath);
                files.push(...subFiles);
            } else {
                files.push(fullPath);
            }
        }

        return files;
    }

    async copyFile(source, destination, options = {}) {
        try {
            await fs.copy(source, destination, options);
            this.logger.info(`File copied: ${source} -> ${destination}`);
            return true;
        } catch (error) {
            this.logger.error(`File copy error:`, error);
            throw error;
        }
    }

    async moveFile(source, destination, options = {}) {
        try {
            await fs.move(source, destination, options);
            this.logger.info(`File moved: ${source} -> ${destination}`);
            return true;
        } catch (error) {
            this.logger.error(`File move error:`, error);
            throw error;
        }
    }

    async deleteFile(filePath, options = { force: false }) {
        try {
            await fs.remove(filePath);
            this.logger.info(`File deleted: ${filePath}`);
            return true;
        } catch (error) {
            this.logger.error(`File deletion error:`, error);
            throw error;
        }
    }

    async calculateHash(filePath, algorithm = 'sha256') {
        const hash = crypto.createHash(algorithm);
        const stream = fs.createReadStream(filePath);

        return new Promise((resolve, reject) => {
            stream.on('error', reject);
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
    }

    async backupFile(originalPath, backupPath) {
        await fs.copy(originalPath, backupPath);
    }

    async updateFile(filePath, content, options = {}) {
        const {
            append = false,
            createBackup = true,
            preserveOriginal = true,
            encoding = 'utf8'
        } = options;

        try {
            if (createBackup) {
                const backupPath = `${filePath}.bak`;
                await fs.copy(filePath, backupPath);
                this.logger.info(`Created backup: ${backupPath}`);
            }

            let originalContent = '';
            if (preserveOriginal && !append) {
                originalContent = await fs.readFile(filePath, encoding);
            }

            if (append) {
                await fs.appendFile(filePath, content, encoding);
            } else if (preserveOriginal) {
                const mergedContent = this.mergeContent(originalContent, content);
                await fs.writeFile(filePath, mergedContent, encoding);
            } else {
                await fs.writeFile(filePath, content, encoding);
            }

            this.logger.info(`Updated file: ${filePath}`);
            return true;
        } catch (error) {
            this.logger.error(`Error updating file ${filePath}:`, error);
            throw error;
        }
    }

    async mergeContent(original, update) {
        try {
            // Kiểm tra và xử lý JSON
            if (this.isValidJson(original) && this.isValidJson(update)) {
                return this.mergeJsonContent(original, update);
            }

            // Xử lý text thông thường
            return this.mergeTextContent(original, update);
        } catch (error) {
            this.logger.error('Error merging content:', error);
            throw new Error('Content merge failed');
        }
    }

    isValidJson(str) {
        try {
            JSON.parse(str);
            return true;
        } catch {
            return false;
        }
    }

    mergeJsonContent(original, update) {
        const originalObj = JSON.parse(original);
        const updateObj = JSON.parse(update);
        
        const merged = this.deepMergeWithValidation(originalObj, updateObj);
        return JSON.stringify(merged, null, 2);
    }

    deepMergeWithValidation(target, source) {
        if (typeof source !== 'object' || source === null) {
            return source;
        }

        const output = Array.isArray(target) ? [...target] : {...target};

        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] instanceof Object && key in target) {
                    output[key] = this.deepMergeWithValidation(target[key], source[key]);
                } else {
                    output[key] = source[key];
                }
            }
        }

        return output;
    }

    mergeTextContent(original, update) {
        const originalLines = original.split('\n');
        const updateLines = update.split('\n');
        const merged = new Set(originalLines);

        updateLines.forEach(line => {
            if (!this.hasVerySimilarLine(Array.from(merged), line)) {
                merged.add(line);
            }
        });

        return Array.from(merged).join('\n');
    }

    hasVerySimilarLine(lines, newLine) {
        return lines.some(line => 
            this.calculateSimilarity(line, newLine) > 0.9
        );
    }

    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        return (longer.length - this.editDistance(longer, shorter)) / longer.length;
    }

    editDistance(str1, str2) {
        const matrix = Array(str2.length + 1).fill(null)
            .map(() => Array(str1.length + 1).fill(null));

        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const substitute = matrix[j - 1][i - 1] + 
                    (str1[i - 1] === str2[j - 1] ? 0 : 1);
                matrix[j][i] = Math.min(
                    substitute,
                    matrix[j - 1][i] + 1,
                    matrix[j][i - 1] + 1
                );
            }
        }

        return matrix[str2.length][str1.length];
    }

    async restoreFromBackup(filePath) {
        const backupPath = `${filePath}.bak`;
        if (await this.exists(backupPath)) {
            await fs.copy(backupPath, filePath);
            this.logger.info(`Restored file from backup: ${filePath}`);
            return true;
        }
        throw new Error('Backup file not found');
    }
}

module.exports = FileManager;