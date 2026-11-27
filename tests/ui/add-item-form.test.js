// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initAddItemForm } from '../../src/ui/items.js';

describe('add-item form (audit M13/F6)', () => {
  let el;
  let onAddItem;
  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    el = document.querySelector('#host');
    onAddItem = vi.fn();
    initAddItemForm(el, { onAddItem });
  });
  const submit = () => el.querySelector('.btn-add-item').click();

  it('shows an inline error and focuses the name field when the name is empty', () => {
    submit();
    expect(onAddItem).not.toHaveBeenCalled();
    expect(el.querySelector('.add-item-error').textContent).toBe('Nama item tidak boleh kosong');
    expect(document.activeElement).toBe(el.querySelector('.add-item-name'));
    expect(el.querySelector('.add-item-name').getAttribute('aria-invalid')).toBe('true');

    el.querySelector('.add-item-name').dispatchEvent(new Event('input'));
    expect(el.querySelector('.add-item-error').textContent).toBe('');
  });

  it('accepts price Rp 0, like the inline edit row', () => {
    el.querySelector('.add-item-name').value = 'Gratis';
    submit();
    expect(onAddItem).toHaveBeenCalledWith({ name: 'Gratis', unitPrice: 0, qty: 1 });
  });

  it('labels every field for assistive tech', () => {
    ['add-item-name', 'add-item-price', 'add-item-qty'].forEach((id) => {
      expect(el.querySelector(`label[for="${id}"]`)).not.toBeNull();
      expect(el.querySelector(`#${id}`)).not.toBeNull();
    });
  });
});
