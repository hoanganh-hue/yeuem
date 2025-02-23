#!/bin/bash

# Cài đặt các dependencies hệ thống
sudo apt-get update
sudo apt-get install -y \
    python3-pip \
    android-tools-adb \
    android-tools-fastboot \
    build-essential \
    cmake \
    libxtst-dev \
    libpng++-dev \
    libx11-dev \
    libxt-dev \
    x11proto-record-dev \
    libxext-dev \
    openssl

# Cài đặt các dependencies Python
pip3 install --user \
    pyautogui \
    pillow \
    python-xlib \
    appium-python-client \
    selenium

# Cài đặt Node.js dependencies
npm install

# Tạo thư mục cần thiết và set permissions
mkdir -p logs uploads backups
chmod -R 777 logs uploads backups

# Tạo SSL certificates
bash generate-ssl.sh

# Kiểm tra môi trường
node check-env.js

echo "Installation completed successfully!"
