#!/bin/bash

echo "Starting Flask API setup..."

# Create necessary directories
mkdir -p logs uploads backups
echo "Created directories"

# Install dependencies
pip3 install -r requirements.txt
echo "Installed dependencies"

# Start Flask API
echo "Starting Flask API..."
python3 run.py &
FLASK_PID=$!
echo "Flask API started with PID: $FLASK_PID"

# Wait for API to start
sleep 5

# Test the API
echo "Testing API..."
curl http://localhost:5000/api/test

# Keep logs visible
echo "Monitoring logs..."
tail -f logs/*.log 