import axios from 'axios';

let installed = false;

const selectedTopic = (roomId) =>
  String(localStorage.getItem(`syncchat:topic:${roomId}`) || '').trim();

const installTopicFilterV2 = () => {
  if (installed) return;
  installed = true;

  axios.interceptors.response.use((response0) => {
    const method = String(response0?.config?.method || '').toLowerCase();
    const url = String(response0?.config?.url || '');
    const match = url.match(/^\/chats\/([^/?]+)(?:\?|$)/);
    if (method !== 'get' || !match || !Array.isArray(response0?.data?.payload)) {
      return response0;
    }

    const roomId = match[1];
    const topicId = selectedTopic(roomId);
    if (!topicId) return response0;

    // Keep topic system/pin messages visible only when they explicitly belong
    // to the selected topic. Legacy pre-topic messages stay in "All messages".
    // eslint-disable-next-line no-param-reassign
    response0.data.payload = response0.data.payload.filter(
      (chat) => String(chat?.topicId || '') === topicId
    );
    // eslint-disable-next-line no-param-reassign
    response0.data.topicId = topicId;
    return response0;
  });
};

export default installTopicFilterV2;
