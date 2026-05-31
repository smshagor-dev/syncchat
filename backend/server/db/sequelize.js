const { Sequelize } = require('sequelize');
const { db, isDev } = require('../config');

const sequelize = new Sequelize(db.name, db.user, db.pass, {
  host: db.host,
  port: db.port,
  dialect: 'mysql',
  logging: isDev ? console.log : false,
  define: {
    freezeTableName: true,
  },
});

module.exports = sequelize;
