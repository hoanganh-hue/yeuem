import os

class Config:
    # Flask settings
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev_key_123')
    DEBUG = True
    
    # API settings
    API_HOST = '0.0.0.0'
    API_PORT = 5002
    LEGACY_API_URL = 'http://144.202.25.223:3000'
    
    # ADB settings
    ADB_PATH = os.getenv('ADB_PATH', 'adb')
    DEFAULT_DEVICE_TIMEOUT = 30
    
    # Redis settings
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    
    # Logging
    LOG_DIR = 'logs'
    LOG_LEVEL = 'DEBUG'
    LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    
    # Process Management
    MAX_BACKGROUND_PROCESSES = 50
    PROCESS_CLEANUP_INTERVAL = 300
    
    # Security
    ALLOWED_COMMANDS = [
        'devices', 'connect', 'disconnect', 'shell',
        'install', 'uninstall', 'push', 'pull'
    ]
    BLOCKED_COMMANDS = [
        'format', 'reboot', 'root', 'remount',
        'disable-verity'
    ] 