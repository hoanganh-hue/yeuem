from flask import Blueprint

websocket_bp = Blueprint('websocket', __name__)

from . import service