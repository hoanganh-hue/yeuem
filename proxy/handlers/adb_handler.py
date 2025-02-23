import subprocess
import threading
import uuid
import time
import os
import sys
from typing import Dict, Optional, Tuple

from utils.logger import logger
from config.settings import (
    ADB_PATH,
    ADB_TIMEOUT,
    DEFAULT_SERIAL,
    ENABLE_BACKGROUND_TASKS
)

class ADBHandler:
    def __init__(self):
        self.running_tasks: Dict[str, subprocess.Popen] = {}
        self.task_outputs: Dict[str, str] = {}
        self.task_threads: Dict[str, threading.Thread] = {}
        
        # Verify ADB installation
        self._verify_adb()
    
    def _verify_adb(self):
        """Verify ADB is installed and accessible"""
        try:
            subprocess.run([ADB_PATH, "version"], check=True, capture_output=True)
            logger.info("ADB verified successfully")
        except subprocess.CalledProcessError as e:
            logger.error(f"ADB verification failed: {e}")
            raise RuntimeError("ADB not found or not accessible")
    
    def execute_command(
        self, 
        command: str, 
        serial: Optional[str] = None,
        background: bool = False
    ) -> Tuple[str, Dict]:
        """Execute an ADB command and return task ID and initial response"""
        task_id = str(uuid.uuid4())
        
        # Prepare full command
        if serial:
            full_command = [ADB_PATH, "-s", serial] + command.split()
        else:
            full_command = [ADB_PATH] + command.split()
        
        logger.debug(f"Executing command: {' '.join(full_command)}")
        
        try:
            process = subprocess.Popen(
                full_command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            
            self.running_tasks[task_id] = process
            self.task_outputs[task_id] = ""
            
            if background and ENABLE_BACKGROUND_TASKS:
                thread = threading.Thread(
                    target=self._monitor_task,
                    args=(task_id, process)
                )
                thread.daemon = True
                thread.start()
                self.task_threads[task_id] = thread
                
                return task_id, {
                    "status": "started",
                    "message": "Command started in background",
                    "task_id": task_id
                }
            else:
                try:
                    stdout, stderr = process.communicate(timeout=ADB_TIMEOUT)
                    exit_code = process.returncode
                    
                    if exit_code == 0:
                        self.task_outputs[task_id] = stdout
                        return task_id, {
                            "status": "completed",
                            "output": stdout,
                            "exit_code": exit_code
                        }
                    else:
                        error_msg = stderr or stdout
                        self.task_outputs[task_id] = error_msg
                        return task_id, {
                            "status": "error",
                            "error": error_msg,
                            "exit_code": exit_code
                        }
                        
                except subprocess.TimeoutExpired:
                    process.kill()
                    return task_id, {
                        "status": "error",
                        "error": "Command timed out",
                        "exit_code": -1
                    }
                    
        except Exception as e:
            logger.error(f"Error executing command: {e}")
            return task_id, {
                "status": "error",
                "error": str(e),
                "exit_code": -1
            }
    
    def _monitor_task(self, task_id: str, process: subprocess.Popen):
        """Monitor a background task and collect its output"""
        output = []
        
        while True:
            if process.poll() is not None:
                break
                
            line = process.stdout.readline()
            if line:
                output.append(line)
                self.task_outputs[task_id] = "".join(output)
                logger.log_task(task_id, line.strip())
            
            time.sleep(0.1)
        
        # Collect any remaining output
        remaining_output, errors = process.communicate()
        if remaining_output:
            output.append(remaining_output)
        if errors:
            output.append(f"Errors: {errors}")
        
        self.task_outputs[task_id] = "".join(output)
        logger.log_task(task_id, "Task completed")
    
    def get_task_status(self, task_id: str) -> Dict:
        """Get the status and output of a task"""
        if task_id not in self.running_tasks:
            return {
                "status": "not_found",
                "error": "Task not found"
            }
        
        process = self.running_tasks[task_id]
        exit_code = process.poll()
        
        if exit_code is None:
            return {
                "status": "running",
                "output": self.task_outputs.get(task_id, ""),
                "exit_code": None
            }
        else:
            output = self.task_outputs.get(task_id, "")
            return {
                "status": "completed" if exit_code == 0 else "error",
                "output": output,
                "exit_code": exit_code
            }
    
    def stop_task(self, task_id: str) -> Dict:
        """Stop a running task"""
        if task_id not in self.running_tasks:
            return {
                "status": "error",
                "error": "Task not found"
            }
        
        process = self.running_tasks[task_id]
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            
            return {
                "status": "stopped",
                "message": "Task stopped successfully"
            }
        else:
            return {
                "status": "error",
                "error": "Task already completed"
            }
    
    def cleanup_task(self, task_id: str):
        """Clean up task resources"""
        if task_id in self.running_tasks:
            del self.running_tasks[task_id]
        if task_id in self.task_outputs:
            del self.task_outputs[task_id]
        if task_id in self.task_threads:
            del self.task_threads[task_id]
    
    def check_device_status(self, serial: Optional[str] = None) -> Dict:
        """Check the status of an Android device"""
        try:
            cmd = [ADB_PATH, "devices"]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            devices = {}
            for line in result.stdout.split('\n')[1:]:  # Skip first line
                if line.strip():
                    dev_serial, status = line.split()
                    devices[dev_serial] = status
            
            if serial:
                return {
                    "status": "success",
                    "device_status": devices.get(serial, "not_found"),
                    "all_devices": devices
                }
            else:
                return {
                    "status": "success",
                    "devices": devices
                }
                
        except subprocess.CalledProcessError as e:
            return {
                "status": "error",
                "error": f"Error checking device status: {e.stderr}"
            }
        except Exception as e:
            return {
                "status": "error",
                "error": f"Unexpected error: {str(e)}"
            } 