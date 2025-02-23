# Flask WebSocket App

This project is a Flask API with WebSocket service that allows real-time communication between clients and the server.

## Project Structure

```
flask-websocket-app
├── app
│   ├── __init__.py
│   ├── api
│   │   ├── __init__.py
│   │   └── routes.py
│   ├── websocket
│   │   ├── __init__.py
│   │   └── service.py
│   └── models.py
├── requirements.txt
├── config.py
├── run.py
└── README.md
```

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd flask-websocket-app
   ```

2. Install the required packages:
   ```
   pip install -r requirements.txt
   ```

## Configuration

Edit the `config.py` file to set up your application configurations.

## Running the Application

To run the application, execute:
```
python run.py
```

## API Endpoints

Refer to `app/api/routes.py` for the list of available API endpoints.

## WebSocket Service

The WebSocket service can be found in `app/websocket/service.py`. This service handles real-time communication.

## License

This project is licensed under the MIT License.