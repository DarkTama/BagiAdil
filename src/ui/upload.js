/**
 * Upload UI component for receipt images.
 * Provides file input, camera capture, drag-and-drop, and progress indicator.
 */

import { t } from '../i18n/index.js';

let uploadContainerEl = null;

/**
 * Update translated text in the upload component without resetting state.
 */
export function updateTranslations() {
  if (!uploadContainerEl) return;
  const uploadText = uploadContainerEl.querySelector('.upload-text');
  if (uploadText) uploadText.textContent = t('upload.dragDrop');
  const uploadSubtext = uploadContainerEl.querySelector('.upload-subtext');
  if (uploadSubtext) uploadSubtext.textContent = t('upload.or');
  const uploadBtn = uploadContainerEl.querySelector('.upload-btn');
  if (uploadBtn) uploadBtn.textContent = t('upload.chooseImage');
  const removeBtn = uploadContainerEl.querySelector('.upload-remove');
  if (removeBtn) removeBtn.textContent = t('upload.remove');
  const preview = uploadContainerEl.querySelector('#preview-image');
  if (preview) preview.alt = t('upload.previewAlt');
}

/**
 * Translate an engine progress status (Tesseract / PDF engine, English only)
 * into the current locale.
 * @param {string} [status]
 * @returns {string}
 */
function progressLabel(status = '') {
  const s = status.toLowerCase();
  const page = s.match(/page (\d+) of (\d+)/);
  if (page) return t('upload.pdfPage').replace('{page}', page[1]).replace('{total}', page[2]);
  if (s.includes('recogni')) return t('upload.recognizing');
  if (s.includes('complete')) return t('upload.complete');
  if (/loading|initializ|reading/.test(s)) return t('upload.initializing');
  return t('upload.processing');
}

/**
 * Initialize the upload component.
 * @param {HTMLElement} containerEl - Container element to render into
 * @param {function} onComplete - Callback receiving {text, confidence} from OCR
 */
