/* redmine_kanban.js — Kanban Board Frontend
 * Requires: SortableJS (loaded before this file)
 * Compatible with: Redmine 5+, jQuery 3.7+, ibaou-modern theme
 */
(function () {
  'use strict';

  // ─── Utilities ──────────────────────────────────────────────
  function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  }

  function getUpdateBaseUrl() {
    var container = document.getElementById('kb-board-container');
    return container ? container.dataset.updateBase : '/kanban/issues';
  }

  function updateStatusUrl(issueId) {
    return getUpdateBaseUrl() + '/' + issueId + '/update_status';
  }

  // ─── Toasts (NO alert/confirm) ───────────────────────────────
  function showToast(type, message) {
    var container = document.getElementById('kb-notifications');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'kb-toast kb-toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('kb-toast-fade');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 320);
    }, 4000);
  }

  // ─── Column Counts, WIP & Placeholders ──────────────────────
  function refreshColumnCounts() {
    document.querySelectorAll('.kb-column').forEach(function (col) {
      var body  = col.querySelector('.kb-column-body');
      if (!body) return;
      var cards    = body.querySelectorAll('.kb-card');
      var count    = cards.length;
      var wipLimit = parseInt(col.dataset.wipLimit, 10) || 0;
      var exceeded = wipLimit > 0 && count > wipLimit;

      var countEl = col.querySelector('.kb-column-count');
      if (countEl) {
        countEl.textContent = wipLimit > 0 ? count + '/' + wipLimit : String(count);
        countEl.classList.toggle('kb-count-exceeded', exceeded);
      }
      col.classList.toggle('kb-column-wip-exceeded', exceeded);

      // Fix 1: show/hide empty placeholder based on actual card count
      var placeholder = body.querySelector('.kb-empty-placeholder');
      if (placeholder) {
        placeholder.style.display = count > 0 ? 'none' : '';
      }
    });
  }

  // ─── Drag target highlighting ────────────────────────────────
  function highlightTargets(card) {
    var allowed = (card.dataset.allowedStatuses || '').split(',').filter(Boolean);
    document.querySelectorAll('.kb-column').forEach(function (col) {
      var body = col.querySelector('.kb-column-body');
      if (!body) return;
      var statusId = String(body.dataset.statusId);
      if (allowed.indexOf(statusId) !== -1) {
        col.classList.add('kb-column-valid-target');
      } else {
        col.classList.add('kb-column-invalid-target');
      }
    });
  }

  function clearTargetHighlights() {
    document.querySelectorAll('.kb-column').forEach(function (col) {
      col.classList.remove('kb-column-valid-target', 'kb-column-invalid-target');
    });
  }

  // ─── AJAX Status Update ──────────────────────────────────────
  function performUpdate(issueId, newStatusId, card, fromCol, oldIndex) {
    var wasClosed = fromCol.closest('.kb-column').classList.contains('kb-column-closed');

    var xhr = new XMLHttpRequest();
    xhr.open('PATCH', updateStatusUrl(issueId), true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-CSRF-Token', getCsrfToken());

    xhr.onload = function () {
      var resp;
      try { resp = JSON.parse(xhr.responseText); } catch (e) { resp = {}; }

      if (xhr.status >= 200 && xhr.status < 300 && resp.success) {
        card.classList.toggle('kb-closed', !!resp.is_closed);
        refreshColumnCounts();
        refreshParentBadge(card, wasClosed, !!resp.is_closed);
        showToast('success', resp.message || 'Status updated.');
      } else {
        var ref = fromCol.children[oldIndex] || null;
        fromCol.insertBefore(card, ref);
        refreshColumnCounts();
        showToast('error', resp.error || 'Update failed.');
      }
    };

    xhr.onerror = function () {
      var ref = fromCol.children[oldIndex] || null;
      fromCol.insertBefore(card, ref);
      refreshColumnCounts();
      showToast('error', 'Network error. Please try again.');
    };

    xhr.send(JSON.stringify({ status_id: newStatusId }));
  }

  // ─── Live subtask badge refresh ──────────────────────────────
  function refreshParentBadge(card, wasClosed, isClosed) {
    if (wasClosed === isClosed) return; // no closed-state change

    var parentId = card.dataset.parentId;
    if (!parentId) return;

    var parentCard = document.querySelector('.kb-card[data-issue-id="' + parentId + '"]');
    if (!parentCard) return;

    var badge = parentCard.querySelector('.kb-subtask-badge');
    if (!badge) return;

    // Parse current "done/total" or "✓ done/total" from badge text
    var text = badge.textContent.trim();
    var match = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return;

    var done  = parseInt(match[1], 10);
    var total = parseInt(match[2], 10);

    if (!wasClosed && isClosed)  done = Math.min(done + 1, total);
    if (wasClosed && !isClosed)  done = Math.max(done - 1, 0);

    // Update badge text and class
    var label = done === total ? '\u2713 ' + done + '/' + total : done + '/' + total;
    badge.textContent = label;
    badge.title = done + ' of ' + total + ' subtasks closed';

    badge.classList.remove('kb-subtasks-done', 'kb-subtasks-partial', 'kb-subtasks-none');
    if (done === total)    badge.classList.add('kb-subtasks-done');
    else if (done === 0)   badge.classList.add('kb-subtasks-none');
    else                   badge.classList.add('kb-subtasks-partial');
  }

  // ─── SortableJS Initialization ───────────────────────────────
  function initSortable() {
    if (typeof Sortable === 'undefined') {
      console.warn('[redmine_kanban] SortableJS not loaded.');
      return;
    }

    document.querySelectorAll('.kb-column-body').forEach(function (colBody) {
      Sortable.create(colBody, {
        group:        { name: 'kanban', pull: true, put: true },
        animation:    150,
        ghostClass:   'kb-card-ghost',
        chosenClass:  'kb-card-chosen',
        // Fix 6 (remove move-to): no longer need to filter it out
        filter:       '.kb-card-menu-btn, .kb-card-id, .kb-card-subject-link',
        preventOnFilter: false,
        fallbackOnBody: true,
        swapThreshold: 0.65,

        onStart: function (evt) {
          document.body.classList.add('kb-dragging');
          highlightTargets(evt.item);
        },

        onEnd: function (evt) {
          document.body.classList.remove('kb-dragging');
          clearTargetHighlights();

          if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;

          var card        = evt.item;
          var newStatusId = evt.to.dataset.statusId;
          var allowed     = (card.dataset.allowedStatuses || '').split(',').filter(Boolean);

          if (allowed.indexOf(String(newStatusId)) === -1) {
            var ref = evt.from.children[evt.oldIndex] || null;
            evt.from.insertBefore(card, ref);
            refreshColumnCounts();
            showToast('error', 'Transition not allowed by workflow.');
            return;
          }

          performUpdate(card.dataset.issueId, newStatusId, card, evt.from, evt.oldIndex);
        }
      });
    });
  }

  // ─── Context Menu ─────────────────────────────────────────────
  // Each .kb-card has .hascontextmenu so Redmine's built-in context_menu.js
  // handles right-click and .js-contextmenu click natively — selection,
  // checkbox toggling, and menu display all work out of the box.
  // Nothing extra needed here.

  // ─── Keyboard Navigation ─────────────────────────────────────
  function initKeyboardNav() {
    document.addEventListener('keydown', function (e) {
      var focused = document.activeElement;
      if (!focused || !focused.classList.contains('kb-card')) return;

      var colBody = focused.closest('.kb-column-body');
      if (!colBody) return;
      var cards   = Array.from(colBody.querySelectorAll('.kb-card'));
      var idx     = cards.indexOf(focused);

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          if (idx < cards.length - 1) cards[idx + 1].focus();
          break;

        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          if (idx > 0) cards[idx - 1].focus();
          break;

        case 'ArrowRight': {
          e.preventDefault();
          var cols = Array.from(document.querySelectorAll('.kb-column-body'));
          var ci   = cols.indexOf(colBody);
          if (ci < cols.length - 1) {
            var nextCard = cols[ci + 1].querySelector('.kb-card');
            if (nextCard) nextCard.focus();
          }
          break;
        }

        case 'ArrowLeft': {
          e.preventDefault();
          var cols2 = Array.from(document.querySelectorAll('.kb-column-body'));
          var ci2   = cols2.indexOf(colBody);
          if (ci2 > 0) {
            var prevCard = cols2[ci2 - 1].querySelector('.kb-card');
            if (prevCard) prevCard.focus();
          }
          break;
        }

        // Feature 8: Enter navigates to issue page
        case 'Enter':
        case ' ':
          e.preventDefault();
          var url = focused.dataset.issueUrl;
          if (url) window.location.href = url;
          break;
      }
    });
  }

  // ─── Boot ────────────────────────────────────────────────────
  function init() {
    if (!document.getElementById('kb-board-container')) return;

    initSortable();
    initKeyboardNav();
    refreshColumnCounts(); // also sets initial placeholder state
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
