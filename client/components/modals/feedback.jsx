import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';

function Feedback() {
  const dispatch = useDispatch();
  const open = useSelector((state) => state.modal.feedback);

  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [respond, setRespond] = useState(null);

  const handleSubmit = async () => {
    const text = message.trim();

    if (text.length < 10 || sending) {
      return;
    }

    try {
      setSending(true);
      setRespond(null);

      const { data } = await axios.post('/users/feedback', {
        message: text,
      });

      setRespond({
        success: true,
        message: data.message,
      });
      setMessage('');
    } catch (error0) {
      setRespond({
        success: false,
        message:
          error0?.response?.data?.message ||
          'Failed to send feedback. Please try again.',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={`
        ${open ? 'delay-75 z-[60]' : '-z-50 opacity-0 delay-300'}
        absolute inset-0 w-full h-full flex justify-center items-center
        bg-spill-600/40 dark:bg-black/60
      `}
      aria-hidden
      onClick={() => dispatch(setModal({ target: 'feedback', data: false }))}
    >
      <div
        aria-hidden
        className={`
          ${!open && 'scale-0'}
          transition relative w-[520px] max-w-[92vw] m-6 rounded-md overflow-hidden
          bg-white dark:bg-spill-800
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-spill-200 dark:border-spill-700">
          <h1 className="text-lg font-bold">Send feedback</h1>
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
            onClick={() =>
              dispatch(setModal({ target: 'feedback', data: false }))
            }
          >
            <bi.BiX />
          </button>
        </div>

        <div className="p-4 grid gap-3">
          <p className="text-sm text-slate-600 dark:text-spill-300">
            Help us improve your chat experience. Share bugs, ideas, or any
            issue you faced.
          </p>
          <textarea
            id="feedback-message"
            name="feedbackMessage"
            autoComplete="off"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your feedback here..."
            className="w-full p-3 rounded-md border border-spill-300 dark:border-spill-600 bg-spill-50 dark:bg-spill-900/70 resize-none"
          />
          {respond && (
            <p
              className={`text-sm ${
                respond.success
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {respond.message}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={sending || message.trim().length < 10}
              className={`
                px-6 py-2 rounded-full font-semibold text-white
                ${
                  sending || message.trim().length < 10
                    ? 'bg-emerald-400/70 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }
              `}
              onClick={handleSubmit}
            >
              {sending ? 'Sending...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Feedback;
