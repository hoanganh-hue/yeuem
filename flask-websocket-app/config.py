class Config:
    DEBUG = True
    TESTING = False
    SECRET_KEY = 'your_secret_key'
    SOCKETIO_MESSAGE_QUEUE = 'redis://localhost:6379/0'
    SQLALCHEMY_DATABASE_URI = 'sqlite:///site.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False