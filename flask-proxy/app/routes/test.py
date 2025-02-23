from flask import Blueprint, jsonify
from ..utils.logger import setup_logger

test_bp = Blueprint('test', __name__)
logger = setup_logger('test')

@test_bp.route('/test', methods=['GET'])
def test():
    logger.info('Test endpoint called')
    return jsonify({
        'status': 'success',
        'message': 'Flask API is working!'
    }) 