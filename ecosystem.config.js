module.exports = {
  apps: [
    {
      name: 'api-main',
      script: 'index.js',
      instances: 'max',
      exec_mode: 'cluster',
      watch: true,
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      node_args: '--max_old_space_size=8192',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '2G',
      error_file: 'logs/pm2/error.log',
      out_file: 'logs/pm2/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_restarts: 10,
      restart_delay: 4000,
      autorestart: true,
      exp_backoff_restart_delay: 100,
      combine_logs: true,
      time: true
    },
    {
      name: 'api-worker',
      script: 'worker.js',
      instances: 2,
      exec_mode: 'cluster',
      watch: true,
      node_args: '--max_old_space_size=4096',
      env: {
        NODE_ENV: 'production',
        WORKER_PORT: 3001
      },
      max_memory_restart: '1G'
    },
    {
      name: 'api-cron',
      script: 'cron.js',
      instances: 1,
      exec_mode: 'fork',
      cron_restart: '0 0 * * *',
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '500M'
    },
    {
      name: 'api-socket',
      script: 'socket.js',
      instances: 2,
      exec_mode: 'cluster',
      watch: true,
      env: {
        NODE_ENV: 'production',
        SOCKET_PORT: 3002
      },
      max_memory_restart: '1G'
    },
    {
      name: 'api-monitor',
      script: 'monitor.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        MONITOR_PORT: 3003
      },
      max_memory_restart: '500M'
    }
  ],

  deploy: {
    production: {
      user: 'linuxuser',
      host: 'doremonsieucap88.com',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/yourrepo.git',
      path: '/home/linuxuser/Nghien-2025/bautroicuabe',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
    }
  }
}; 