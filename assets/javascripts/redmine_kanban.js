/* redmine_kanban.js — Kanban Board Frontend v0.2.0
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

  // ─── Toasts ─────────────────────────────────────────────────
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
      var body = col.querySelector('.kb-column-body');
      if (!body) return;

      // Count only visible (non-search-hidden) cards
      var cards     = body.querySelectorAll('.kb-card');
      var visible   = Array.from(cards).filter(function (c) {
        return c.style.display !== 'none';
      });
      var count     = visible.length;
      var wipLimit  = parseInt(col.dataset.wipLimit, 10) || 0;
      var exceeded  = wipLimit > 0 && count > wipLimit;

      var countEl = col.querySelector('.kb-column-count');
      if (countEl) {
        countEl.textContent = wipLimit > 0 ? count + '/' + wipLimit : String(count);
        countEl.classList.toggle('kb-count-exceeded', exceeded);
      }
      col.classList.toggle('kb-column-wip-exceeded', exceeded);

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

  // ─── Loading spinner on card ─────────────────────────────────
  function setCardLoading(card, loading) {
    card.classList.toggle('kb-card-loading', loading);
  }

  // ─── AJAX Status Update ──────────────────────────────────────
  function performUpdate(issueId, newStatusId, card, fromCol, oldIndex) {
    var wasClosed = fromCol.closest('.kb-column').classList.contains('kb-column-closed');

    setCardLoading(card, true);

    var xhr = new XMLHttpRequest();
    xhr.open('PATCH', updateStatusUrl(issueId), true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-CSRF-Token', getCsrfToken());

    xhr.onload = function () {
      setCardLoading(card, false);
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
      setCardLoading(card, false);
      var ref = fromCol.children[oldIndex] || null;
      fromCol.insertBefore(card, ref);
      refreshColumnCounts();
      showToast('error', 'Network error. Please try again.');
    };

    xhr.send(JSON.stringify({ status_id: newStatusId }));
  }

  // ─── Live subtask badge refresh ──────────────────────────────
  function refreshParentBadge(card, wasClosed, isClosed) {
    if (wasClosed === isClosed) return;

    var parentId = card.dataset.parentId;
    if (!parentId) return;

    var parentCard = document.querySelector('.kb-card[data-issue-id="' + parentId + '"]');
    if (!parentCard) return;

    var badge = parentCard.querySelector('.kb-subtask-badge');
    if (!badge) return;

    var text  = badge.textContent.trim();
    var match = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return;

    var done  = parseInt(match[1], 10);
    var total = parseInt(match[2], 10);

    if (!wasClosed && isClosed)  done = Math.min(done + 1, total);
    if (wasClosed  && !isClosed) done = Math.max(done - 1, 0);

    var label = done === total ? '\u2713 ' + done + '/' + total : done + '/' + total;
    badge.textContent = label;
    badge.title = done + ' of ' + total + ' subtasks closed';

    badge.classList.remove('kb-subtasks-done', 'kb-subtasks-partial', 'kb-subtasks-none');
    if (done === total)  badge.classList.add('kb-subtasks-done');
    else if (done === 0) badge.classList.add('kb-subtasks-none');
    else                 badge.classList.add('kb-subtasks-partial');
  }

  // ─── SortableJS Initialization ───────────────────────────────
  function initSortable() {
    if (typeof Sortable === 'undefined') {
      console.warn('[redmine_kanban] SortableJS not loaded.');
      return;
    }

    document.querySelectorAll('.kb-column-body').forEach(function (colBody) {
      var sortGroup = colBody.dataset.sortGroup || 'kanban';
      Sortable.create(colBody, {
        group:           { name: sortGroup, pull: true, put: true },
        animation:       150,
        ghostClass:      'kb-card-ghost',
        chosenClass:     'kb-card-chosen',
        filter:          '.kb-card-menu-btn, .kb-card-id, .kb-card-subject-link',
        preventOnFilter: false,
        fallbackOnBody:  true,
        swapThreshold:   0.65,

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

          // Blocked: prevent drag to closed columns
          var toColClosed = evt.to.closest('.kb-column') &&
                            evt.to.closest('.kb-column').classList.contains('kb-column-closed');
          if (card.dataset.blocked === 'true' && toColClosed) {
            var ref2 = evt.from.children[evt.oldIndex] || null;
            evt.from.insertBefore(card, ref2);
            refreshColumnCounts();
            showToast('error', card.dataset.blockedMsg ||
              'This issue is blocked by an open issue and cannot be closed.');
            return;
          }

          performUpdate(card.dataset.issueId, newStatusId, card, evt.from, evt.oldIndex);
        }
      });
    });
  }

  // ─── Context Menu ─────────────────────────────────────────────
  // Each .kb-card has .hascontextmenu so Redmine's built-in context_menu.js
  // handles right-click and .js-contextmenu click natively.

  // ─── Card Density Zoom ───────────────────────────────────────
  var ZOOM_KEY = 'kb_zoom';

  function applyZoom(level) {
    var container = document.getElementById('kb-board-container');
    if (!container) return;
    container.classList.remove('kb-zoom-compact', 'kb-zoom-normal', 'kb-zoom-detailed');
    if (level) container.classList.add('kb-zoom-' + level);

    document.querySelectorAll('.kb-zoom-btn').forEach(function (btn) {
      btn.classList.toggle('kb-zoom-active', btn.dataset.zoom === level);
    });

    try { localStorage.setItem(ZOOM_KEY, level || ''); } catch (e) {}
  }

  function initZoom() {
    var saved;
    try { saved = localStorage.getItem(ZOOM_KEY); } catch (e) {}
    applyZoom(saved || 'normal');

    document.querySelectorAll('.kb-zoom-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyZoom(btn.dataset.zoom);
      });
    });
  }

  // ─── Quick Search ─────────────────────────────────────────────
  function initSearch() {
    var input = document.getElementById('kb-search');
    if (!input) return;

    input.addEventListener('input', function () {
      var term = input.value.trim().toLowerCase();
      document.querySelectorAll('.kb-card').forEach(function (card) {
        if (!term) {
          card.style.display = '';
        } else {
          var text = (card.textContent || '').toLowerCase();
          card.style.display = text.indexOf(term) !== -1 ? '' : 'none';
        }
      });
      refreshColumnCounts();
    });
  }

  // ─── Swimlane Collapse ───────────────────────────────────────
  function kbToggleSwimlane(headerEl) {
    var lane = headerEl.closest('.kb-swimlane');
    if (!lane) return;
    var collapsed = lane.classList.toggle('kb-swimlane-collapsed');
    var icon = headerEl.querySelector('.kb-swimlane-toggle');
    if (icon) {
      icon.classList.toggle('icon-arrow-down', !collapsed);
      icon.classList.toggle('icon-arrow-right', collapsed);
    }
    var key = lane.dataset.swimlaneKey;
    try {
      var state = JSON.parse(localStorage.getItem('kb_swimlanes') || '{}');
      state[key] = collapsed;
      localStorage.setItem('kb_swimlanes', JSON.stringify(state));
    } catch (e) {}
  }
  window.kbToggleSwimlane = kbToggleSwimlane;

  function restoreSwimlaneState() {
    var state;
    try { state = JSON.parse(localStorage.getItem('kb_swimlanes') || '{}'); } catch (e) { return; }
    document.querySelectorAll('.kb-swimlane').forEach(function (lane) {
      var key = lane.dataset.swimlaneKey;
      if (state[key] === true) {
        lane.classList.add('kb-swimlane-collapsed');
        var icon = lane.querySelector('.kb-swimlane-toggle');
        if (icon) {
          icon.classList.remove('icon-arrow-down');
          icon.classList.add('icon-arrow-right');
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

      var cards = Array.from(colBody.querySelectorAll('.kb-card'))
                       .filter(function (c) { return c.style.display !== 'none'; });
      var idx   = cards.indexOf(focused);

      // Ctrl/Cmd + arrow: move card to adjacent status column
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          moveCardToAdjacentColumn(focused, e.key === 'ArrowRight' ? 1 : -1);
        }
        return;
      }

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
          var url = focused.dataset.issueUrl;
          if (url) window.location.href = url;
          break;
      }
    });
  }

  function moveCardToAdjacentColumn(card, direction) {
    var allowed   = (card.dataset.allowedStatuses || '').split(',').filter(Boolean);
    var allBodies = Array.from(document.querySelectorAll('.kb-column-body'));
    var currentBody = card.closest('.kb-column-body');
    var currentIdx  = allBodies.indexOf(currentBody);

    var step = direction > 0 ? 1 : -1;
    for (var i = currentIdx + step; i >= 0 && i < allBodies.length; i += step) {
      var targetBody  = allBodies[i];
      var targetStatus = targetBody.dataset.statusId;
      if (allowed.indexOf(String(targetStatus)) === -1) continue;

      var targetCol = targetBody.closest('.kb-column');
      var toColClosed = targetCol && targetCol.classList.contains('kb-column-closed');
      if (card.dataset.blocked === 'true' && toColClosed) {
        showToast('error', 'This issue is blocked and cannot be moved to a closed column.');
        return;
      }

      targetBody.appendChild(card);
      refreshColumnCounts();
      performUpdate(card.dataset.issueId, targetStatus, card, currentBody,
        Array.from(currentBody.children).indexOf(card));
      card.focus();
      return;
    }
    showToast('error', 'No allowed column in that direction.');
  }

  // ─── Boot ────────────────────────────────────────────────────
  function init() {
    if (!document.getElementById('kb-board-container')) return;

    initSortable();
    initKeyboardNav();
    initZoom();
    initSearch();
    restoreSwimlaneState();
    refreshColumnCounts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
