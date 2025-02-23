from flask import Flask
from flask_socketio import SocketIO

def create_app():
    app = Flask(__name__)
    app.config.from_object('config.Config')

    socketio = SocketIO(app)

    from app.api import api as api_blueprint
    app.register_blueprint(api_blueprint)

    from app.websocket import websocket as websocket_blueprint
    app.register_blueprint(websocket_blueprint)

    return app, socketio