import os

# API Configuration
API_HOST = "https://doremonsieucap88.com"
API_PORT = 3000
API_ENDPOINTS = {
    "terminal_execute": "/api/terminal/execute",
    "emulator_execute": "/api/emulator/execute-adb",
    "emulator_status": "/api/emulator/status",
    "emulator_logs": "/api/emulator/logs"
}

# ADB Configuration
ADB_PATH = os.getenv("ADB_PATH", "/usr/bin/adb")
DEFAULT_SERIAL = "127.0.0.1:6555"
ADB_TIMEOUT = 60  # seconds

# Logging Configuration
LOG_DIR = "logs"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
LOG_LEVEL = "DEBUG"
LOG_FILE = "proxy.log"

# Process Configuration
MAX_CONCURRENT_TASKS = 10
TASK_TIMEOUT = 3600  # 1 hour
POLL_INTERVAL = 1  # seconds

# Security Configuration
SSL_VERIFY = True
SSL_CERT_PATH = "ssl/certificate.crt"
SSL_KEY_PATH = "ssl/private.key"

# Performance Configuration
CHUNK_SIZE = 8192  # bytes
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds

# Feature Flags
ENABLE_BACKGROUND_TASKS = True
ENABLE_TASK_MONITORING = True
ENABLE_AUTO_RECONNECT = True
ENABLE_ERROR_REPORTING = True 