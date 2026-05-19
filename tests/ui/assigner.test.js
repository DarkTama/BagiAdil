// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { initAssigner, getAssignments } from '../../src/ui/assigner.js';

describe('Assigner UI', () => {
  let containerEl;
  let assignmentChanges;

  const sampleItems = [
    { name: 'Nasi Goreng', price: 25000 },
    { name: 'Mie Ayam', price: 20000 },
    { name: 'Es Teh', price: 5000 },
  ];

  const sampleParticipants = ['Alice', 'Bob'];

  beforeEach(() => {
    document.body.innerHTML = '<div id="assigner-container"></div>';
    containerEl = document.getElementById('assigner-container');
    assignmentChanges = [];
  });

  function setup(items = sampleItems, participants = sampleParticipants) {
    initAssigner(containerEl, {
      items,
      participants,
      onAssignmentChange: (data) => assignmentChanges.push(data),
    });
  }

  describe('assign item to participant', () => {
    it('should assign item via tap-to-assign (tap item then tap zone)', () => {
      setup();

      // Tap on first item card to select it
      const itemCards = containerEl.querySelectorAll('.assigner-item-card');
      expect(itemCards.length).toBe(3);

      itemCards[0].click(); // Select Nasi Goreng

      // Item should be highlighted as selected
      const selectedCard = containerEl.querySelector('.assigner-item-selected');
      expect(selectedCard).not.toBeNull();

      // Tap on Alice's zone
      const zones = containerEl.querySelectorAll('.assigner-zone');
      expect(zones.length).toBe(2);
      zones[0].click(); // Assign to Alice

      // Check assignment
      const assignments = getAssignments();
      expect(assignments[0]).toBe('Alice');

      // Callback should have fired
      expect(assignmentChanges.length).toBe(1);
      expect(assignmentChanges[0]['Alice'].items).toContain(0);
      expect(assignmentChanges[0]['Alice'].subtotal).toBe(25000);
    });

    it('should show item in participant zone after assignment', () => {
      setup();

      // Assign Nasi Goreng to Alice
      const itemCards = containerEl.querySelectorAll('.assigner-item-card');
      itemCards[0].click();
      const zones = containerEl.querySelectorAll('.assigner-zone');
      zones[0].click();

      // Check that Alice's zone now contains the item
      const aliceZone = containerEl.querySelector('[data-zone="Alice"]');
      const zoneItems = aliceZone.querySelectorAll('.assigner-item-card');
      expect(zoneItems.length).toBe(1);
      expect(zoneItems[0].querySelector('.assigner-item-name').textContent).toBe('Nasi Goreng');
    });
  });

  describe('unassign item', () => {
    it('should unassign an item by tapping it again when assigned', () => {
      setup();

      // Assign item 0 to Alice
      let itemCards = containerEl.querySelectorAll('.assigner-item-card');
      itemCards[0].click();
      let zones = containerEl.querySelectorAll('.assigner-zone');
      zones[0].click();

      // Now the item is in Alice's zone - tap it to select, tap again to unassign
      const aliceZone = containerEl.querySelector('[data-zone="Alice"]');
      let assignedItem = aliceZone.querySelector('.assigner-item-card');
      assignedItem.click(); // Select
      // After click, item is selected, click again to deselect/unassign
      const selectedItem = containerEl.querySelector('.assigner-item-selected');
      if (selectedItem) selectedItem.click(); // Unassign

      // Check assignment is removed
      const assignments = getAssignments();
      expect(assignments[0]).toBeUndefined();
    });
  });

  describe('reassign item', () => {
    it('should reassign item from one participant to another', () => {
      setup();

      // Assign item 0 to Alice
      let itemCards = containerEl.querySelectorAll('.assigner-item-card');
      itemCards[0].click();
      let zones = containerEl.querySelectorAll('.assigner-zone');
      zones[0].click(); // Alice

      expect(getAssignments()[0]).toBe('Alice');

      // Now select item from Alice's zone and assign to Bob
      const aliceZone = containerEl.querySelector('[data-zone="Alice"]');
      const assignedItem = aliceZone.querySelector('.assigner-item-card');
      assignedItem.click(); // Select

      // The item is now selected in Alice's zone, tap Bob's zone to reassign
      zones = containerEl.querySelectorAll('.assigner-zone');
      // Find Bob's zone
      const bobZone = containerEl.querySelector('[data-zone="Bob"]');
      bobZone.click(); // Assign to Bob

      expect(getAssignments()[0]).toBe('Bob');
    });
  });

  describe('subtotals', () => {
    it('should update subtotals correctly after assignments', () => {
      setup();

      // Assign Nasi Goreng (25000) to Alice
      let itemCards = containerEl.querySelectorAll('.assigner-item-card');
      itemCards[0].click();
      let zones = containerEl.querySelectorAll('.assigner-zone');
      zones[0].click(); // Alice

      // Assign Mie Ayam (20000) to Alice
      itemCards = containerEl.querySelectorAll(
        '.assigner-unassigned .assigner-item-card'
      );
      itemCards[0].click(); // First unassigned item (Mie Ayam now)
      zones = containerEl.querySelectorAll('.assigner-zone');
      zones[0].click(); // Alice

      // Check subtotal for Alice via callback
      const lastChange = assignmentChanges[assignmentChanges.length - 1];
      expect(lastChange['Alice'].subtotal).toBe(45000);
      expect(lastChange['Bob'].subtotal).toBe(0);

      // Assign Es Teh (5000) to Bob
      itemCards = containerEl.querySelectorAll(
        '.assigner-unassigned .assigner-item-card'
      );
      itemCards[0].click(); // Es Teh
      zones = containerEl.querySelectorAll('.assigner-zone');
      zones[1].click(); // Bob

      const finalChange = assignmentChanges[assignmentChanges.length - 1];
      expect(finalChange['Alice'].subtotal).toBe(45000);
      expect(finalChange['Bob'].subtotal).toBe(5000);
    });

    it('should display subtotal in participant zone header', () => {
      setup();

      // Assign Nasi Goreng (25000) to Alice
      let itemCards = containerEl.querySelectorAll('.assigner-item-card');
      itemCards[0].click();
      let zones = containerEl.querySelectorAll('.assigner-zone');
      zones[0].click();

      // Check rendered subtotal
      const aliceZone = containerEl.querySelector('[data-zone="Alice"]');
      const subtotal = aliceZone.querySelector('.assigner-zone-subtotal');
      expect(subtotal.textContent).toContain('25.000');
    });
  });

  describe('drag-and-drop events', () => {
    it('should handle dragover and drop events on participant zones', () => {
      setup();

      const zone = containerEl.querySelector('[data-zone="Alice"]');

      // Simulate dragover
      const dragoverEvent = new Event('dragover', { bubbles: true });
      dragoverEvent.preventDefault = () => {};
      dragoverEvent.dataTransfer = { dropEffect: '' };
      zone.dispatchEvent(dragoverEvent);

      expect(zone.classList.contains('assigner-zone-dragover')).toBe(true);

      // Simulate dragleave
      zone.dispatchEvent(new Event('dragleave', { bubbles: true }));
      expect(zone.classList.contains('assigner-zone-dragover')).toBe(false);
    });

    it('should assign item on drop', () => {
      setup();

      const zone = containerEl.querySelector('[data-zone="Bob"]');

      // Simulate drop
      const dropEvent = new Event('drop', { bubbles: true });
      dropEvent.preventDefault = () => {};
      dropEvent.dataTransfer = {
        getData: () => '1', // item index 1 (Mie Ayam)
      };
      zone.dispatchEvent(dropEvent);

      expect(getAssignments()[1]).toBe('Bob');
    });
  });
});
