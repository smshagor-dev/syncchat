const TOOL_LINKS = [
  { label: 'Native Call Push', href: '/admin/calling-push.html' },
  { label: 'Calling & WebRTC', href: '/admin/calling.html' },
  { label: 'FTP Storage', href: '/admin/storage.html' },
  { label: 'Social Login', href: '/admin/social-auth.html' },
];

let observer = null;

const createDivider = () => {
  const divider = document.createElement('div');
  divider.dataset.syncchatAdminToolsDivider = '1';
  divider.textContent = 'Infrastructure';
  Object.assign(divider.style, {
    marginTop: '8px',
    padding: '8px 4px 2px',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  });
  return divider;
};

const createToolButton = ({ label, href }) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'nav-item';
  button.dataset.syncchatAdminTool = href;
  button.textContent = label;
  button.addEventListener('click', () => {
    window.location.assign(href);
  });
  return button;
};

const ensureAdminSidebarTools = () => {
  const nav = document.querySelector('.admin-sidebar .admin-nav');
  if (!nav) return;

  if (!nav.querySelector('[data-syncchat-admin-tools-divider="1"]')) {
    nav.appendChild(createDivider());
  }

  TOOL_LINKS.forEach((item) => {
    if (nav.querySelector(`[data-syncchat-admin-tool="${item.href}"]`)) return;
    nav.appendChild(createToolButton(item));
  });
};

export const installAdminSidebarTools = () => {
  ensureAdminSidebarTools();
  if (observer) return;

  observer = new MutationObserver(() => ensureAdminSidebarTools());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};

export default installAdminSidebarTools;
