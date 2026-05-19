/**
 * Interactive item-to-participant assignment UI.
 * Supports tap-to-assign and drag-and-drop (desktop + mobile touch).
 */

import { formatCurrency } from '../engine/formatter.js';

let containerEl = null;
let items = [];
let participants = [];
let assignments = {}; // { itemIndex: participantName }
let onAssignmentChange = null;
let selectedItemIndex = null;

// Participant color palette
const COLORS = [
  '#4a90d9',
  '#28a745',
  '#dc3545',
  '#ffc107',
  '#6f42c1',
  '#17a2b8',
  '#fd7e14',
  '#e83e8c',
];

/**
 * Initialize the assigner component.
 * @param {HTMLElement} el - Container element
 * @param {object} options
 * @param {Array<{name: string, price: number}>} options.items - Food items
 * @param {string[]} options.participants - Participant names
 * @param {function} options.onAssignmentChange - Callback with current assignments
 */
export function initAssigner(el, options) {
  containerEl = el;
  items = options.items || [];
  participants = options.participants || [];
  onAssignmentChange = options.onAssignmentChange || null;
  assignments = {};
  selectedItemIndex = null;
  render();
}

/**
 * Get current assignments.
 * @returns {object} Map of itemIndex to participant name
 */
export function getAssignments() {
  return { ...assignments };
}

function getParticipantColor(name) {
  const idx = participants.indexOf(name);
  return COLORS[idx % COLORS.length];
}

function render() {
  containerEl.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'assigner';

  // Warning if not all items assigned
  const assignedCount = Object.keys(assignments).length;
  if (assignedCount > 0 && assignedCount < items.length) {
    const warning = document.createElement('div');
    warning.className = 'assigner-warning';
    warning.textContent = `${items.length - assignedCount} item(s) not yet assigned`;
    wrapper.appendChild(warning);
  }

  // Unassigned items section
  const unassignedSection = document.createElement('div');
  unassignedSection.className = 'assigner-unassigned';
  unassignedSection.setAttribute('data-zone', 'unassigned');

  const unassignedTitle = document.createElement('h3');
  unassignedTitle.textContent = 'Unassigned Items';
  unassignedSection.appendChild(unassignedTitle);

  const unassignedItems = document.createElement('div');
  unassignedItems.className = 'assigner-items';

  items.forEach((item, index) => {
    if (!assignments[index]) {
      const card = createItemCard(item, index);
      unassignedItems.appendChild(card);
    }
  });

  if (unassignedItems.children.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'assigner-empty';
    empty.textContent = 'All items assigned!';
    unassignedItems.appendChild(empty);
  }

  unassignedSection.appendChild(unassignedItems);

  // Drop zone for unassigned
  setupDropZone(unassignedSection, null);

  wrapper.appendChild(unassignedSection);

  // Participant zones
  const zonesContainer = document.createElement('div');
  zonesContainer.className = 'assigner-zones';

  participants.forEach((name) => {
    const zone = createParticipantZone(name);
    zonesContainer.appendChild(zone);
  });

  wrapper.appendChild(zonesContainer);

  containerEl.appendChild(wrapper);
}

function createItemCard(item, index) {
  const card = document.createElement('div');
  card.className = 'assigner-item-card';
  card.setAttribute('draggable', 'true');
  card.dataset.itemIndex = index;

  if (selectedItemIndex === index) {
    card.classList.add('assigner-item-selected');
  }

  if (assignments[index]) {
    const color = getParticipantColor(assignments[index]);
    card.style.borderLeftColor = color;
    card.classList.add('assigner-item-assigned');
  }

  const nameEl = document.createElement('span');
  nameEl.className = 'assigner-item-name';
  nameEl.textContent = item.name || `Item ${index + 1}`;
  card.appendChild(nameEl);

  const priceEl = document.createElement('span');
  priceEl.className = 'assigner-item-price';
  priceEl.textContent = formatCurrency(item.price);
  card.appendChild(priceEl);

  // Tap-to-assign: first tap selects item, second tap on zone assigns
  card.addEventListener('click', () => handleItemTap(index));

  // Drag events
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('assigner-item-dragging');
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('assigner-item-dragging');
  });

  // Touch events for mobile
  let touchStartX = 0;
  let touchStartY = 0;
  let touchClone = null;

  card.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  });

  card.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartX);
    const dy = Math.abs(touch.clientY - touchStartY);

    if (dx > 10 || dy > 10) {
      e.preventDefault();
      if (!touchClone) {
        touchClone = card.cloneNode(true);
        touchClone.className = 'assigner-item-card assigner-item-touch-clone';
        document.body.appendChild(touchClone);
        card.classList.add('assigner-item-dragging');
      }
      touchClone.style.left = `${touch.clientX - 50}px`;
      touchClone.style.top = `${touch.clientY - 20}px`;

      // Highlight drop zones
      highlightZoneUnder(touch.clientX, touch.clientY);
    }
  });

  card.addEventListener('touchend', (e) => {
    if (touchClone) {
      const touch = e.changedTouches[0];
      const dropTarget = findZoneUnder(touch.clientX, touch.clientY);
      if (dropTarget !== undefined) {
        assignItem(index, dropTarget);
      }
      document.body.removeChild(touchClone);
      touchClone = null;
      card.classList.remove('assigner-item-dragging');
      clearZoneHighlights();
    }
  });

  return card;
}

