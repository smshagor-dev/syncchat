import axios from 'axios';
import store from '../redux/store';
import resolveUploadUrl from './resolveUploadUrl';

let installed = false;
let timer = null;
let requestId = 0;
let dropdown = null;
let activeInput = null;

const getComposer = () => {
  const candidates = [
    ...document.querySelectorAll(
      'textarea[name="text"], input[name="text"], textarea[data-chat-composer], input[data-chat-composer]'
    ),
  ];
  return (
    candidates.reverse().find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !node.disabled;
    }) || null
  );
};

const removeDropdown = () => {
  if (dropdown?.parentNode) dropdown.parentNode.removeChild(dropdown);
  dropdown = null;
  activeInput = null;
};

const isGroupAdmin = (room, userId) => {
  const group = room?.channel || room?.group || {};
  const admins = [group.adminId, ...(Array.isArray(group.adminsId) ? group.adminsId : [])]
    .filter(Boolean)
    .map(String);
  return admins.includes(String(userId || ''));
};

const setNativeValue = (element, value) => {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) descriptor.set.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
};

const insertMention = (input, username) => {
  if (!input) return;
  const value = String(input.value || '');
  const cursor = Number.isInteger(input.selectionStart) ? input.selectionStart : value.length;
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  const match = before.match(/(^|\s)@([a-z0-9_]*)$/i);
  if (!match) return;
  const tokenStart = cursor - match[0].length + match[1].length;
  const next = `${value.slice(0, tokenStart)}@${username} ${after}`;
  setNativeValue(input, next);
  const nextCursor = tokenStart + username.length + 2;
  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange?.(nextCursor, nextCursor);
  });
  removeDropdown();
};

const createItem = ({ input, username, fullname, avatar, special = false }) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:10px',
    'width:100%',
    'border:0',
    'background:transparent',
    'padding:9px 10px',
    'cursor:pointer',
    'text-align:left',
    'color:inherit',
  ].join(';');
  button.onmouseenter = () => {
    button.style.background = 'rgba(148,163,184,.15)';
  };
  button.onmouseleave = () => {
    button.style.background = 'transparent';
  };

  const avatarNode = document.createElement(special ? 'div' : 'img');
  avatarNode.style.cssText =
    'width:34px;height:34px;border-radius:999px;flex:0 0 auto;display:grid;place-items:center;background:#e2e8f0;object-fit:cover;font-weight:700;color:#334155';
  if (special) avatarNode.textContent = '@';
  else {
    avatarNode.src = resolveUploadUrl(avatar || '') || '/assets/icons/default-avatar.png';
    avatarNode.alt = '';
  }

  const copy = document.createElement('div');
  copy.style.cssText = 'min-width:0;display:grid;gap:1px';
  const title = document.createElement('div');
  title.style.cssText = 'font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  title.textContent = fullname || `@${username}`;
  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'font-size:11px;opacity:.58;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  subtitle.textContent = `@${username}`;
  copy.append(title, subtitle);
  button.append(avatarNode, copy);
  button.onclick = () => insertMention(input, username);
  return button;
};

const renderDropdown = ({ input, room, master, query, profiles }) => {
  removeDropdown();
  const items = [];
  if (room?.roomType === 'group') {
    if (isGroupAdmin(room, master?._id) && 'all'.startsWith(query)) {
      items.push({ username: 'all', fullname: 'Mention everyone', special: true });
    }
    if ('admins'.startsWith(query)) {
      items.push({ username: 'admins', fullname: 'Mention admins', special: true });
    }
  }
  profiles.forEach((profile) => items.push({ ...profile, special: false }));
  if (!items.length) return;

  const rect = input.getBoundingClientRect();
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed',
    `left:${Math.max(8, Math.min(rect.left, window.innerWidth - 300))}px`,
    `bottom:${Math.max(8, window.innerHeight - rect.top + 8)}px`,
    `width:${Math.min(292, Math.max(220, rect.width))}px`,
    'max-height:280px',
    'overflow:auto',
    'z-index:1200',
    'border:1px solid rgba(148,163,184,.28)',
    'border-radius:12px',
    'background:var(--mention-bg,#fff)',
    'color:#0f172a',
    'box-shadow:0 16px 44px rgba(15,23,42,.22)',
    'padding:5px',
  ].join(';');
  items.forEach((item) => panel.appendChild(createItem({ input, ...item })));
  document.body.appendChild(panel);
  dropdown = panel;
  activeInput = input;
};

const loadSuggestions = async (input, query) => {
  const state = store.getState();
  const room = state?.room?.chat?.data;
  const master = state?.user?.master;
  if (!room?.roomId || !master?._id) {
    removeDropdown();
    return;
  }

  const currentRequest = ++requestId;
  try {
    const { data } = await axios.get(
      `/chat-v2/mention-suggestions/${room.roomId}`,
      { params: { q: query } }
    );
    if (currentRequest !== requestId) return;
    renderDropdown({
      input,
      room,
      master,
      query,
      profiles: Array.isArray(data?.payload) ? data.payload : [],
    });
  } catch (error0) {
    removeDropdown();
  }
};

const inspectInput = (input) => {
  const value = String(input.value || '');
  const cursor = Number.isInteger(input.selectionStart) ? input.selectionStart : value.length;
  const before = value.slice(0, cursor);
  const match = before.match(/(^|\s)@([a-z0-9_]*)$/i);
  if (!match) {
    removeDropdown();
    return;
  }
  const query = String(match[2] || '').toLowerCase();
  clearTimeout(timer);
  timer = setTimeout(() => loadSuggestions(input, query), 180);
};

const onInput = (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  if (target !== getComposer()) return;
  inspectInput(target);
};

const onKeyDown = (event) => {
  if (!dropdown || event.target !== activeInput) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    removeDropdown();
  }
};

const installMentionAutocompleteV2 = () => {
  if (installed) return;
  installed = true;
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener(
    'click',
    (event) => {
      if (!dropdown) return;
      if (dropdown.contains(event.target) || event.target === activeInput) return;
      removeDropdown();
    },
    true
  );
  window.addEventListener('resize', removeDropdown);
  window.addEventListener('scroll', removeDropdown, true);
};

export default installMentionAutocompleteV2;
