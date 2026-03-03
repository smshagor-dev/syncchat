import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import socket from '../../helpers/socket';

const EVENT_PREFIX = '__event__::';

function AttachEvent() {
  const dispatch = useDispatch();
  const {
    modal: { attachEvent },
    room: { chat: chatRoom },
    user: { master, setting },
  } = useSelector((state) => state);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [linkType, setLinkType] = useState('Website');
  const [url, setUrl] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState('');

  const closeModal = () => {
    setTitle('');
    setDate('');
    setTime('');
    setLinkType('Website');
    setUrl('');
    setDetails('');
    setStatus('');
    dispatch(setModal({ target: 'attachEvent', data: false }));
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

  const handleSend = (e) => {
    e.preventDefault();
    if (!canSendNow()) {
      setStatus('You cannot send messages in this room right now.');
      return;
    }

    const cleanTitle = title.trim();
    if (!cleanTitle || !date) {
      setStatus('Event title and date are required.');
      return;
    }

    const cleanUrl = url.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
      setStatus('URL must start with http:// or https://');
      return;
    }

    const eventPayload = {
      version: 1,
      title: cleanTitle,
      date,
      time: time || '',
      details: details.trim(),
      link: cleanUrl
        ? {
            type: linkType || 'Website',
            url: cleanUrl,
          }
        : null,
      createdAt: new Date().toISOString(),
    };
    const eventText = `${EVENT_PREFIX}${JSON.stringify(eventPayload)}`;

    socket.emit('chat/insert', {
      roomId: chatRoom.data.roomId,
      userId: master._id,
      ownersId: chatRoom.data.ownersId,
      roomType: chatRoom.data.roomType,
      text: eventText,
      file: null,
      replyTo: null,
    });

    closeModal();
  };

  return (
    <div
      className={`${
        attachEvent ? 'delay-75 z-50' : '-z-50 opacity-0 delay-300'
      } absolute inset-0 flex justify-center items-center bg-spill-600/40 dark:bg-black/60`}
      aria-hidden
      onClick={closeModal}
    >
      <div
        aria-hidden
        className={`${
          !attachEvent && 'scale-0'
        } transition relative w-[560px] m-6 rounded-md overflow-hidden bg-white dark:bg-spill-800`}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSend}>
          <div className="h-14 px-4 flex items-center justify-between border-b border-spill-200 dark:border-spill-700">
            <h1 className="text-lg font-bold">Create Event</h1>
            <button
              type="button"
              className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
              onClick={closeModal}
            >
              <bi.BiX />
            </button>
          </div>

          <div className="p-4 grid gap-3">
            <label className="grid gap-1" htmlFor="event-title">
              <span className="text-sm opacity-80">Event Title</span>
              <input
                id="event-title"
                type="text"
                autoComplete="off"
                placeholder="Team sync meeting"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-10 px-3 rounded-md border border-spill-300 dark:border-spill-700"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1" htmlFor="event-date">
                <span className="text-sm opacity-80">Date</span>
                <input
                  id="event-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-10 px-3 rounded-md border border-spill-300 dark:border-spill-700"
                />
              </label>
              <label className="grid gap-1" htmlFor="event-time">
                <span className="text-sm opacity-80">Time</span>
                <input
                  id="event-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-10 px-3 rounded-md border border-spill-300 dark:border-spill-700"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1" htmlFor="event-link-type">
                <span className="text-sm opacity-80">Link Type</span>
                <select
                  id="event-link-type"
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value)}
                  className="h-10 px-3 rounded-md border border-spill-300 dark:border-spill-700 bg-transparent"
                >
                  <option value="Website">Website</option>
                  <option value="Meet">Meet</option>
                  <option value="Zoom">Zoom</option>
                  <option value="Maps">Maps</option>
                </select>
              </label>
              <label className="grid gap-1" htmlFor="event-url">
                <span className="text-sm opacity-80">URL</span>
                <input
                  id="event-url"
                  type="url"
                  autoComplete="off"
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-10 px-3 rounded-md border border-spill-300 dark:border-spill-700"
                />
              </label>
            </div>

            <label className="grid gap-1" htmlFor="event-details">
              <span className="text-sm opacity-80">Details</span>
              <input
                id="event-details"
                type="text"
                autoComplete="off"
                placeholder="Agenda, notes..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="h-10 px-3 rounded-md border border-spill-300 dark:border-spill-700"
              />
            </label>

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
              Send Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AttachEvent;
