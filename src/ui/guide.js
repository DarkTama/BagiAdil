/**
 * In-app guide: a '?' help button plus a modal walkthrough.
 * The guide also auto-opens once on a user's first visit.
 */

import { t } from '../i18n/index.js';

const SEEN_KEY = 'bagiadil_guide_seen';
const STEP_KEYS = ['guide.step1', 'guide.step2', 'guide.step3', 'guide.step4'];

let overlayEl = null;
let lastFocused = null;

/**
 * Initialize the guide: add the help button and auto-open once on first visit.
 */
export function initGuide() {
  const header = document.querySelector('header');
  if (header && !header.querySelector('.help-btn')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'help-btn';
    btn.textContent = '?';
    btn.setAttribute('aria-label', t('guide.title'));
    btn.addEventListener('click', openGuide);
    header.appendChild(btn);
  }

  let seen = false;
  try {
    seen = localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    seen = true; // storage unavailable - don't nag
  }
  if (!seen) {
    openGuide();
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // ignore
    }
  }
}

function openGuide() {
  closeGuide();
  lastFocused = document.activeElement;

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeGuide();
  });

  const modal = document.createElement('div');
  modal.className = 'modal guide-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const title = document.createElement('h2');
  title.className = 'guide-title';
  title.textContent = t('guide.title');
  modal.appendChild(title);

  const list = document.createElement('ol');
  list.className = 'guide-steps';
  STEP_KEYS.forEach((key) => {
    const li = document.createElement('li');
    li.textContent = t(key);
    list.appendChild(li);
  });
  modal.appendChild(list);

  const note = document.createElement('p');
  note.className = 'guide-note';
  note.textContent = t('guide.tabsNote');
  modal.appendChild(note);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-primary guide-close';
  closeBtn.textContent = t('guide.close');
  closeBtn.addEventListener('click', closeGuide);
  modal.appendChild(closeBtn);

  overlayEl.appendChild(modal);
  document.body.appendChild(overlayEl);

  document.addEventListener('keydown', onKeydown);
  closeBtn.focus();
}

function closeGuide() {
  if (!overlayEl) return;
  document.removeEventListener('keydown', onKeydown);
  overlayEl.remove();
  overlayEl = null;
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
  lastFocused = null;
}

function onKeydown(e) {
  if (e.key === 'Escape') closeGuide();
}
