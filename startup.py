import subprocess
import sys
import time
import signal
import os
import socket
import requests
import psutil
import shutil
from urllib.parse import urljoin

# Khởi tạo biến global
node_process = None
proxy_process = None
gui_process = None
appium_process = None
xvfb_process = None
monitor_process = None
socket_process = None
worker_process = None
cron_process = None
redis_process = None

def create_required_directories():
    """Tạo các thư mục cần thiết"""
    directories = ['logs', 'uploads', 'backups', 'temp', 'data', 'logs/pm2']
    for directory in directories:
        os.makedirs(directory, exist_ok=True)
        os.chmod(directory, 0o777)
    print("✓ Required directories created")

def check_port_availability(port):
    """Kiểm tra port có đang được sử dụng không"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(('localhost', port))
        sock.close()
        return True, None
    except socket.error:
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                connections = proc.net_connections()
                for conn in connections:
                    if hasattr(conn.laddr, 'port') and conn.laddr.port == port:
                        return False, proc.pid
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return False, None

def kill_process_on_port(port):
    """Tắt process đang chạy trên port"""
    available, pid = check_port_availability(port)
    if not available and pid:
        try:
            process = psutil.Process(pid)
            process.terminate()
            process.wait(timeout=5)
            print(f"✓ Killed process {pid} on port {port}")
        except:
            print(f"✗ Failed to kill process on port {port}")

def check_redis():
    """Kiểm tra và khởi động Redis server nếu chưa chạy"""
    try:
        # Kiểm tra Redis đã được cài đặt chưa
        result = subprocess.run(['which', 'redis-server'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode != 0:
            print("✗ Redis not installed, installing...")
            subprocess.run(['sudo', 'apt-get', 'update'], check=True)
            subprocess.run(['sudo', 'apt-get', 'install', '-y', 'redis-server'], check=True)
            print("✓ Redis installed successfully")
        
        # Kiểm tra Redis service có đang chạy không
        result = subprocess.run(['systemctl', 'is-active', 'redis-server'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.stdout.decode().strip() != 'active':
            print("✗ Redis server not running, starting...")
            subprocess.run(['sudo', 'systemctl', 'start', 'redis-server'], check=True)
            subprocess.run(['sudo', 'systemctl', 'enable', 'redis-server'], check=True)
            time.sleep(2)  # Đợi Redis khởi động
            print("✓ Redis server started successfully")
        
        # Kiểm tra kết nối Redis
        import redis
        client = redis.Redis(host='localhost', port=6379)
        client.ping()
        print("✓ Redis server running and accessible")
        return True
        
    except Exception as e:
        print(f"✗ Error with Redis: {str(e)}")
        return False

def check_dependencies():
    """Kiểm tra và cài đặt các dependencies cần thiết"""
    print("Checking dependencies...")
    
    # Kiểm tra Node.js
    try:
        subprocess.run(['node', '--version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("✓ Node.js installed")
    except:
        print("✗ Node.js not found")
        return False

    # Kiểm tra npm
    try:
        subprocess.run(['npm', '--version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("✓ npm installed")
    except:
        print("✗ npm not found")
        return False

    # Kiểm tra PM2
    try:
        subprocess.run(['pm2', '--version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("✓ PM2 installed")
    except:
        print("✗ PM2 not found, installing...")
        try:
            subprocess.run(['npm', 'install', '-g', 'pm2'], check=True)
            print("✓ PM2 installed successfully")
        except:
            print("✗ Failed to install PM2")
            return False

    # Kiểm tra Appium
    try:
        subprocess.run(['npx', 'appium', '-v'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("✓ Appium installed")
    except:
        print("✗ Appium not found, installing...")
        try:
            subprocess.run(['npm', 'install', '-g', 'appium@2.0.0-beta.71'], check=True)
            print("✓ Appium installed successfully")
        except:
            print("✗ Failed to install Appium")
            return False

    # Kiểm tra Appium Driver
    try:
        subprocess.run(['npx', 'appium', 'driver', 'list', '--installed'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("✓ Appium drivers checked")
    except:
        print("✗ Installing Appium UiAutomator2 driver...")
        try:
            subprocess.run(['npx', 'appium', 'driver', 'install', 'uiautomator2'], check=True)
            print("✓ UiAutomator2 driver installed")
        except:
            print("✗ Failed to install UiAutomator2 driver")
            return False

    # Kiểm tra Xvfb
    try:
        subprocess.run(['which', 'Xvfb'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("✓ Xvfb installed")
    except:
        print("✗ Xvfb not found")
        return False

    # Kiểm tra Python dependencies
    try:
        import pkg_resources
        with open('requirements.txt') as f:
            requirements = [line.strip() for line in f if line.strip() and not line.startswith('#')]
        pkg_resources.require(requirements)
        print("✓ Python dependencies installed")
    except Exception as e:
        print(f"✗ Missing Python dependencies: {str(e)}")
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'], check=True)
            print("✓ Python dependencies installed successfully")
        except:
            print("✗ Failed to install Python dependencies")
            return False

    # Kiểm tra và khởi động Redis
    if not check_redis():
        return False

    return True

def wait_for_port(port, host='localhost', timeout=30):
    """Đợi cho đến khi port được mở"""
    start_time = time.time()
    while True:
        try:
            socket.create_connection((host, port), timeout=1)
            return True
        except (socket.timeout, socket.error):
            if time.time() - start_time > timeout:
                return False
            time.sleep(1)

def check_api_health(url, timeout=30):
    """Kiểm tra API có hoạt động không"""
    start_time = time.time()
    while True:
        try:
            response = requests.get(url)
            if response.status_code == 200:
                return True
        except:
            if time.time() - start_time > timeout:
                return False
            time.sleep(1)

def start_appium():
    """Khởi động Appium server"""
    global appium_process
    try:
        appium_process = subprocess.Popen(
            ['npx', 'appium', '--allow-insecure', 'chromedriver_autodownload'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        if wait_for_port(4723):
            print("Appium server started successfully")
            return appium_process
        else:
            print("Failed to start Appium server")
            return None
    except Exception as e:
        print(f"Error starting Appium server: {e}")
        return None

def run_node_server():
    """Khởi động Node.js server"""
    global node_process
    try:
        node_process = subprocess.Popen(['node', 'index.js'])
        if wait_for_port(3000) and check_api_health('http://localhost:3000/api/system/monitor'):
            print("Node.js server started successfully")
            return node_process
        else:
            print("Failed to start Node.js server")
            return None
    except Exception as e:
        print(f"Error starting Node.js server: {e}")
        return None

def run_python_proxy():
    """Khởi động Python proxy"""
    global proxy_process
    try:
        env = os.environ.copy()
        env['PYTHONPATH'] = os.getcwd()
        
        proxy_process = subprocess.Popen(
            ['python3', 'proxy/proxy.py'],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        time.sleep(2)  # Đợi proxy khởi động
        print("Python proxy started successfully")
        return proxy_process
    except Exception as e:
        print(f"Error starting Python proxy: {e}")
        return None

def start_xvfb():
    """Khởi động Xvfb"""
    global xvfb_process
    try:
        # Kiểm tra xem Xvfb đã chạy chưa
        try:
            xvfb_pid = subprocess.check_output(['pidof', 'Xvfb']).decode().strip()
            if xvfb_pid:
                print(f"Xvfb is already running with PID {xvfb_pid}")
                os.environ['DISPLAY'] = ':99'
                return True
        except:
            pass

        # Thử khởi động Xvfb mới với cấu hình chuẩn
        xvfb_process = subprocess.Popen(
            ['Xvfb', ':99', '-ac', '-screen', '0', '1920x1080x24'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        time.sleep(2)  # Đợi Xvfb khởi động

        # Kiểm tra xem Xvfb đã khởi động thành công chưa
        if xvfb_process.poll() is None:  # Nếu process vẫn đang chạy
            os.environ['DISPLAY'] = ':99'
            # Thử set resolution
            try:
                subprocess.run(['xrandr', '--display', ':99', '--screen', '0', '--output', 'screen', '--mode', '1920x1080'])
            except:
                pass  # Bỏ qua nếu không set được resolution
            print("Xvfb started successfully")
            return True
        else:
            stderr = xvfb_process.stderr.read().decode()
            print(f"Failed to start Xvfb: {stderr}")
            return False

    except Exception as e:
        print(f"Error with Xvfb: {e}")
        return False

def run_gui_control():
    """Khởi động GUI Control service"""
    global gui_process
    try:
        env = os.environ.copy()
        env['PYTHONPATH'] = os.getcwd()
        env['DISPLAY'] = ':99'  # Đảm bảo sử dụng Xvfb display
        
        gui_process = subprocess.Popen(
            ['python3', 'gui-control.py', 'service', '--port', '5000'],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        if wait_for_port(5000):
            print("GUI Control service started successfully")
            return gui_process
        else:
            print("Failed to start GUI Control service")
            return None
    except Exception as e:
        print(f"Error starting GUI Control service: {e}")
        return None

def start_monitor():
    """Khởi động monitoring service"""
    global monitor_process
    try:
        monitor_process = subprocess.Popen(['node', 'monitor.js'])
        if wait_for_port(3003) and check_api_health('http://localhost:3003/health'):
            print("Monitor service started successfully")
            return monitor_process
        else:
            print("Failed to start monitor service")
            return None
    except Exception as e:
        print(f"Error starting monitor service: {e}")
        return None

def start_socket():
    """Khởi động socket service"""
    global socket_process
    try:
        socket_process = subprocess.Popen(['node', 'socket.js'])
        if wait_for_port(3002):
            print("Socket service started successfully")
            return socket_process
        else:
            print("Failed to start socket service")
            return None
    except Exception as e:
        print(f"Error starting socket service: {e}")
        return None

def start_worker():
    """Khởi động worker service"""
    global worker_process
    try:
        worker_process = subprocess.Popen(['node', 'worker.js'])
        time.sleep(2)  # Đợi worker khởi động
        print("Worker service started successfully")
        return worker_process
    except Exception as e:
        print(f"Error starting worker service: {e}")
        return None

def start_cron():
    """Khởi động cron service"""
    global cron_process
    try:
        cron_process = subprocess.Popen(['node', 'cron.js'])
        time.sleep(2)  # Đợi cron khởi động
        print("Cron service started successfully")
        return cron_process
    except Exception as e:
        print(f"Error starting cron service: {e}")
        return None

def verify_services():
    """Kiểm tra tất cả services có hoạt động không"""
    checks = {
        "Node.js API": {
            "url": "http://localhost:3000/api/system/monitor",
            "status": False
        },
        "GUI Control": {
            "port": 5000,
            "status": False
        },
        "Appium": {
            "port": 4723,
            "status": False
        },
        "Monitor": {
            "url": "http://localhost:3003/health",
            "status": False
        },
        "Socket": {
            "port": 3002,
            "status": False
        },
        "Redis": {
            "port": 6379,
            "status": False
        }
    }
    
    # Kiểm tra các HTTP endpoints
    for service in ["Node.js API", "Monitor"]:
        try:
            response = requests.get(checks[service]["url"])
            checks[service]["status"] = response.status_code == 200
        except:
            pass

    # Kiểm tra các ports
    for service in ["GUI Control", "Appium", "Socket", "Redis"]:
        try:
            socket.create_connection(("localhost", checks[service]["port"]), timeout=1)
            checks[service]["status"] = True
        except:
            pass

    # Kiểm tra các process
    processes = {
        "Worker": worker_process,
        "Cron": cron_process
    }
    for name, process in processes.items():
        if process and process.poll() is None:
            checks[name] = {"status": True}
        else:
            checks[name] = {"status": False}

    # In kết quả
    print("\nService Status:")
    for service, info in checks.items():
        status = "✓ Running" if info["status"] else "✗ Not running"
        print(f"{service}: {status}")

    return all(info["status"] for info in checks.values())

def handle_shutdown(signum, frame):
    """Xử lý tắt hệ thống an toàn"""
    print("\nShutting down services...")
    
    processes = [
        (node_process, "Node.js server"),
        (proxy_process, "Python proxy"),
        (gui_process, "GUI Control service"),
        (appium_process, "Appium server"),
        (xvfb_process, "Xvfb"),
        (monitor_process, "Monitor service"),
        (socket_process, "Socket service"),
        (worker_process, "Worker service"),
        (cron_process, "Cron service")
    ]
    
    for process, name in processes:
        if process:
            try:
                process.terminate()
                process.wait(timeout=5)
                print(f"{name} stopped successfully")
            except Exception as e:
                print(f"Error stopping {name}: {e}")
                try:
                    process.kill()
                except:
                    pass

    # Dọn dẹp các file tạm
    try:
        shutil.rmtree('temp', ignore_errors=True)
        print("Temporary files cleaned")
    except:
        pass

    sys.exit(0)

if __name__ == "__main__":
    # Đăng ký signal handler
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    # Tạo các thư mục cần thiết
    create_required_directories()

    # Kiểm tra dependencies trước
    if not check_dependencies():
        print("\nPlease install all required dependencies first")
        sys.exit(1)

    print("\nStarting all services...")

    # Kill các process đang chiếm dụng ports
    ports_to_check = [3000, 3001, 3002, 3003, 4723, 5000]
    for port in ports_to_check:
        kill_process_on_port(port)

    # Khởi động hoặc kiểm tra Xvfb
    if not start_xvfb():
        print("Failed to start or connect to Xvfb")
        sys.exit(1)

    # Khởi động Appium
    appium_process = start_appium()
    if not appium_process:
        handle_shutdown(None, None)
        sys.exit(1)

    # Khởi động Node.js server
    node_process = run_node_server()
    if not node_process:
        handle_shutdown(None, None)
        sys.exit(1)

    # Khởi động Python proxy
    proxy_process = run_python_proxy()
    if not proxy_process:
        handle_shutdown(None, None)
        sys.exit(1)

    # Khởi động GUI Control
    gui_process = run_gui_control()
    if not gui_process:
        handle_shutdown(None, None)
        sys.exit(1)

    # Khởi động Monitor service
    monitor_process = start_monitor()
    if not monitor_process:
        handle_shutdown(None, None)
        sys.exit(1)

    # Khởi động Socket service
    socket_process = start_socket()
    if not socket_process:
        handle_shutdown(None, None)
        sys.exit(1)

    # Khởi động Worker service
    worker_process = start_worker()
    if not worker_process:
        handle_shutdown(None, None)
        sys.exit(1)

    # Khởi động Cron service
    cron_process = start_cron()
    if not cron_process:
        handle_shutdown(None, None)
        sys.exit(1)

    # Kiểm tra tất cả services
    print("\nVerifying all services...")
    time.sleep(5)  # Đợi các service khởi động hoàn tất
    
    if verify_services():
        print("\nAll services are running successfully!")
        print("\nPress Ctrl+C to stop all services")
        
        try:
            # Giữ script chạy và kiểm tra services định kỳ
            while True:
                time.sleep(30)  # Kiểm tra mỗi 30 giây
                if not verify_services():
                    print("\nSome services have stopped running!")
                    handle_shutdown(None, None)
                    sys.exit(1)
        except KeyboardInterrupt:
            handle_shutdown(None, None)
    else:
        print("\nSome services failed to start!")
        handle_shutdown(None, None)
        sys.exit(1) 