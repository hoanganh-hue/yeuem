import os
import logging
from logging.handlers import RotatingFileHandler
from pythonjsonlogger import jsonlogger

def setup_logger(name: str = None):
    """Setup logger with JSON formatting and file rotation"""
    logger = logging.getLogger(name or __name__)
    
    if logger.handlers:
        return logger
        
    logger.setLevel(logging.DEBUG)
    
    # Create logs directory if not exists
    if not os.path.exists('logs'):
        os.makedirs('logs')
        
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_formatter = jsonlogger.JsonFormatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)
    
    # File handler
    file_handler = RotatingFileHandler(
        f'logs/{name or "app"}.log',
        maxBytes=10485760,  # 10MB
        backupCount=10
    )
    file_handler.setLevel(logging.DEBUG)
    file_formatter = jsonlogger.JsonFormatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)
    
    return logger 