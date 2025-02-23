module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: 'localhost'
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: 'logs'
  },
  chrome: {
    path: process.env.CHROME_PATH || '/snap/bin/chromium',
    driver: process.env.CHROME_DRIVER_PATH || '/usr/bin/chromedriver'
  },
  storage: {
    uploads: 'uploads',
    temp: 'temp',
    data: 'data'
  }
} 