export function initUpload(containerEl, onComplete) {
  uploadContainerEl = containerEl;
  containerEl.innerHTML = `
    <div class="upload-zone" id="upload-zone">
      <div class="upload-zone-content">
        <p class="upload-icon">\u{1F4F7}</p>
        <p class="upload-text">${t('upload.dragDrop')}</p>
        <p class="upload-subtext">${t('upload.or')}</p>
        <button type="button" class="btn btn-secondary upload-btn" id="upload-btn">${t('upload.chooseImage')}</button>
        <input type="file" id="receipt-file-input" accept="image/jpeg,image/png,image/webp,application/pdf" hidden />
      </div>
    </div>
    <div class="upload-preview" id="upload-preview" hidden>
      <img id="preview-image" alt="${t('upload.previewAlt')}" />
      <button type="button" class="btn btn-danger upload-remove" id="upload-remove">${t('upload.remove')}</button>
    </div>
    <div class="upload-progress" id="upload-progress" hidden>
      <p class="progress-status" id="progress-status">${t('upload.initializing')}</p>
      <div class="progress-bar-container">
        <div class="progress-bar" id="progress-bar"></div>
      </div>
    </div>
  `;

  const zone = containerEl.querySelector('#upload-zone');
  const fileInput = containerEl.querySelector('#receipt-file-input');
  const previewSection = containerEl.querySelector('#upload-preview');
  const previewImage = containerEl.querySelector('#preview-image');
  const removeBtn = containerEl.querySelector('#upload-remove');
  const progressSection = containerEl.querySelector('#upload-progress');
  const progressStatus = containerEl.querySelector('#progress-status');
  const progressBar = containerEl.querySelector('#progress-bar');

  let currentObjectURL = null;

  // Real button = keyboard reachable. No `capture` attribute, so the picker
  // offers camera, gallery and files (receipts are usually screenshots).
  const uploadBtn = containerEl.querySelector('#upload-btn');
  uploadBtn.addEventListener('click', () => fileInput.click());
  // Clicking the empty part of the zone opens the picker too.
  zone.addEventListener('click', (e) => {
    if (e.target !== uploadBtn) fileInput.click();
  });

  // File input change
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  // Drag-and-drop
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('upload-zone-hover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('upload-zone-hover');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('upload-zone-hover');
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      handleFile(file);
    }
  });

  // Remove button
  removeBtn.addEventListener('click', () => {
    resetUpload();
  });

  function showPdfFallback(file) {
    previewImage.hidden = true;
    const pdfPreview = document.createElement('div');
    pdfPreview.className = 'pdf-preview-info';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'pdf-icon';
    iconSpan.textContent = '\u{1F4C4}';
    pdfPreview.appendChild(iconSpan);
    const filenameSpan = document.createElement('span');
    filenameSpan.className = 'pdf-filename';
    filenameSpan.textContent = file.name;
    pdfPreview.appendChild(filenameSpan);
    previewSection.insertBefore(pdfPreview, removeBtn);
  }

  function handleFile(file) {
    // Revoke previous object URL to prevent memory leak
    if (currentObjectURL) {
      URL.revokeObjectURL(currentObjectURL);
      currentObjectURL = null;
    }
    previewSection.querySelector('.pdf-preview-info')?.remove();

    previewImage.hidden = false;
    previewImage.removeAttribute('src');
    if (file.type !== 'application/pdf') {
      currentObjectURL = URL.createObjectURL(file);
      previewImage.src = currentObjectURL;
    }
    zone.hidden = true;
    previewSection.hidden = false;
    progressSection.hidden = false;
    processFile(file);
  }

  async function dataUrlToBlob(dataUrl) {
    try {
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch {
      return null;
    }
  }

  async function processFile(file) {
    progressStatus.textContent = t('upload.initializing');
    progressBar.style.width = '0%';

    const onProgress = (info) => {
      progressStatus.textContent = progressLabel(info.status);
      progressBar.style.width = `${Math.round((info.progress || 0) * 100)}%`;
    };

    // Receipt image saved alongside the split in history.
    let receiptBlob = null;

    try {
      let result;

      if (file.type === 'application/pdf') {
        // Render the first page once - used for both the preview and the
        // receipt image stored with the split.
        try {
          const { renderPDFFirstPage } = await import('../ocr/pdf-engine.js');
          const dataUrl = await renderPDFFirstPage(file, 1000);
          if (dataUrl) {
            previewImage.src = dataUrl;
            receiptBlob = await dataUrlToBlob(dataUrl);
          } else {
            showPdfFallback(file);
          }
        } catch {
          showPdfFallback(file);
        }

        const { processPDF } = await import('../ocr/pdf-engine.js');
        result = await processPDF(file, onProgress);
      } else {
        progressStatus.textContent = t('upload.optimizing');
        // Compressed colour image: stored with the split and shown as preview.
        const { compressImage } = await import('../ocr/image-compress.js');
        receiptBlob = await compressImage(file);

        // Separate grayscale/contrast pass: fed to OCR for better accuracy.
        const { preprocessForOCR } = await import('../ocr/image-preprocess.js');
        const ocrInput = await preprocessForOCR(file);

        const { processImage, terminateOCR } = await import('../ocr/ocr-engine.js');
        result = await processImage(ocrInput, onProgress);

        // Terminate the worker after processing to free resources
        await terminateOCR();
      }

      progressBar.style.width = '100%';
      progressStatus.textContent = t('upload.complete');

      if (onComplete) {
        onComplete({ ...result, receiptBlob });
      }
    } catch (err) {
      progressStatus.textContent = t('upload.error').replace(
        '{message}',
        err.message || t('upload.failed'),
      );
      progressBar.style.width = '0%';
      // Attempt to terminate OCR worker even on error
      if (file.type !== 'application/pdf') {
        try {
          const { terminateOCR } = await import('../ocr/ocr-engine.js');
          await terminateOCR();
        } catch {
          // Ignore termination errors
        }
      }
    }
  }

  function resetUpload() {
    if (currentObjectURL) {
      URL.revokeObjectURL(currentObjectURL);
      currentObjectURL = null;
    }
    fileInput.value = '';
    previewImage.removeAttribute('src');
    previewImage.hidden = false;
    previewSection.querySelector('.pdf-preview-info')?.remove();
    zone.hidden = false;
    previewSection.hidden = true;
    progressSection.hidden = true;
    progressBar.style.width = '0%';
  }
}
