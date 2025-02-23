import sys
import json
import os
import logging
import time
import socket
from pyvirtualdisplay import Display

# Khởi tạo virtual display trước khi import pyautogui
display = Display(visible=0, size=(1920, 1080))
display.start()
os.environ['DISPLAY'] = display.new_display_var

# Sau khi set DISPLAY mới import các module GUI
import pyautogui
from appium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By

# Cấu hình cho headless environment
pyautogui.FAILSAFE = False  # Tắt failsafe vì đang chạy headless

# Cấu hình logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/gui-control.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('gui-control')

def ensure_root_access():
    try:
        os.chmod('logs', 0o777)
        os.chmod('uploads', 0o777)
        os.chmod('backups', 0o777)
        
        # Đảm bảo X11 socket có quyền truy cập đúng
        x11_socket = '/tmp/.X11-unix'
        if os.path.exists(x11_socket):
            os.chmod(x11_socket, 0o1777)
        
        return True
    except Exception as e:
        logger.error(f"Error setting root access: {str(e)}")
        return False

def check_xvfb():
    """Kiểm tra Xvfb đã chạy chưa"""
    try:
        import subprocess
        result = subprocess.run(['xdpyinfo'], capture_output=True, text=True)
        return result.returncode == 0
    except Exception as e:
        logger.error(f"Error checking Xvfb: {str(e)}")
        return False

class GuiControlService:
    def __init__(self, host='127.0.0.1', port=5000):
        self.host = host
        self.port = port
        self.controller = GuiController()
        self.running = True
        logger.setLevel(logging.DEBUG)

    def start(self):
        """Khởi động service"""
        try:
            logger.debug(f"Attempting to bind to {self.host}:{self.port}")
            server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server.bind((self.host, self.port))
            server.listen(5)
            logger.info(f"GUI Control service listening on {self.host}:{self.port}")

            while self.running:
                try:
                    client, addr = server.accept()
                    logger.debug(f"Accepted connection from {addr}")
                    data = client.recv(4096).decode()
                    if data:
                        try:
                            # Parse HTTP request
                            request_lines = data.split('\n')
                            content_length = 0
                            body = ""
                            
                            # Get content length
                            for line in request_lines:
                                if line.lower().startswith('content-length:'):
                                    content_length = int(line.split(':')[1].strip())
                                    break
                            
                            # Get request body
                            for i, line in enumerate(request_lines):
                                if not line.strip():
                                    body = '\n'.join(request_lines[i+1:])
                                    break
                            
                            # Parse JSON from body
                            command = json.loads(body)
                            logger.debug(f"Received command: {command}")
                            result = self.controller.execute_action(
                                command['action'],
                                command.get('params', {})
                            )
                            
                            # Send HTTP response
                            response = json.dumps(result)
                            http_response = (
                                'HTTP/1.1 200 OK\r\n'
                                'Content-Type: application/json\r\n'
                                f'Content-Length: {len(response)}\r\n'
                                '\r\n'
                                f'{response}'
                            )
                            client.send(http_response.encode())
                            
                        except json.JSONDecodeError as e:
                            logger.error(f"JSON decode error: {e}")
                            error_response = json.dumps({
                                "status": "error",
                                "error": "Invalid JSON"
                            })
                            http_response = (
                                'HTTP/1.1 400 Bad Request\r\n'
                                'Content-Type: application/json\r\n'
                                f'Content-Length: {len(error_response)}\r\n'
                                '\r\n'
                                f'{error_response}'
                            )
                            client.send(http_response.encode())
                    client.close()
                except Exception as e:
                    logger.error(f"Error handling client: {e}")

        except Exception as e:
            logger.error(f"Service error: {e}")
            raise
        finally:
            self.cleanup()

    def cleanup(self):
        """Dọn dẹp tài nguyên"""
        self.running = False
        self.controller.cleanup()
        display.stop()

