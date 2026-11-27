# Better item assignment — design

Date: 2026-11-27 · Feature #2 · Source: audit W3 §3(2), W1

## Problem

Assigning used a `<select>` popup: 4–6 taps per item/person pair, one person per
action, typed qty (iOS zoom), undo removed the whole assignment, focus fell to
`<body>` after every action, and one item could not be shared (users faked it by
editing prices).

## Interaction

Every item row is followed by a chip row (`tr.chip-row`) with one chip per participant.

- **Tap a chip** = +1 unit for that person (1 tap for the common qty-1 item).
- **−** next to an active chip = −1 (removes the assignment at 0).
- **Bagi rata / Split evenly** (toggle, `aria-pressed`) turns the item into a
  *shared item*: chips then add **share weights** instead of units. The chip shows
  the share as `2/3`.
- **Semua / Everyone** = shared item, weight 1 for every participant (1 tap for
  shared dishes).
- A finished unit item keeps only the chips of people who have some of it (others
  can't receive more anyway). The −1 stays reachable. Rows stay in place, so the
  layout doesn't jump under the finger.
- Focus: each control has a `data-focus-key` (`add|dec|split|all|edit:<itemId>[:person]`).
  After the full re-render, focus returns to the same key, falling back to the
  person's chip, then the item's split toggle. A chip that can't take more units is
  `aria-disabled` (not `disabled`) so it keeps focus.
- All chip controls are at least 44×44 px. Verified in the browser at 375×667 and at
  1280 px with 8 participants and long names: no horizontal overflow.

The per-person "assigned" summary and its Undo are unchanged.

## Data model

Item: `{ name, unitPrice, totalQty, split?: true, assignments: [{ person, qty }] }`.

- No `split` (default, all existing data): `qty` = units, `Σqty ≤ totalQty`.
- `split: true`: the whole item `unitPrice × totalQty` is divided by weight `qty`.
  The item counts as assigned once it has at least one sharer. Equal weights give an
  even split, and 2:1 weights give a proportional one.
- Toggling split off keeps the weights as units if they fit in `totalQty`, otherwise
  it clears them. Editing qty below the assigned units is only blocked for unit items.
- Removing a participant drops their share, so the rest re-split automatically.

### Money (whole rupiah)

`allocateByWeight(total, weights)` in `snapshot.js`: each part is
`floor(total·w/W)`. The leftover rupiah go one at a time to the largest remainders,
with ties broken by assignment order. The parts sum to the item total exactly, so
`splitBill` still gets integer orders. `calculator.js` is unchanged and all its
invariants hold. Assignment order survives encoding, so the shared view matches the
host.

### Result lines (results.js and export.js unchanged)

`aggregateByPerson` emits, for a shared part, `{ name: "Pizza (1/3)", qty: 1, price }`
plus `share: [w, W]`. The existing renderers then print `Pizza (1/3) - Rp 3.334`. A
sole sharer gets a normal line `{ qty: totalQty, price: total }`.

## Share link and history compatibility

- Without shared items, the encoder output is **byte-identical v2**. A test pins this.
- With any shared item, the version is **3** and each shared item array gets a
  trailing `1`: `[name, unitPrice, totalQty, assigns, 1]`.
- Decoder accepts v1 (unversioned), v2 and v3, and rejects other versions or flag values.
- Trade-off: an older cached app opening a v3 link rejects it (invalid link → editor)
  instead of silently reading weights as units and showing wrong totals.
- History and drafts store snapshots. Old entries have no `split` and behave as
  before. `buildSnapshot` and `loadItems` carry the flag.
- `validateSnapshot` (trust boundary): `split` must be absent or `true`. Shared
  weights may exceed `totalQty`, but `unitPrice × totalQty × Σweights` must be a safe
  integer, so a crafted link can't make the math inexact.

## Out of scope

- More than one shared group per item (e.g. two pizzas shared by different
  groups): add the item twice.
- A one-tap "rest to X" for unit items: quantities are small and each tap adds one.
  Add it if real receipts show large quantities.
