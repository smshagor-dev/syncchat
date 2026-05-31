const sequelize = require('./sequelize');
const { db } = require('../config');
const AdminModel = require('./models/admin');
const encrypt = require('../helpers/encrypt');
const { ensureDefaultRoles } = require('../helpers/adminPermissions');
const AdminRoleModel = require('./models/adminRole');

const normalizeTableName = (table) => {
  if (typeof table === 'string') return table;
  if (table && typeof table === 'object') return Object.values(table)[0];
  return null;
};

const cleanupDuplicateUniqueIndexes = async (tableName) => {
  const qi = sequelize.getQueryInterface();

  let indexes = [];
  try {
    indexes = await qi.showIndex(tableName);
  } catch (error0) {
    if (
      /doesn't exist|does not exist|unknown table/i.test(error0.message) ||
      error0?.original?.code === 'ER_NO_SUCH_TABLE'
    ) {
      return;
    }
    throw error0;
  }

  const indexedByFieldSignature = indexes
    .filter((index) => index.unique && !index.primary)
    .map((index) => ({
      ...index,
      fieldSignature: (index.fields || [])
        .map((field) => field.attribute || '')
        .filter(Boolean),
    }))
    .filter((index) => index.fieldSignature.length > 0)
    .reduce((acc, index) => {
      const key = index.fieldSignature.join('|');
      const prev = acc.get(key) || [];
      acc.set(key, [...prev, index]);
      return acc;
    }, new Map());

  const duplicateIndexNames = [...indexedByFieldSignature.values()]
    .filter((arr) => arr.length > 1)
    .flatMap((arr) => arr.slice(1).map((item) => item.name));

  await Promise.all(
    duplicateIndexNames.map(async (indexName) => {
      try {
        await qi.removeIndex(tableName, indexName);
      } catch (error0) {
        if (
          !/check that column\/key exists|can't drop|doesn't exist/i.test(
            error0.message
          )
        ) {
          throw error0;
        }
      }
    })
  );
};

const seedInitialAdmin = async () => {
  await ensureDefaultRoles();

  const count = await AdminModel.count();
  if (count > 0) return;

  const superRole = await AdminRoleModel.findOne({
    where: { name: 'super-admin' },
  });

  await AdminModel.create({
    fullname: 'System Admin',
    email: 'admin@admin.com',
    password: encrypt('admin'),
    role: 'super-admin',
    roleId: superRole?._id || null,
    active: true,
  });

  console.log('Seeded default admin: admin@admin.com');
};

module.exports = async () => {
  try {
    const qi = sequelize.getQueryInterface();
    await sequelize.authenticate();
    const tables = (await qi.showAllTables())
      .map(normalizeTableName)
      .filter(Boolean);
    await Promise.all(
      tables.map((tableName) => cleanupDuplicateUniqueIndexes(tableName))
    );

    if (db.autoMigrate) {
      await sequelize.sync({ alter: true });
    } else {
      await sequelize.sync();
    }

    await seedInitialAdmin();

    console.log('Database connected successfully');
  } catch (err) {
    console.error('Failed to connect to MySQL:');
    console.error(err); // full error object
    process.exit(1);
  }
};
