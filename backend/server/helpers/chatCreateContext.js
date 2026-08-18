const { AsyncLocalStorage } = require('async_hooks');
const ChatModel = require('../db/models/chat');

const storage = new AsyncLocalStorage();
let installed = false;
let originalCreate = null;

const installChatCreateContext = () => {
  if (installed) return;
  installed = true;
  originalCreate = ChatModel.create.bind(ChatModel);

  ChatModel.create = async (values = {}) => {
    const context = storage.getStore();
    const matches = !!(
      context &&
      !context.consumed &&
      String(values.roomId || '') === String(context.roomId || '') &&
      String(values.userId || '') === String(context.userId || '') &&
      !values.isSecretSystemMessage
    );

    if (!matches) return originalCreate(values);

    context.consumed = true;
    return originalCreate({
      ...values,
      clientMessageId: values.clientMessageId || context.clientMessageId || null,
      sequence: Number(values.sequence || 0) || Number(context.sequence || 0),
      mentionUserIds:
        Array.isArray(values.mentionUserIds) && values.mentionUserIds.length
          ? values.mentionUserIds
          : context.mentionUserIds || [],
      topicId: values.topicId || context.topicId || null,
      e2eeEnvelope: values.e2eeEnvelope || context.e2eeEnvelope || null,
      transcript: values.transcript || context.transcript || '',
    });
  };
};

const runChatCreateContext = (context, handler) => {
  installChatCreateContext();
  return storage.run({ ...(context || {}), consumed: false }, handler);
};

module.exports = {
  installChatCreateContext,
  runChatCreateContext,
};
