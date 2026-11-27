# Quick-Pick Participants Design

**Date:** 2026-11-27
**Status:** Approved

## Intent & Why

Most split bills involve the same recurring friends or coworkers. Previously, BagiAdil persisted participant names in `bagiadil_participants` (`src/ui/storage.js`) without surfacing them in the UI, and the Saved Groups UI (`groups-row`) required too much manual setup and maintenance to be useful day-to-day. Users fell back to typing names one by one.

## Goals

- Surface frequent and recent participants as 1-tap quick-pick chips in the Participants section, sorted by frequency then recency from existing `localStorage` history.
- Remove the Saved Groups UI while preserving existing `bagiadil_groups` and `bagiadil_participants` data as seed suggestions (and preserving `loadGroups`/`mergeGroups` for cross-origin migration).
- Filter quick-pick chips live while typing without disrupting keyboard focus.
- Support comma/newline-separated batch participant entry.
- Provide a safe "Manage" mode to permanently hide typoed or unwanted names from suggestions without mutating historical splits.

## Non-Goals & Anti-Goals

- **Non-goals:** Server synchronization, contact list imports, or mutating historical `bagiadil_history` entries when hiding a quick-pick suggestion.
- **Anti-goals:** Moving focus back to the text input after a quick-pick tap (which pops up the mobile virtual keyboard during tap-tap selection), or putting raw delete buttons directly on quick-pick chips where accidental taps can happen on mobile.

## Approaches Considered

1. **Approach A — Two chip rows ("Selected" + "Quick pick") [Selected]:**
   Keeps active participants visually separate from unselected suggestions, supports live substring filtering, caps initial suggestions at 8 (`+N more`), and isolates deletion inside a "Manage" toggle. Chosen for clarity when 15+ names accumulate.
2. **Approach B — Single toggle-chip pool:**
   More compact vertically, but mixes active participants with inactive contacts once the list grows.
3. **Approach C — Typing autocomplete dropdown + 5 chips:**
   Helps very large lists, but forces opening the mobile keyboard and risks occlusion by the virtual keyboard.

## Key Design Decisions

- **Ranking (`loadQuickPickParticipants`):** Scan `bagiadil_history` (newest `updatedAt` first), count unique appearances per name (case-insensitive, keeping newest display casing), seed remaining names from `bagiadil_participants` and legacy `bagiadil_groups` at `count = 0, lastUsedAt = 0`, and sort by `count desc → lastUsedAt desc → name asc`.
- **Hiding (`hideQuickPickParticipant`):** Removes the name from `bagiadil_participants` and adds its lowercased key to `bagiadil_hidden_participants` so names still present in `bagiadil_history` stay hidden without editing history. Re-adding a name explicitly via `saveParticipants` un-hides it.
- **Batch Entry:** `addParticipant` splits input on commas and newlines, deduplicates case-insensitively against current participants and within the batch, and links validation errors via `aria-invalid` and `aria-describedby`.
