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
  const [pollMode, setPollMode] = useState('poll');
  const [anonymous, setAnonymous] = useState(false);
  const [multiSelect, setMultiSelect] = useState(false);
  const [correctOptionIds, setCorrectOptionIds] = useState([]);
  const [status, setStatus] = useState('');

  const closeModal = () => {
    setQuestion('');
    setOptions(buildInitialOptions());
    setPollMode('poll');
    setAnonymous(false);
    setMultiSelect(false);
    setCorrectOptionIds([]);
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
    setCorrectOptionIds((prev) => prev.filter((optionId) => optionId !== id));
  };

  const toggleCorrectOption = (id) => {
    if (pollMode !== 'quiz') return;
    if (multiSelect) {
      setCorrectOptionIds((prev) =>
        prev.includes(id)
          ? prev.filter((item) => item !== id)
          : [...prev, id]
      );
      return;
    }
    setCorrectOptionIds((prev) => (prev[0] === id ? [] : [id]));
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
    const optionRows = options
      .map((item) => ({
        id: item.id,
        text: item.value.trim(),
      }))
      .filter((item) => item.text);

    const validCorrectIds = correctOptionIds.filter((id) =>
      optionRows.some((item) => item.id === id)
    );
    if (pollMode === 'quiz' && validCorrectIds.length === 0) {
      setStatus('Select at least one correct answer for quiz.');
      return;
    }

    const pollPayload = {
      version: 2,
      mode: pollMode,
      question: cleanQuestion,
      options: optionRows.map((option, index) => ({
        id: option.id || `opt-${Date.now()}-${index + 1}`,
        text: option.text,
        votes: [],
      })),
      anonymous,
      multiSelect,
      correctOptionIds: pollMode === 'quiz' ? validCorrectIds : [],
      closedAt: null,
      closedBy: null,
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
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'poll', label: 'Poll' },
                  { id: 'quiz', label: 'Quiz' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`h-9 rounded-md border text-sm font-medium ${
                      pollMode === item.id
                        ? 'border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-900/30 dark:text-sky-300'
                        : 'border-spill-300 hover:bg-spill-100 dark:border-spill-700 dark:hover:bg-spill-700'
                    }`}
                    onClick={() => setPollMode(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="h-9 rounded-md border border-spill-300 px-3 text-xs flex items-center justify-between dark:border-spill-700">
                  <span>Anonymous</span>
                  <input
                    type="checkbox"
                    checked={anonymous}
                    onChange={(e) => setAnonymous(e.target.checked)}
                  />
                </label>
                <label className="h-9 rounded-md border border-spill-300 px-3 text-xs flex items-center justify-between dark:border-spill-700">
                  <span>Multi select</span>
                  <input
                    type="checkbox"
                    checked={multiSelect}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setMultiSelect(checked);
                      if (!checked && correctOptionIds.length > 1) {
                        setCorrectOptionIds((prev) => prev.slice(0, 1));
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="grid gap-2">
              {options.map((option, index) => (
                <div
                  key={option.id}
                  className="grid grid-cols-[auto_1fr_auto] gap-2"
                >
                  {pollMode === 'quiz' ? (
                    <button
                      type="button"
                      className={`h-10 w-10 rounded-md border text-sm font-semibold ${
                        correctOptionIds.includes(option.id)
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'border-spill-300 dark:border-spill-700'
                      }`}
                      onClick={() => toggleCorrectOption(option.id)}
                      title="Mark correct answer"
                    >
                      {correctOptionIds.includes(option.id) ? 'A' : '?'}
                    </button>
                  ) : (
                    <span className="h-10 w-10 rounded-md border border-spill-300 dark:border-spill-700 grid place-items-center text-xs opacity-70">
                      {index + 1}
                    </span>
                  )}
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