class GuiController:
    def __init__(self):
        self.driver = None
        # Cấu hình pyautogui
        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0.5

    def setup_appium(self):
        try:
            desired_caps = {
                "platformName": "Android",
                "deviceName": "Android Emulator",
                "appPackage": "com.example.android",
                "appActivity": ".MainActivity",
                "automationName": "UiAutomator2",
                "noReset": True
            }
            self.driver = webdriver.Remote('http://localhost:4723/wd/hub', desired_caps)
            logger.info("Appium session started successfully")
            return True
        except Exception as e:
            logger.error(f"Error setting up Appium: {str(e)}")
            return False

    def execute_action(self, action, params=None):
        try:
            result = getattr(self, f"action_{action}")(params)
            return {"status": "success", "action": action, **result}
        except Exception as e:
            logger.error(f"Error executing {action}: {str(e)}")
            return {"status": "error", "action": action, "error": str(e)}

    def action_click(self, params):
        x, y = params['x'], params['y']
        pyautogui.click(x, y)
        return {"x": x, "y": y}

    def action_type(self, params):
        text = params['text']
        pyautogui.typewrite(text)
        return {"text": text}

    def action_screenshot(self, params):
        filename = params.get('filename', 'screenshot.png')
        screenshot = pyautogui.screenshot()
        screenshot.save(filename)
        return {"file": filename}

    def action_move(self, params):
        x, y = params['x'], params['y']
        pyautogui.moveTo(x, y)
        return {"x": x, "y": y}

    def action_scroll(self, params):
        amount = params['amount']
        pyautogui.scroll(amount)
        return {"amount": amount}

    def action_appium_click(self, params):
        if not self.driver:
            if not self.setup_appium():
                return {"error": "Appium setup failed"}
        
        element_id = params['element_id']
        wait = WebDriverWait(self.driver, 10)
        element = wait.until(EC.presence_of_element_located((By.ID, element_id)))
        element.click()
        return {"element_id": element_id}

    def action_appium_type(self, params):
        if not self.driver:
            if not self.setup_appium():
                return {"error": "Appium setup failed"}

        element_id = params['element_id']
        text = params['text']
        wait = WebDriverWait(self.driver, 10)
        element = wait.until(EC.presence_of_element_located((By.ID, element_id)))
        element.send_keys(text)
        return {"element_id": element_id, "text": text}

    def action_appium_screenshot(self, params):
        if not self.driver:
            if not self.setup_appium():
                return {"error": "Appium setup failed"}

        filename = params.get('filename', 'appium_screenshot.png')
        self.driver.get_screenshot_as_file(filename)
        return {"file": filename}

    def cleanup(self):
        if self.driver:
            try:
                self.driver.quit()
                logger.info("Appium session closed")
            except Exception as e:
                logger.error(f"Error closing Appium session: {str(e)}")

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "error": "No command provided"}))
        sys.exit(1)

    command = sys.argv[1]
    
    if command == 'service':
        # Chạy như một service
        service = GuiControlService()
        service.start()
    else:
        # Chạy như command line tool
        controller = GuiController()
        try:
            params = {}
            if command == 'click' or command == 'move':
                params = {'x': int(sys.argv[2]), 'y': int(sys.argv[3])}
            elif command == 'type':
                params = {'text': sys.argv[2]}
            elif command == 'scroll':
                params = {'amount': int(sys.argv[2])}
            elif command == 'appium_click':
                params = {'element_id': sys.argv[2]}
            elif command == 'appium_type':
                params = {'element_id': sys.argv[2], 'text': sys.argv[3]}
            elif command == 'screenshot' or command == 'appium_screenshot':
                params = {}

            result = controller.execute_action(command, params)
            print(json.dumps(result))

        except Exception as e:
            print(json.dumps({"status": "error", "error": str(e)}))
        finally:
            controller.cleanup()

if __name__ == "__main__":
    ensure_root_access()
    main()