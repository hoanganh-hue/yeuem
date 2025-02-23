const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');
const AdvancedLogger = require('./AdvancedLogger.js'); // Ensure logger is imported

class FileAnalyzer extends EventEmitter {
    constructor(logger) {
        super();
        if (!logger) {
            throw new Error('Logger is required');
        }
        this.logger = logger;
        this.CHUNK_SIZE = 1024 * 1024; // 1MB chunks for stream processing
        this.supportedFormats = {
            // Code files
            '.js': (filePath) => this.analyzeJavaScript(filePath),
            '.py': (filePath) => this.analyzePython(filePath),
            '.java': (filePath) => this.analyzeJava(filePath),
            '.cpp': (filePath) => this.analyzeCpp(filePath),
            '.cs': (filePath) => this.analyzeCSharp(filePath),
            
            // Data files
            '.json': (filePath) => this.analyzeJson(filePath),
            '.xml': (filePath) => this.analyzeXml(filePath),
            '.yaml': (filePath) => this.analyzeYaml(filePath),
            '.csv': (filePath) => this.analyzeCsv(filePath),
            
            // Document files
            '.md': (filePath) => this.analyzeMarkdown(filePath),
            '.txt': (filePath) => this.analyzeText(filePath),
            '.doc': (filePath) => this.analyzeWord(filePath),
            '.pdf': (filePath) => this.analyzePdf(filePath),
            
            // Binary files
            '.exe': (filePath) => this.analyzeBinary(filePath),
            '.dll': (filePath) => this.analyzeBinary(filePath),
            '.so': (filePath) => this.analyzeBinary(filePath),
            
            // Archive files
            '.zip': (filePath) => this.analyzeArchive(filePath),
            '.tar': (filePath) => this.analyzeArchive(filePath),
            '.gz': (filePath) => this.analyzeArchive(filePath),
            
            // Image files
            '.jpg': (filePath) => this.analyzeImage(filePath),
            '.png': (filePath) => this.analyzeImage(filePath),
            '.gif': (filePath) => this.analyzeImage(filePath),
            
            // Database files
            '.db': (filePath) => this.analyzeDatabase(filePath),
            '.sqlite': (filePath) => this.analyzeDatabase(filePath)
        };
    }

