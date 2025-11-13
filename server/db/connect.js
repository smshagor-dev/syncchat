const mongoose = require('mongoose');
const { isDev, db } = require('../config');

module.exports = async () => {
  try {
    const uri = isDev ? `mongodb://localhost:27017/${db.name}` : process.env.MONGO_URI;

    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('Database connected successfully');
  } catch (err) {
    console.error('Failed to connect to MongoDB:');
    console.error(err); // full error object
    process.exit(1);
  }
};
