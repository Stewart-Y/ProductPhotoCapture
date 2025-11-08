module.exports = {
  apps: [
    // Production Server
    {
      name: 'prod-server',
      script: './server/server.js',
      cwd: '/home/ubuntu/ProductPhotoCapture',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },

    // Production Client (serve static files)
    {
      name: 'prod-client',
      script: 'npx',
      args: 'serve ./client/dist -l 5173 -s',
      cwd: '/home/ubuntu/ProductPhotoCapture',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false
    },

    // Staging Server
    {
      name: 'staging-server',
      script: './server/server.js',
      cwd: '/home/ubuntu/ProductPhotoCapture-staging',
      env: {
        NODE_ENV: 'staging',
        PORT: 4001,
        DB_PATH: './db-staging.sqlite'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },

    // Staging Client
    {
      name: 'staging-client',
      script: 'npx',
      args: 'serve ./client/dist -l 5174 -s',
      cwd: '/home/ubuntu/ProductPhotoCapture-staging',
      env: {
        NODE_ENV: 'staging'
      },
      instances: 1,
      autorestart: true,
      watch: false
    }
  ]
};