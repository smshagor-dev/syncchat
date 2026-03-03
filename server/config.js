const isDev = process.env.NODE_ENV === 'development';

module.exports = {
  isDev,
  cors: {
    origin: [process.env.APP_ORIGIN || 'http://localhost:3000'],
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'syncchat',
    user: process.env.DB_USER || 'root',
    pass: process.env.DB_PASSWORD || '',
    autoMigrate: process.env.DB_AUTO_MIGRATE !== 'false',
  },
};
