import logging
import os
from logging.handlers import RotatingFileHandler

# Định nghĩa các constants trực tiếp
LOG_DIR = "logs"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
LOG_LEVEL = "DEBUG"
LOG_FILE = "proxy.log"

class ProxyLogger:
    def __init__(self, name="ProxyLogger"):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, LOG_LEVEL))
        
        # Ensure log directory exists
        os.makedirs(LOG_DIR, exist_ok=True)
        
        # File handler with rotation
        file_handler = RotatingFileHandler(
            os.path.join(LOG_DIR, LOG_FILE),
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5
        )
        file_handler.setFormatter(logging.Formatter(LOG_FORMAT))
        self.logger.addHandler(file_handler)
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(logging.Formatter(LOG_FORMAT))
        self.logger.addHandler(console_handler)
    
    def info(self, message, *args, **kwargs):
        self.logger.info(message, *args, **kwargs)
    
    def error(self, message, *args, **kwargs):
        self.logger.error(message, *args, **kwargs)
    
    def debug(self, message, *args, **kwargs):
        self.logger.debug(message, *args, **kwargs)
    
    def warning(self, message, *args, **kwargs):
        self.logger.warning(message, *args, **kwargs)
    
    def critical(self, message, *args, **kwargs):
        self.logger.critical(message, *args, **kwargs)
    
    def log_task(self, task_id, message, level=logging.INFO):
        """Log task-specific messages with task ID"""
        task_log_file = os.path.join(LOG_DIR, f"{task_id}.log")
        
        with open(task_log_file, "a") as f:
            timestamp = logging.Formatter(LOG_FORMAT).formatTime(logging.LogRecord("", 0, "", level, "", (), None))
            f.write(f"{timestamp} - Task {task_id} - {message}\n")
        
        self.logger.log(level, f"Task {task_id}: {message}")

logger = ProxyLogger() 