from flask import Flask
from flask_socketio import SocketIO
from app.api.routes import register_routes
from app.websocket.service import register_websocket

app = Flask(__name__)
app.config.from_object('config')

socketio = SocketIO(app)

register_routes(app)
register_websocket(socketio)

if __name__ == '__main__':
    socketio.run(app, debug=True)