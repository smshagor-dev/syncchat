const database = require('./sequelize');
const AdminModel = require('./models/admin');
const encrypt = require('../helpers/encrypt');
const { ensureDefaultRoles } = require('../helpers/adminPermissions');
const AdminRoleModel = require('./models/adminRole');

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
    await database.authenticate();
    await database.sync();
    await seedInitialAdmin();

    console.log('MongoDB connected successfully');
  } catch (err) {
    console.error('Failed to connect to MongoDB:');
    console.error(err);
    // Let the runtime bootstrap promise reject instead of terminating the
    // serverless worker. Vercel requests can then return a controlled 503 and
    // the next cold start/request can retry after a transient DB outage.
    throw err;
  }
};
