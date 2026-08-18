import axios from 'axios';
import config from './config';

const PANEL_CLASS = 'admin-password-card';

const getToken = () => localStorage.getItem('admin_token');

const setMessage = (panel, text, type = '') => {
  const node = panel.querySelector('[data-password-message]');
  if (!node) return;
  node.textContent = text || '';
  node.className = `form-message${type ? ` ${type}` : ''}`;
  node.style.display = text ? 'block' : 'none';
};

const createPanel = () => {
  const panel = document.createElement('section');
  panel.className = `panel-card ${PANEL_CLASS}`;
  panel.innerHTML = `
    <h3>Change Password</h3>
    <p style="margin: -4px 0 18px; color: var(--muted);">
      Update the password for the currently signed-in admin account. Other active admin sessions will be revoked.
    </p>
    <form class="form-grid" data-admin-password-form autocomplete="off">
      <label class="field">
        <span>Current password</span>
        <input
          type="password"
          name="currentPassword"
          autocomplete="current-password"
          placeholder="Current password"
          required
        />
      </label>
      <label class="field">
        <span>New password</span>
        <input
          type="password"
          name="newPassword"
          autocomplete="new-password"
          placeholder="Minimum 8 characters"
          minlength="8"
          required
        />
      </label>
      <label class="field">
        <span>Confirm new password</span>
        <input
          type="password"
          name="confirmPassword"
          autocomplete="new-password"
          placeholder="Repeat new password"
          minlength="8"
          required
        />
      </label>
      <p class="form-message" data-password-message style="display:none"></p>
      <button type="submit" class="primary-btn" data-password-submit>
        Change password
      </button>
    </form>
  `;

  const form = panel.querySelector('[data-admin-password-form]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(panel, '');

    const formData = new FormData(form);
    const currentPassword = String(formData.get('currentPassword') || '');
    const newPassword = String(formData.get('newPassword') || '');
    const confirmPassword = String(formData.get('confirmPassword') || '');

    if (newPassword.length < 8) {
      setMessage(panel, 'New password must be at least 8 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage(panel, 'New password and confirmation do not match.', 'error');
      return;
    }

    const button = panel.querySelector('[data-password-submit]');
    button.disabled = true;
    button.textContent = 'Changing...';

    try {
      const token = getToken();
      const { data } = await axios.patch(
        `${config.apiBaseUrl || ''}/admin/profile/password`,
        { currentPassword, newPassword, confirmPassword },
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
      );

      form.reset();
      setMessage(panel, data?.message || 'Password changed successfully.', 'success');
    } catch (error0) {
      setMessage(
        panel,
        error0?.response?.data?.message || error0.message || 'Failed to change password.',
        'error'
      );
    } finally {
      button.disabled = false;
      button.textContent = 'Change password';
    }
  });

  return panel;
};

const mountProfilePasswordPanel = () => {
  if (document.querySelector(`.${PANEL_CLASS}`)) return;

  const profileHeading = [...document.querySelectorAll('section.panel-card > h3')].find(
    (heading) => heading.textContent?.trim() === 'Admin Profile'
  );
  const profilePanel = profileHeading?.closest('section.panel-card');
  if (!profilePanel?.parentNode) return;

  profilePanel.insertAdjacentElement('afterend', createPanel());
};

export const installProfilePasswordPanel = () => {
  const observer = new MutationObserver(mountProfilePasswordPanel);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  mountProfilePasswordPanel();
  return () => observer.disconnect();
};
