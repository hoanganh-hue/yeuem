from flask import Blueprint, request, jsonify
import subprocess
from ..utils.logger import setup_logger

emulator_bp = Blueprint('emulator', __name__)
logger = setup_logger('emulator')

@emulator_bp.route('/emulator/devices', methods=['GET'])
def list_devices():
    try:
        result = subprocess.run(['adb', 'devices'], capture_output=True, text=True)
        devices = []
        for line in result.stdout.split('\n')[1:]:  # Skip first line
            if line.strip():
                serial, status = line.split('\t')
                devices.append({
                    'serial': serial.strip(),
                    'status': status.strip()
                })
        return jsonify({'devices': devices})
    except Exception as e:
        logger.error(f'Error listing devices: {str(e)}')
        return jsonify({'error': str(e)}), 500

@emulator_bp.route('/emulator/execute', methods=['POST'])
def execute_adb():
    data = request.get_json()
    command = data.get('command')
    device = data.get('device')
    
    if not command:
        return jsonify({'error': 'No command provided'}), 400
        
    try:
        cmd = ['adb']
        if device:
            cmd.extend(['-s', device])
        cmd.extend(command.split())
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        return jsonify({
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        })
    except Exception as e:
        logger.error(f'Error executing ADB command: {str(e)}')
        return jsonify({'error': str(e)}), 500 