function createParticipantZone(name) {
  const zone = document.createElement('div');
  zone.className = 'assigner-zone';
  zone.setAttribute('data-zone', name);

  const color = getParticipantColor(name);
  zone.style.borderTopColor = color;

  const header = document.createElement('div');
  header.className = 'assigner-zone-header';

  const nameEl = document.createElement('h4');
  nameEl.textContent = name;
  nameEl.style.color = color;
  header.appendChild(nameEl);

  const subtotal = document.createElement('span');
  subtotal.className = 'assigner-zone-subtotal';
  const total = calculateSubtotal(name);
  subtotal.textContent = formatCurrency(total);
  header.appendChild(subtotal);

  zone.appendChild(header);

  // Items assigned to this participant
  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'assigner-zone-items';

  items.forEach((item, index) => {
    if (assignments[index] === name) {
      const card = createItemCard(item, index);
      itemsContainer.appendChild(card);
    }
  });

  if (itemsContainer.children.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'assigner-zone-empty';
    empty.textContent = 'Drop items here';
    itemsContainer.appendChild(empty);
  }

  zone.appendChild(itemsContainer);

  // Tap on zone to assign selected item
  zone.addEventListener('click', (e) => {
    // Only handle clicks on the zone itself or empty area, not on item cards
    if (!e.target.closest('.assigner-item-card')) {
      handleZoneTap(name);
    }
  });

  // Drop zone setup
  setupDropZone(zone, name);

  return zone;
}

function setupDropZone(el, participantName) {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('assigner-zone-dragover');
  });

  el.addEventListener('dragleave', () => {
    el.classList.remove('assigner-zone-dragover');
  });

  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('assigner-zone-dragover');
    const itemIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(itemIndex)) {
      assignItem(itemIndex, participantName);
    }
  });
}

function handleItemTap(index) {
  if (selectedItemIndex === index) {
    // Deselect (unassign if already assigned)
    if (assignments[index]) {
      delete assignments[index];
      selectedItemIndex = null;
      notifyChange();
      render();
    } else {
      selectedItemIndex = null;
      render();
    }
  } else {
    selectedItemIndex = index;
    render();
  }
}

function handleZoneTap(participantName) {
  if (selectedItemIndex !== null) {
    assignItem(selectedItemIndex, participantName);
    selectedItemIndex = null;
  }
}

function assignItem(itemIndex, participantName) {
  if (participantName === null) {
    // Unassign
    delete assignments[itemIndex];
  } else {
    assignments[itemIndex] = participantName;
  }
  notifyChange();
  render();
}

function calculateSubtotal(participantName) {
  let total = 0;
  items.forEach((item, index) => {
    if (assignments[index] === participantName) {
      total += item.price;
    }
  });
  return total;
}

function notifyChange() {
  if (onAssignmentChange) {
    // Build assignment data: for each participant, list their item indices and subtotal
    const result = {};
    participants.forEach((name) => {
      result[name] = {
        items: [],
        subtotal: 0,
      };
    });
    Object.entries(assignments).forEach(([indexStr, name]) => {
      const idx = parseInt(indexStr, 10);
      if (result[name]) {
        result[name].items.push(idx);
        result[name].subtotal += items[idx].price;
      }
    });
    onAssignmentChange(result);
  }
}

function highlightZoneUnder(x, y) {
  clearZoneHighlights();
  const zones = containerEl.querySelectorAll('[data-zone]');
  zones.forEach((zone) => {
    const rect = zone.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      zone.classList.add('assigner-zone-dragover');
    }
  });
}

function clearZoneHighlights() {
  const zones = containerEl.querySelectorAll('[data-zone]');
  zones.forEach((zone) => zone.classList.remove('assigner-zone-dragover'));
}

function findZoneUnder(x, y) {
  const zones = containerEl.querySelectorAll('[data-zone]');
  for (const zone of zones) {
    const rect = zone.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      const name = zone.getAttribute('data-zone');
      return name === 'unassigned' ? null : name;
    }
  }
  return undefined;
}
