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

  function getProjectIdentifier() {
    var container = document.getElementById('kb-board-container');
    return container ? container.dataset.projectId : null;
  }

  function getUpdateBaseUrl() {
    var container = document.getElementById('kb-board-container');
    return container ? container.dataset.updateBase : '/kanban/issues';
  }

  function updateStatusUrl(issueId) {
    return getUpdateBaseUrl() + '/' + issueId + '/update_status';
  }

  function detailUrl(issueId) {
    return getUpdateBaseUrl() + '/' + issueId + '/detail';
  }

  // ─── Toasts (NO alert/confirm) ───────────────────────────────
  function showToast(type, message) {
    var container = document.getElementById('kb-notifications');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'kb-toast kb-toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);

    // Auto-dismiss
    setTimeout(function () {
      toast.classList.add('kb-toast-fade');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 320);
    }, 4000);
  }

  // ─── Column Counts & WIP ─────────────────────────────────────
  function refreshColumnCounts() {
    document.querySelectorAll('.kb-column').forEach(function (col) {
      var body  = col.querySelector('.kb-column-body');
      if (!body) return;
      var count    = body.querySelectorAll('.kb-card').length;
      var wipLimit = parseInt(col.dataset.wipLimit, 10) || 0;
      var exceeded = wipLimit > 0 && count > wipLimit;

      var countEl = col.querySelector('.kb-column-count');
      if (countEl) {
        countEl.textContent = wipLimit > 0 ? count + '/' + wipLimit : String(count);
        countEl.classList.toggle('kb-count-exceeded', exceeded);
      }

      col.classList.toggle('kb-column-wip-exceeded', exceeded);
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
    var xhr = new XMLHttpRequest();
    xhr.open('PATCH', updateStatusUrl(issueId), true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-CSRF-Token', getCsrfToken());

    xhr.onload = function () {
      var resp;
      try { resp = JSON.parse(xhr.responseText); } catch (e) { resp = {}; }

      if (xhr.status >= 200 && xhr.status < 300 && resp.success) {
        refreshColumnCounts();
        showToast('success', resp.message || 'Status updated.');
      } else {
        // Revert card to original position
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
        filter:       '.kb-move-to, .kb-card-actions, .kb-card-id',
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

          // No movement
          if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;

          var card         = evt.item;
          var newStatusId  = evt.to.dataset.statusId;
          var allowed      = (card.dataset.allowedStatuses || '').split(',').filter(Boolean);

          if (allowed.indexOf(String(newStatusId)) === -1) {
            // Snap back immediately
            var ref = evt.from.children[evt.oldIndex] || null;
            evt.from.insertBefore(card, ref);
            refreshColumnCounts();
            showToast('error', 'Transition not allowed by workflow.');
            return;
          }

          var fromCol  = evt.from;
          var oldIndex = evt.oldIndex;
          performUpdate(card.dataset.issueId, newStatusId, card, fromCol, oldIndex);
        }
      });
    });
  }

  // ─── "Move to..." dropdown ───────────────────────────────────
  function initMoveToDropdowns() {
    document.addEventListener('change', function (e) {
      if (!e.target.classList.contains('kb-move-to')) return;

      var select      = e.target;
      var newStatusId = select.value;
      if (!newStatusId) return;

      var card    = select.closest('.kb-card');
      var issueId = card.dataset.issueId;
      var fromCol = card.parentElement;
      var oldIdx  = Array.from(fromCol.children).indexOf(card);

      // Optimistic: move card DOM to target column
      var targetBody = document.querySelector(
        '.kb-column-body[data-status-id="' + newStatusId + '"]'
      );
      if (targetBody) {
        targetBody.appendChild(card);
        refreshColumnCounts();
      }

      select.value = ''; // Reset dropdown
      performUpdate(issueId, newStatusId, card, fromCol, oldIdx);
    });
  }

  // ─── Detail Panel ────────────────────────────────────────────
  function openDetailPanel(issueId) {
    var panel = document.getElementById('kb-detail-panel');
    var body  = document.getElementById('kb-detail-body');
    if (!panel || !body) return;

    body.innerHTML = '<p style="color:var(--em-text-muted,#94a3b8);padding:8px">Loading\u2026</p>';
    panel.setAttribute('aria-hidden', 'false');
    panel.focus && panel.focus();

    var xhr = new XMLHttpRequest();
    xhr.open('GET', detailUrl(issueId), true);
    xhr.setRequestHeader('Accept', 'text/html');
    xhr.onload = function () {
      body.innerHTML = xhr.responseText;
    };
    xhr.onerror = function () {
      body.innerHTML = '<p style="color:var(--em-error,#e03131)">Failed to load issue.</p>';
    };
    xhr.send();
  }

  function closeDetailPanel() {
    var panel = document.getElementById('kb-detail-panel');
    if (panel) panel.setAttribute('aria-hidden', 'true');
  }

  function initDetailPanel() {
    document.addEventListener('click', function (e) {
      // Open on card #id click
      var link = e.target.closest('[data-kb-detail]');
      if (link) {
        e.preventDefault();
        openDetailPanel(link.dataset.kbDetail);
        return;
      }

      // Close on overlay click
      if (e.target.classList.contains('kb-detail-overlay')) {
        closeDetailPanel();
        return;
      }

      // Close on X button
      if (e.target.classList.contains('kb-detail-close')) {
        closeDetailPanel();
        return;
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var panel = document.getElementById('kb-detail-panel');
        if (panel && panel.getAttribute('aria-hidden') === 'false') {
          closeDetailPanel();
        }
      }
    });
  }

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

        case 'Enter':
        case ' ':
          e.preventDefault();
          var detailLink = focused.querySelector('[data-kb-detail]');
          if (detailLink) openDetailPanel(detailLink.dataset.kbDetail);
          break;
      }
    });
  }

  // ─── Context Menu Integration ─────────────────────────────────
  // Redmine's contextMenuInit() selects rows with class "hascontextmenu".
  // Cards each have a hidden checkbox[name="ids[]"]. On right-click we
  // check the right card so the built-in AJAX context menu fires correctly.
  function initContextMenu() {
    document.addEventListener('contextmenu', function (e) {
      var card = e.target.closest('.kb-card');
      if (!card) return;

      // Deselect all, select this one
      document.querySelectorAll('.kb-card-checkbox').forEach(function (cb) {
        cb.checked = false;
        cb.closest('.kb-card').classList.remove('context-menu-selection');
      });

      var cb = card.querySelector('.kb-card-checkbox');
      if (cb) {
        cb.checked = true;
        card.classList.add('context-menu-selection');
      }
    });
  }

  // ─── Boot ────────────────────────────────────────────────────
  function init() {
    if (!document.getElementById('kb-board-container')) return;

    initSortable();
    initMoveToDropdowns();
    initDetailPanel();
    initKeyboardNav();
    initContextMenu();
    refreshColumnCounts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
