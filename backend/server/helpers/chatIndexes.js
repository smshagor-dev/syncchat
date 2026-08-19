const ChatModel = require('../db/models/chat');
const logger = require('./logger');

const INDEX_NAME = 'userId_1_clientMessageId_1';

const isDesiredIndex = (index = {}) =>
  index.name === INDEX_NAME &&
  index.unique === true &&
  index.partialFilterExpression?.clientMessageId?.$type === 'string';

const ensureChatIndexes = async () => {
  const collection = ChatModel.mongoModel.collection;
  let indexes = [];
  try {
    indexes = await collection.indexes();
  } catch (error0) {
    if (error0?.codeName !== 'NamespaceNotFound') throw error0;
  }

  const existing = indexes.find((index) => index.name === INDEX_NAME);
  if (existing && isDesiredIndex(existing)) return;

  if (existing) {
    await collection.dropIndex(INDEX_NAME);
    logger.warn('CHAT_INDEX_REPLACED', {
      index: INDEX_NAME,
      reason: 'legacy nullable unique index',
    });
  }

  await collection.createIndex(
    { userId: 1, clientMessageId: 1 },
    {
      name: INDEX_NAME,
      unique: true,
      partialFilterExpression: {
        clientMessageId: { $type: 'string' },
      },
    }
  );

  logger.info('CHAT_INDEX_READY', {
    index: INDEX_NAME,
    partial: true,
  });
};

module.exports = ensureChatIndexes;
