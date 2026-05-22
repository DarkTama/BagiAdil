/**
 * Lightweight toast notifications.
 * Transient, auto-dismissing messages anchored to a fixed container.
 */

let containerEl = null;

function ensureContainer() {
  if (containerEl && document.body.contains(containerEl)) {
    return containerEl;
  }
  containerEl = document.createElement('div');
  containerEl.id = 'toast-container';
  containerEl.className = 'toast-container';
  document.body.appendChild(containerEl);
  return containerEl;
}

/**
 * Show a transient toast message.
 * @param {string} message - Text to display.
 * @param {'info'|'success'|'warning'|'error'} [type='info']
 * @param {number} [duration=3500] - Milliseconds before auto-dismiss.
 */
export function showToast(message, type = 'info', duration = 3500) {
  if (typeof document === 'undefined' || !message) return;
  const container = ensureContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  container.appendChild(toast);

  const dismiss = () => {
    if (!toast.isConnected) return;
    toast.classList.add('toast--leaving');
    setTimeout(() => toast.remove(), 300);
  };

  const timer = setTimeout(dismiss, duration);
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    dismiss();
  });
}
