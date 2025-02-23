from flask import Blueprint, jsonify

api = Blueprint('api', __name__)

@api.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"}), 200

@api.route('/api/data', methods=['GET'])
def get_data():
    # Placeholder for data retrieval logic
    return jsonify({"data": "sample data"}), 200