module.exports = {
  apps: [{
    name: 'jclaw',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: { NODE_ENV: 'production' },
    max_memory_restart: '256M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/jclaw/error.log',
    out_file: '/var/log/jclaw/out.log',
    merge_logs: true,
  }],
};
