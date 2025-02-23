from flask import Flask
from flask_restful import Api
from config.default import Config

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    # Initialize extensions
    api = Api(app)
    
    # Register blueprints
    from .routes import terminal_bp, emulator_bp, proxy_bp
    from .routes.test import test_bp
    app.register_blueprint(terminal_bp, url_prefix='/api')
    app.register_blueprint(emulator_bp, url_prefix='/api')
    app.register_blueprint(proxy_bp, url_prefix='/api/proxy')
    app.register_blueprint(test_bp, url_prefix='/api')
    
    # Register error handlers
    @app.errorhandler(404)
    def not_found_error(error):
        return {'error': 'Not Found'}, 404

    @app.errorhandler(500)
    def internal_error(error):
        return {'error': 'Internal Server Error'}, 500
        
    return app 