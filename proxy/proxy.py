import time
import signal
import sys
import os
from typing import Optional

# Sửa lại cách import
from handlers.adb_handler import ADBHandler
from handlers.api_handler import APIHandler
from utils.logger import logger
from config.settings import (
    POLL_INTERVAL,
    ENABLE_TASK_MONITORING,
    ENABLE_AUTO_RECONNECT
)

class ADBProxy:
    def __init__(self):
        self.adb_handler = ADBHandler()
        self.api_handler = APIHandler()
        self.running = True
        
        # Set up signal handlers
        signal.signal(signal.SIGTERM, self.handle_shutdown)
        signal.signal(signal.SIGINT, self.handle_shutdown)
        
        logger.info("ADB Proxy initialized successfully")
    
    def start(self):
        """Start the proxy service"""
        logger.info("Starting ADB Proxy service")
        
        try:
            # Initial health check
            if not self.api_handler.healthcheck():
                logger.error("API is not accessible")
                return False
            
            # Main service loop
            while self.running:
                try:
                    # Check for new tasks
                    tasks = self.api_handler.get_pending_tasks()
                    if tasks.get("status") == "success":
                        for task in tasks.get("tasks", []):
                            self.handle_task(task)
                    
                    # Monitor running tasks if enabled
                    if ENABLE_TASK_MONITORING:
                        self.monitor_tasks()
                    
                    # Auto-reconnect to devices if enabled
                    if ENABLE_AUTO_RECONNECT:
                        self.check_device_connections()
                    
                    time.sleep(POLL_INTERVAL)
                    
                except Exception as e:
                    logger.error(f"Error in main loop: {e}")
                    if not self.running:
                        break
                    time.sleep(POLL_INTERVAL)
            
            return True
            
        except Exception as e:
            logger.error(f"Fatal error in proxy service: {e}")
            return False
    
    def handle_task(self, task: dict):
        """Handle a new task from API"""
        task_id = task.get("task_id")
        command = task.get("command")
        serial = task.get("emulator_serial")
        background = task.get("background", False)
        
        if not command:
            logger.error(f"Invalid task received: {task}")
            return
        
        try:
            # Execute command
            task_id, result = self.adb_handler.execute_command(
                command=command,
                serial=serial,
                background=background
            )
            
            # Send initial result
            self.api_handler.send_task_result(task_id, result)
            
            logger.info(f"Task {task_id} handled successfully")
            
        except Exception as e:
            logger.error(f"Error handling task: {e}")
            self.api_handler.send_error(str(e), context=task)
    
    def monitor_tasks(self):
        """Monitor and update status of running tasks"""
        for task_id in list(self.adb_handler.running_tasks.keys()):
            try:
                status = self.adb_handler.get_task_status(task_id)
                
                # Send status update to API
                self.api_handler.update_task_status(task_id, status)
                
                # Clean up completed tasks
                if status["status"] in ["completed", "error"]:
                    self.adb_handler.cleanup_task(task_id)
                    
            except Exception as e:
                logger.error(f"Error monitoring task {task_id}: {e}")
    
    def check_device_connections(self):
        """Check and maintain device connections"""
        try:
            status = self.adb_handler.check_device_status()
            
            for serial, device_status in status.get("devices", {}).items():
                if device_status == "offline":
                    logger.warning(f"Device {serial} is offline, attempting reconnect")
                    self.adb_handler.execute_command(f"connect {serial}")
                    
        except Exception as e:
            logger.error(f"Error checking device connections: {e}")
    
    def handle_shutdown(self, signum: Optional[int] = None, frame: Optional[object] = None):
        """Handle graceful shutdown"""
        logger.info("Shutting down ADB Proxy...")
        self.running = False
        
        # Stop all running tasks
        for task_id in list(self.adb_handler.running_tasks.keys()):
            try:
                self.adb_handler.stop_task(task_id)
            except Exception as e:
                logger.error(f"Error stopping task {task_id}: {e}")
        
        logger.info("Shutdown complete")
        sys.exit(0)

if __name__ == "__main__":
    proxy = ADBProxy()
    success = proxy.start()
    sys.exit(0 if success else 1) 