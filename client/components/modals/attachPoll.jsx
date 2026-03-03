import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import socket from '../../helpers/socket';

const POLL_PREFIX = '__poll__::';

const buildInitialOptions = () => [
  { id: `poll-opt-${Date.now()}-1`, value: '' },
  { id: `poll-opt-${Date.now()}-2`, value: '' },
];

function AttachPoll() {
  const dispatch = useDispatch();
  const {
    modal: { attachPoll },
    room: { chat: chatRoom },
    user: { master, setting },
  } = useSelector((state) => state);

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(buildInitialOptions());
  const [status, setStatus] = useState('');

  const closeModal = () => {
    setQuestion('');
    setOptions(buildInitialOptions());
    setStatus('');
    dispatch(setModal({ target: 'attachPoll', data: false }));
  };

  const canSendNow = () => {
    if (!chatRoom?.data) return false;
    const isGroup = chatRoom.data.roomType === 'group';
    const isBlocked =
      !isGroup &&
      setting?.blockedUserIds?.includes(chatRoom.data?.profile?.userId);
    const allowed =
      (!isGroup && chatRoom.data.profile?.active) ||
      (isGroup && chatRoom.data.group?.participantsId?.includes(master._id));
    return allowed && !isBlocked;
  };

  const handleOptionChange = (id, value) => {
    setOptions((prev) =>
      prev.map((option) => (option.id === id ? { ...option, value } : option))
    );
  };

  const addOption = () => {
    setOptions((prev) =>
      prev.length >= 6
        ? prev
        : [...prev, { id: `poll-opt-${Date.now()}-${prev.length}`, value: '' }]
    );
  };

  const removeOption = (id) => {
    setOptions((prev) =>
      prev.length <= 2 ? prev : prev.filter((option) => option.id !== id)
    );
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!canSendNow()) {
      setStatus('You cannot send messages in this room right now.');
      return;
    }

    const cleanQuestion = question.trim();
    const cleanOptions = options
      .map((item) => item.value.trim())
      .filter(Boolean);
    if (!cleanQuestion || cleanOptions.length < 2) {
      setStatus('Please add a question and at least two options.');
      return;
    }

    const pollPayload = {
      version: 1,
      question: cleanQuestion,
      options: cleanOptions.map((option, index) => ({
        id: `opt-${Date.now()}-${index + 1}`,
        text: option,
        votes: [],
      })),
      createdBy: master._id,
      createdAt: new Date().toISOString(),
    };
    const pollText = `${POLL_PREFIX}${JSON.stringify(pollPayload)}`;

    socket.emit('chat/insert', {
      roomId: chatRoom.data.roomId,
      userId: master._id,
      ownersId: chatRoom.data.ownersId,
      roomType: chatRoom.data.roomType,
      text: pollText,
      file: null,
      replyTo: null,
    });

    closeModal();
  };

  return (
    <div
      className={`${
        attachPoll ? 'delay-75 z-50' : '-z-50 opacity-0 delay-300'
      } absolute inset-0 flex justify-center items-center bg-spill-600/40 dark:bg-black/60`}
      aria-hidden
      onClick={closeModal}
    >
      <div
        aria-hidden
        className={`${
          !attachPoll && 'scale-0'
        } transition relative w-[540px] m-6 rounded-md overflow-hidden bg-white dark:bg-spill-800`}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSend}>
          <div className="h-14 px-4 flex items-center justify-between border-b border-spill-200 dark:border-spill-700">
            <h1 className="text-lg font-bold">Create Poll</h1>
            <button
              type="button"
              className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
              onClick={closeModal}
            >
              <bi.BiX />
            </button>
          </div>

          <div className="p-4 grid gap-3">
            <label className="grid gap-1" htmlFor="poll-question">
              <span className="text-sm opacity-80">Question</span>
              <input
                id="poll-question"
                type="text"
                autoComplete="off"
                placeholder="Ask a question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="h-10 px-3 rounded-md border border-spill-300 dark:border-spill-700"
              />
            </label>

            <div className="grid gap-2">
              {options.map((option, index) => (
                <div
                  key={option.id}
                  className="grid grid-cols-[1fr_auto] gap-2"
                >
                  <input
                    id={option.id}
                    type="text"
                    autoComplete="off"
                    placeholder={`Option ${index + 1}`}
                    value={option.value}
                    onChange={(e) =>
                      handleOptionChange(option.id, e.target.value)
                    }
                    className="h-10 px-3 rounded-md border border-spill-300 dark:border-spill-700"
                  />
                  <button
                    type="button"
                    className="px-3 rounded-md border border-spill-300 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-700 disabled:opacity-50"
                    onClick={() => removeOption(option.id)}
                    disabled={options.length <= 2}
                  >
                    <bi.BiTrashAlt />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="h-10 rounded-md border border-dashed border-sky-400 text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/20 disabled:opacity-50"
              onClick={addOption}
              disabled={options.length >= 6}
            >
              Add Option
            </button>

            {status && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {status}
              </p>
            )}
          </div>

          <div className="h-14 px-4 border-t border-spill-200 dark:border-spill-700 flex justify-end items-center">
            <button
              type="submit"
              className="h-10 px-4 rounded-md bg-sky-600 text-white hover:brightness-110"
            >
              Send Poll
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AttachPoll;
