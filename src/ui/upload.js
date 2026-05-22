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
  if (uploadBtn) {
    const input = uploadBtn.querySelector('input');
    uploadBtn.textContent = t('upload.chooseImage');
    if (input) uploadBtn.appendChild(input);
  }
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
        <label class="btn btn-primary upload-btn">
          Choose Image
          <input type="file" id="receipt-file-input" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" hidden />
        </label>
      </div>
    </div>
    <div class="upload-preview" id="upload-preview" hidden>
      <img id="preview-image" alt="Receipt preview" />
      <button type="button" class="btn btn-danger upload-remove" id="upload-remove">Remove</button>
    </div>
    <div class="upload-progress" id="upload-progress" hidden>
      <p class="progress-status" id="progress-status">Initializing OCR...</p>
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
    progressStatus.textContent = 'Initializing...';
    progressBar.style.width = '0%';

    const onProgress = (info) => {
      progressStatus.textContent = info.status || 'Processing...';
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
      progressStatus.textContent = 'Complete!';

      if (onComplete) {
        onComplete({ ...result, receiptBlob });
      }
    } catch (err) {
      progressStatus.textContent = 'Error: ' + (err.message || 'Processing failed');
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
