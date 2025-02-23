from flask import Blueprint, request, jsonify
import requests
from ..utils.logger import setup_logger
from config.default import Config

proxy_bp = Blueprint('proxy', __name__)
logger = setup_logger('proxy')

@proxy_bp.route('/forward', methods=['POST'])
def forward_request():
    try:
        # Lấy thông tin request
        data = request.get_json()
        target_path = data.get('path')
        method = data.get('method', 'GET')
        body = data.get('body', {})
        headers = data.get('headers', {})
        
        if not target_path:
            return jsonify({'error': 'No target path provided'}), 400
            
        # Tạo URL đích
        target_url = f"{Config.LEGACY_API_URL}{target_path}"
        
        # Forward request
        response = requests.request(
            method=method,
            url=target_url,
            json=body,
            headers=headers
        )
        
        return jsonify({
            'status_code': response.status_code,
            'headers': dict(response.headers),
            'body': response.json() if response.text else None
        }), response.status_code
        
    except requests.RequestException as e:
        logger.error(f'Error forwarding request: {str(e)}')
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        logger.error(f'Unexpected error: {str(e)}')
        return jsonify({'error': str(e)}), 500 