    async analyzeFile(filePath, options = {}) {
        try {
            if (!await fs.exists(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            const stats = await fs.stat(filePath);
            const ext = path.extname(filePath).toLowerCase();
            
            // Kiểm tra kích thước file
            if (stats.size > 100 * 1024 * 1024) { // 100MB
                return this.analyzeLargeFile(filePath, ext, stats);
            }

            // Basic analysis for all files
            const basicAnalysis = {
                fileType: this.getFileType(ext),
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                permissions: stats.mode.toString(8),
                hash: await this.calculateHash(filePath)
            };

            // Specific analysis based on file type
            if (this.supportedFormats[ext]) {
                try {
                    const specificAnalysis = await this.supportedFormats[ext](filePath);
                    return { ...basicAnalysis, ...specificAnalysis };
                } catch (error) {
                    this.logger.warn(`Specific analysis failed for ${filePath}: ${error.message}`);
                    return basicAnalysis;
                }
            }

            return basicAnalysis;
        } catch (error) {
            this.logger.error(`Error analyzing file: ${error.message}`);
            throw error;
        }
    }

    async analyzeLargeFile(filePath, ext, stats) {
        const stream = fs.createReadStream(filePath, {
            highWaterMark: this.CHUNK_SIZE
        });

        return new Promise((resolve, reject) => {
            let processedSize = 0;
            const analyzer = new StreamAnalyzer();

            stream.on('data', chunk => {
                try {
                    processedSize += chunk.length;
                    analyzer.processChunk(chunk);
                    
                    this.emit('progress', {
                        processed: processedSize,
                        percentage: (processedSize / stats.size * 100).toFixed(2)
                    });
                } catch (error) {
                    stream.destroy();
                    reject(error);
                }
            });

            stream.on('end', () => {
                resolve(analyzer.getResults());
            });

            stream.on('error', error => {
                this.logger.error(`Stream error: ${error.message}`);
                reject(error);
            });

            // Cleanup on timeout
            setTimeout(() => {
                stream.destroy();
                reject(new Error('Analysis timeout'));
            }, 300000); // 5 minutes timeout
        });
    }

    isTextFile(ext) {
        const textExtensions = ['.txt', '.md', '.js', '.py', '.java', '.cpp', '.cs', '.json', '.xml', '.yaml', '.yml', '.csv'];
        return textExtensions.includes(ext);
    }

    getFileType(ext) {
        const types = {
            '.txt': 'text/plain',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.yml': 'application/yaml',
            '.yaml': 'application/yaml',
            '.xml': 'application/xml',
            '.csv': 'text/csv',
            '.md': 'text/markdown',
            '.jpg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.pdf': 'application/pdf',
            '.zip': 'application/zip',
            '.tar': 'application/x-tar',
            '.gz': 'application/gzip'
        };
        return types[ext] || 'application/octet-stream';
    }

    async calculateHash(filePath) {
        const content = await fs.readFile(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    // Basic text file analysis
    async analyzeText(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        return {
            type: 'Text',
            stats: {
                lines: content.split('\n').length,
                words: content.split(/\s+/).length,
                chars: content.length
            }
        };
    }

    // JSON analysis
    async analyzeJson(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        const json = JSON.parse(content);
        return {
            type: 'JSON',
            structure: this.analyzeJsonStructure(json)
        };
    }

    analyzeJsonStructure(json, depth = 0, maxDepth = 3) {
        if (depth >= maxDepth) return 'Max depth reached';
        
        if (Array.isArray(json)) {
            return {
                type: 'array',
                length: json.length,
                sample: json.slice(0, 3).map(item => 
                    this.analyzeJsonStructure(item, depth + 1, maxDepth)
                )
            };
        }
        
        if (typeof json === 'object' && json !== null) {
            const structure = {};
            for (const [key, value] of Object.entries(json)) {
                structure[key] = this.analyzeJsonStructure(value, depth + 1, maxDepth);
            }
            return structure;
        }
        
        return typeof json;
    }

    // Binary file analysis
    async analyzeBinary(filePath) {
        const stats = await fs.stat(filePath);
        const header = await this.readFileHeader(filePath);
        return {
            type: 'Binary',
            size: stats.size,
            header: header.toString('hex')
        };
    }

    async readFileHeader(filePath, size = 256) {
        const buffer = Buffer.alloc(size);
        const fd = await fs.open(filePath, 'r');
        await fs.read(fd, buffer, 0, size, 0);
        await fs.close(fd);
        return buffer;
    }

    // Image analysis
    async analyzeImage(filePath) {
        const stats = await fs.stat(filePath);
        return {
            type: 'Image',
            size: stats.size,
            format: path.extname(filePath).slice(1).toUpperCase()
        };
    }

    // Archive analysis
    async analyzeArchive(filePath) {
        const stats = await fs.stat(filePath);
        return {
            type: 'Archive',
            size: stats.size,
            format: path.extname(filePath).slice(1).toUpperCase()
        };
    }

    // Database analysis
    async analyzeDatabase(filePath) {
        const stats = await fs.stat(filePath);
        return {
            type: 'Database',
            size: stats.size,
            format: path.extname(filePath).slice(1).toUpperCase()
        };
    }

    // Phân tích các loại file cụ thể
    async analyzeJavaScript(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        try {
            const parser = require('@babel/parser');
            const traverse = require('@babel/traverse').default;
            const ast = parser.parse(content, {
                sourceType: 'module',
                plugins: ['jsx', 'typescript', 'classProperties', 'decorators-legacy']
            });

            const analysis = {
                type: 'JavaScript',
                imports: [],
                exports: [],
                functions: [],
                classes: [],
                variables: [],
                dependencies: new Set()
            };

            traverse(ast, {
                ImportDeclaration(path) {
                    analysis.imports.push({
                        source: path.node.source.value,
                        specifiers: path.node.specifiers.map(spec => spec.local.name)
                    });
                    analysis.dependencies.add(path.node.source.value);
                },
                ExportDefaultDeclaration(path) {
                    analysis.exports.push({
                        type: 'default',
                        name: path.node.declaration.name
                    });
                },
                ExportNamedDeclaration(path) {
                    if (path.node.declaration) {
                        analysis.exports.push({
                            type: 'named',
                            name: path.node.declaration.declarations?.[0]?.id?.name
                        });
                    }
                },
                FunctionDeclaration(path) {
                    analysis.functions.push({
                        name: path.node.id.name,
                        params: path.node.params.map(p => p.name),
                        async: path.node.async,
                        generator: path.node.generator
                    });
                },
                ClassDeclaration(path) {
                    const methods = path.node.body.body
                        .filter(node => node.type === 'ClassMethod')
                        .map(node => ({
                            name: node.key.name,
                            kind: node.kind,
                            static: node.static,
                            async: node.async
                        }));

                    analysis.classes.push({
                        name: path.node.id.name,
                        superClass: path.node.superClass?.name,
                        methods
                    });
                },
                VariableDeclaration(path) {
                    path.node.declarations.forEach(decl => {
                        analysis.variables.push({
                            name: decl.id.name,
                            kind: path.node.kind
                        });
                    });
                }
            });

            analysis.dependencies = Array.from(analysis.dependencies);
            return analysis;

        } catch (error) {
            this.logger.warn(`Advanced JavaScript analysis failed, falling back to basic analysis: ${error.message}`);
            return this.analyzeBasicText(content, 'JavaScript');
        }
    }

    async analyzePython(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        try {
            const pythonParser = require('python-ast');
            const ast = pythonParser.parse(content);

            const analysis = {
                type: 'Python',
                imports: [],
                functions: [],
                classes: [],
                variables: [],
                dependencies: new Set()
            };

            // Phân tích AST
            const visitNode = (node) => {
                switch (node.type) {
                    case 'Import':
                        node.names.forEach(name => {
                            analysis.imports.push(name.name);
                            analysis.dependencies.add(name.name);
                        });
                        break;
                    case 'ImportFrom':
                        analysis.imports.push({
                            module: node.module,
                            names: node.names.map(n => n.name)
                        });
                        analysis.dependencies.add(node.module);
                        break;
                    case 'FunctionDef':
                        analysis.functions.push({
                            name: node.name,
                            args: node.args.args.map(arg => arg.arg),
                            decorators: node.decorator_list.map(dec => dec.id.name)
                        });
                        break;
                    case 'ClassDef':
                        analysis.classes.push({
                            name: node.name,
                            bases: node.bases.map(base => base.id.name),
                            decorators: node.decorator_list.map(dec => dec.id.name)
                        });
                        break;
                    case 'Assign':
                        node.targets.forEach(target => {
                            if (target.id) {
                                analysis.variables.push(target.id.name);
                            }
                        });
                        break;
                }

                // Duyệt đệ quy
                for (const key in node) {
                    if (node[key] && typeof node[key] === 'object') {
                        if (Array.isArray(node[key])) {
                            node[key].forEach(child => {
                                if (child && typeof child === 'object') {
                                    visitNode(child);
                                }
                            });
                        } else {
                            visitNode(node[key]);
                        }
                    }
                }
            };

            visitNode(ast);
            analysis.dependencies = Array.from(analysis.dependencies);
            return analysis;

        } catch (error) {
            this.logger.warn(`Advanced Python analysis failed, falling back to basic analysis: ${error.message}`);
            return this.analyzeBasicText(content, 'Python');
        }
    }

    async analyzeJava(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        return {
            type: 'Java',
            stats: {
                lines: content.split('\n').length,
                words: content.split(/\s+/).length,
                chars: content.length
            }
        };
    }

    async analyzeCpp(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        return {
            type: 'C++',
            stats: {
                lines: content.split('\n').length,
                words: content.split(/\s+/).length,
                chars: content.length
            }
        };
    }

    async analyzeCSharp(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        return {
            type: 'C#',
            stats: {
                lines: content.split('\n').length,
                words: content.split(/\s+/).length,
                chars: content.length
            }
        };
    }

    async analyzeXml(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        try {
            const xml2js = require('xml2js');
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(content);

            const analysis = {
                type: 'XML',
                structure: this.analyzeXmlStructure(result),
                stats: {
                    elements: this.countXmlElements(result),
                    attributes: this.countXmlAttributes(result),
                    depth: this.calculateXmlDepth(result)
                }
            };

            return analysis;
        } catch (error) {
            this.logger.warn(`XML parsing failed, falling back to basic analysis: ${error.message}`);
            return this.analyzeBasicText(content, 'XML');
        }
    }

    analyzeXmlStructure(obj, depth = 0, maxDepth = 3) {
        if (depth >= maxDepth) return 'Max depth reached';
        
        if (Array.isArray(obj)) {
            return obj.slice(0, 3).map(item => this.analyzeXmlStructure(item, depth + 1, maxDepth));
        }
        
        if (typeof obj === 'object' && obj !== null) {
            const structure = {};
            for (const [key, value] of Object.entries(obj)) {
                structure[key] = this.analyzeXmlStructure(value, depth + 1, maxDepth);
            }
            return structure;
        }
        
        return typeof obj;
    }

    countXmlElements(obj) {
        let count = 0;
        const traverse = (o) => {
            if (Array.isArray(o)) {
                o.forEach(item => traverse(item));
            } else if (typeof o === 'object' && o !== null) {
                count++;
                Object.values(o).forEach(value => traverse(value));
            }
        };
        traverse(obj);
        return count;
    }

    countXmlAttributes(obj) {
        let count = 0;
        const traverse = (o) => {
            if (Array.isArray(o)) {
                o.forEach(item => traverse(item));
            } else if (typeof o === 'object' && o !== null) {
                if (o.$ && typeof o.$ === 'object') {
                    count += Object.keys(o.$).length;
                }
                Object.values(o).forEach(value => traverse(value));
            }
        };
        traverse(obj);
        return count;
    }

    calculateXmlDepth(obj) {
        const getDepth = (o) => {
            if (!o || typeof o !== 'object') return 0;
            if (Array.isArray(o)) {
                return Math.max(0, ...o.map(item => getDepth(item)));
            }
            return 1 + Math.max(0, ...Object.values(o).map(value => getDepth(value)));
        };
        return getDepth(obj);
    }

    async analyzeYaml(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        return {
            type: 'YAML',
            stats: {
                lines: content.split('\n').length,
                words: content.split(/\s+/).length,
                chars: content.length
            }
        };
    }

    async analyzeCsv(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        try {
            const papa = require('papaparse');
            const result = papa.parse(content, {
                header: true,
                skipEmptyLines: true
            });

            const analysis = {
                type: 'CSV',
                structure: {
                    headers: result.meta.fields,
                    rowCount: result.data.length,
                    columnCount: result.meta.fields.length
                },
                stats: {
                    lines: content.split('\n').length,
                    delimiter: result.meta.delimiter
                },
                sample: result.data.slice(0, 5)
            };

            // Phân tích kiểu dữ liệu của từng cột
            analysis.columnTypes = {};
            result.meta.fields.forEach(field => {
                const values = result.data.map(row => row[field]).filter(v => v !== null && v !== undefined);
                analysis.columnTypes[field] = this.inferColumnType(values);
            });

            return analysis;
        } catch (error) {
            this.logger.warn(`CSV parsing failed, falling back to basic analysis: ${error.message}`);
            return this.analyzeBasicText(content, 'CSV');
        }
    }

    inferColumnType(values) {
        const types = values.map(value => {
            if (!isNaN(value) && value !== '') return 'number';
            if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
            if (/^(true|false)$/i.test(value)) return 'boolean';
            return 'string';
        });

        const uniqueTypes = [...new Set(types)];
        return uniqueTypes.length === 1 ? uniqueTypes[0] : 'mixed';
    }

    async analyzeMarkdown(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        return {
            type: 'Markdown',
            stats: {
                lines: content.split('\n').length,
                words: content.split(/\s+/).length,
                chars: content.length
            }
        };
    }

    async analyzeWord(filePath) {
        const stats = await fs.stat(filePath);
        return {
            type: 'Word Document',
            size: stats.size
        };
    }

    async analyzePdf(filePath) {
        const stats = await fs.stat(filePath);
        return {
            type: 'PDF',
            size: stats.size
        };
    }

    // Phân tích cơ bản cho text
    analyzeBasicText(content, type) {
        return {
            type,
            stats: {
                lines: content.split('\n').length,
                words: content.split(/\s+/).length,
                chars: content.length
            }
        };
    }
}

// Lớp phân tích stream cho file lớn
class StreamAnalyzer {
    constructor() {
        this.stats = {
            totalSize: 0,
            chunks: 0,
            lineCount: 0,
            wordCount: 0,
            charCount: 0,
            binaryStats: {
                nullBytes: 0,
                textBytes: 0,
                controlBytes: 0
            }
        };
    }

    processChunk(chunk) {
        this.stats.totalSize += chunk.length;
        this.stats.chunks++;

        // Phân tích binary/text
        for (let i = 0; i < chunk.length; i++) {
            const byte = chunk[i];
            if (byte === 0) this.stats.binaryStats.nullBytes++;
            else if (byte >= 32 && byte <= 126) this.stats.binaryStats.textBytes++;
            else this.stats.binaryStats.controlBytes++;
        }

        // Đếm dòng và từ nếu là text
        const text = chunk.toString('utf8');
        this.stats.lineCount += (text.match(/\n/g) || []).length;
        this.stats.wordCount += (text.match(/\S+/g) || []).length;
        this.stats.charCount += text.length;
    }

    getResults() {
        return {
            type: this.inferFileType(),
            stats: this.stats,
            analysis: {
                isBinary: this.isBinary(),
                encoding: this.inferEncoding(),
                confidence: this.calculateConfidence()
            }
        };
    }

    isBinary() {
        const textRatio = this.stats.binaryStats.textBytes / this.stats.totalSize;
        return textRatio < 0.7;
    }

    inferFileType() {
        if (this.isBinary()) return 'Binary';
        return 'Text';
    }

    inferEncoding() {
        // Implement encoding detection logic
        return 'UTF-8';
    }

    calculateConfidence() {
        const textRatio = this.stats.binaryStats.textBytes / this.stats.totalSize;
        return textRatio * 100;
    }
}

module.exports = FileAnalyzer;
