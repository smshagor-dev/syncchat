import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import { setChatRoom } from '../../redux/features/room';
import {
  setRefreshContact,
  setRefreshFriendProfile,
} from '../../redux/features/chore';

function NewContact() {
  const dispatch = useDispatch();
  const modal = useSelector((state) => state.modal);
  const master = useSelector((state) => state.user.master);

  const [respond, setRespond] = useState({ success: true, message: null });
  const [form, setForm] = useState({ identity: '' });

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    try {
      e.preventDefault();
      const identity = form.identity.trim();
      if (!identity) return;

      const { data } = await axios.post('/contacts', { identity });
      const friendId = data.payload?.friendId;
      const roomId = data.payload?.roomId;

      let profile = null;
      if (friendId) {
        const searchRespond = await axios.get('/contacts/search', {
          params: { q: identity },
        });

        profile =
          (searchRespond.data.payload || []).find(
            (item) => item.userId === friendId
          ) || null;
      }

      setRespond({ success: true, message: data.message });
      setForm({ identity: '' });

      // refresh contact and friend's profile page
      dispatch(setRefreshContact(uuidv4()));
      dispatch(setRefreshFriendProfile(uuidv4()));
      if (roomId && profile) {
        dispatch(
          setChatRoom({
            isOpen: true,
            refreshId: roomId,
            data: {
              ownersId: [master._id, profile.userId],
              roomId,
              roomType: 'private',
              profile: {
                ...profile,
                active: true,
              },
            },
          })
        );
      }

      setTimeout(() => {
        // reset response dialog
        setRespond({ success: true, message: '' });
        // and close new-contact modal after 1s
        dispatch(
          setModal({
            target: 'newcontact',
            data: false,
          })
        );
      }, 1000);
    } catch (error0) {
      const message = error0?.response?.data?.message || error0.message;
      setRespond({
        success: false,
        message,
      });
    }
  };

  useEffect(() => {
    if (modal.newcontact) {
      setForm((prev) => ({
        ...prev,
        identity: modal.newcontact?.username ?? '',
      }));
    }
  }, [!!modal.newcontact]);

  return (
    <div
      className={`
        ${modal.newcontact ? 'delay-75 z-50' : '-z-50 opacity-0 delay-300'}
        absolute w-full h-full flex justify-center items-center
        bg-spill-600/40 dark:bg-black/60
      `}
      aria-hidden
      onClick={() => {
        setRespond((prev) => ({ ...prev, message: null }));
        setForm({ identity: '' });
      }}
    >
      <div
        aria-hidden
        className={`${
          !modal.newcontact && 'scale-0'
        } transition w-[460px] m-6 p-4 grid rounded-md bg-white dark:bg-spill-800`}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold">New Contact</h1>
          {respond.message && (
            <p
              className={`mt-1 text-sm ${
                !respond.success && 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {respond.message}
            </p>
          )}
        </div>
        {/* content */}
        <div>
          <form method="post" onSubmit={handleSubmit} className="grid">
            <label htmlFor="identity" className="relative flex items-center">
              <input
                type="text"
                name="identity"
                id="identity"
                autoComplete="off"
                minLength={2}
                maxLength={255}
                required
                placeholder="Username, email, or phone number"
                value={form.identity}
                className={`${
                  form.identity.length > 0
                    ? 'peer valid:bg-spill-50 dark:valid:bg-spill-900'
                    : ''
                } w-full py-2 pl-4 pr-12 border border-solid border-spill-300 dark:border-spill-500 rounded-md focus:border-black dark:focus:border-sky-400`}
                onChange={handleChange}
              />
              <bi.BiCheck className="absolute right-0 text-xl text-sky-600 dark:text-sky-400 hidden peer-valid:block -translate-x-4" />
              <bi.BiX className="absolute right-0 text-xl text-red-600 dark:text-red-400 hidden peer-invalid:block -translate-x-4" />
            </label>
            <p className="mt-2 text-xs opacity-70">
              Enter username, email or phone. Contact will be added and chat
              opens instantly.
            </p>
            <span className="flex gap-2 mt-6 justify-end">
              <button
                type="button"
                className="py-2 px-4 rounded-md hover:bg-gray-100 dark:hover:bg-spill-700"
                onClick={() => {
                  dispatch(setModal({ target: 'newcontact' }));
                  // reset state
                  setRespond((prev) => ({ ...prev, message: null }));
                  setForm({ identity: '' });
                }}
              >
                <p>Cancel</p>
              </button>
              <button
                type="submit"
                className="py-2 px-4 rounded-md bg-blue-600 hover:bg-blue-700"
              >
                <p className="font-bold text-white/90">Add & Chat</p>
              </button>
            </span>
          </form>
        </div>
      </div>
    </div>
  );
}

export default NewContact;
