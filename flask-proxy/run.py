from app import create_app
from config.default import Config

app = create_app()

if __name__ == '__main__':
    app.run(
        host=Config.API_HOST,
        port=Config.API_PORT,
        debug=Config.DEBUG
    ) 