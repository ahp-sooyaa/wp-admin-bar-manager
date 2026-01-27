document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const statusEl = document.getElementById("status-indicator");
    const contextEl = document.getElementById("page-context");
    const statusSeparator = document.getElementById("status-separator");
    const loaderEl = document.getElementById("loader");
    const errorEl = document.getElementById("error-msg");
    const contentArea = document.getElementById("content-area");
    const menuContainer = document.getElementById("menu-container");
    const searchInput = document.getElementById("menu-search");
    const toastEl = document.getElementById("toast");

    // Settings Button & Modal
    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");
    const modalCloseBtn = document.getElementById("modal-close-btn");

    // Settings Elements (in modal)
    const hideToggle = document.getElementById("hide-toggle");
    const hideRow = document.getElementById("hide-row");
    const backendNotice = document.getElementById("backend-notice");
    const newTabToggle = document.getElementById("new-tab-toggle");
    const autoFocusToggle = document.getElementById("auto-focus-toggle");
    const numericShortcutsToggle = document.getElementById(
        "numeric-shortcuts-toggle",
    );
    const changeShortcutBtn = document.getElementById("change-shortcut-btn");

    // Quick Actions
    const quickActionsSection = document.getElementById(
        "quick-actions-section",
    );
    const quickActionsGrid = document.getElementById("quick-actions-grid");
    const quickActionsCount = document.getElementById("quick-actions-count");
    const quickActionsEmpty = document.getElementById("quick-actions-empty");

    let currentMenuData = [];
    let currentTabId = null;
    let currentOrigin = "";
    let quickActions = [];
    const MAX_QUICK_ACTIONS = 9;

    // Keyboard navigation state - using stable IDs
    let activeId = null; // Canonical selection (single source of truth)
    let visibleItems = []; // Array of { id, element, data, ... }

    // Modal Management
    function openModal() {
        settingsModal.classList.remove("hidden");
        // Focus trap - focus first focusable element
        const firstFocusable = settingsModal.querySelector("input, button");
        if (firstFocusable) firstFocusable.focus();
        // Prevent body scroll if needed
        document.body.style.overflow = "hidden";
    }

    function closeModal() {
        settingsModal.classList.add("hidden");
        document.body.style.overflow = "";
        settingsBtn.focus(); // Return focus to settings button
    }

    // Settings button click
    settingsBtn.addEventListener("click", openModal);

    // Modal close button
    modalCloseBtn.addEventListener("click", closeModal);

    // Close modal on backdrop click
    settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) {
            closeModal();
        }
    });

    // Single keydown handler for all keyboard events
    document.addEventListener("keydown", (e) => {
        // Priority 1: Modal is open
        if (!settingsModal.classList.contains("hidden")) {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeModal();
            }
            // Block other keyboard shortcuts while modal is open
            return;
        }

        // Priority 2: Handle keyboard navigation
        handleKeyboardNavigation(e);
    });

    // Initialize
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        currentTabId = tabs[0].id;

        // Extract origin from URL
        try {
            const url = new URL(tabs[0].url);
            currentOrigin = url.origin;
        } catch (e) {
            currentOrigin = "default";
        }

        // Load all settings
        chrome.storage.local.get(
            [
                "open_in_new_tab",
                "auto_focus_search",
                "numeric_shortcuts",
                `quick_actions_${currentOrigin}`,
            ],
            (result) => {
                newTabToggle.checked = !!result.open_in_new_tab;
                autoFocusToggle.checked = result.auto_focus_search !== false; // Default ON
                numericShortcutsToggle.checked =
                    result.numeric_shortcuts !== false; // Default ON

                // Load quick actions for this site
                quickActions = result[`quick_actions_${currentOrigin}`] || [];

                // Auto-focus search if enabled
                if (autoFocusToggle.checked) {
                    setTimeout(() => searchInput.focus(), 100);
                }
            },
        );

        // Request data from content script (auto-loaded via manifest)
        chrome.tabs.sendMessage(
            currentTabId,
            { action: "check_status" },
            (response) => {
                // Handle connection errors (content script not loaded yet)
                if (chrome.runtime.lastError) {
                    loaderEl.classList.add("hidden");
                    errorEl.textContent =
                        "Please refresh the page to enable detection.";
                    errorEl.classList.remove("hidden");
                    statusEl.textContent = "Refresh Needed";
                    statusEl.className = "status-text not-found";
                    return;
                }

                loaderEl.classList.add("hidden");

                if (!response || !response.detected) {
                    statusEl.textContent = "Not Detected";
                    statusEl.className = "status-text not-found";
                    errorEl.textContent = "No WordPress Admin Bar found.";
                    errorEl.classList.remove("hidden");
                    return;
                }

                // WP Detected
                statusEl.textContent = "Detected";
                statusEl.className = "status-text found";

                // Handle Page Context (Frontend vs Backend)
                if (response.isBackend) {
                    contextEl.textContent = "WP-Admin";
                    // Disable hide toggle UI
                    hideRow.classList.add("disabled");
                    backendNotice.classList.remove("hidden");
                    hideToggle.checked = false; // Visually off
                } else {
                    contextEl.textContent = "Frontend";
                    hideRow.classList.remove("disabled");
                    backendNotice.classList.add("hidden");
                    // If configured to be hidden, show checked
                    hideToggle.checked = response.isConfiguredHidden;
                }
                contextEl.classList.remove("hidden");
                statusSeparator.classList.remove("hidden");

                contentArea.classList.remove("hidden");

                // Render Menu
                currentMenuData = response.menu;
                renderMenu(currentMenuData, menuContainer);

                // Initialize visible items for keyboard navigation
                updateVisibleItems();

                // Render quick actions
                renderQuickActions();
            },
        );
    });

    // Event Listeners
    hideToggle.addEventListener("change", (e) => {
        if (!currentTabId) return;

        // Optimistic UI update
        const shouldHide = e.target.checked;

        chrome.tabs.sendMessage(currentTabId, {
            action: "toggle_hide",
            shouldHide: shouldHide,
        });
    });

    newTabToggle.addEventListener("change", (e) => {
        chrome.storage.local.set({ open_in_new_tab: e.target.checked });
    });

    autoFocusToggle.addEventListener("change", (e) => {
        chrome.storage.local.set({ auto_focus_search: e.target.checked });
    });

    numericShortcutsToggle.addEventListener("change", (e) => {
        chrome.storage.local.set({ numeric_shortcuts: e.target.checked });
    });

    // Change shortcut button - opens Chrome shortcuts page
    changeShortcutBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    });

    searchInput.addEventListener("input", (e) => {
        const term = e.target.value.toLowerCase();
        filterMenu(menuContainer, term);
        updateVisibleItems();
        // Auto-select first match on search change
        if (visibleItems.length > 0) {
            activeId = visibleItems[0].id;
            renderSelection();
        } else {
            activeId = null;
            renderSelection();
        }
    });

    // Quick Actions Functions
    function isItemPinned(item) {
        return quickActions.some(
            (qa) =>
                (qa.id && qa.id === item.id) ||
                (qa.href && qa.href === item.href),
        );
    }

    function addQuickAction(item) {
        if (quickActions.length >= MAX_QUICK_ACTIONS) {
            showToast(`Quick Actions limit reached (${MAX_QUICK_ACTIONS})`);
            return false;
        }

        // Check for duplicates
        if (isItemPinned(item)) {
            showToast("Item already in Quick Actions");
            return false;
        }

        // Create quick action object
        const quickAction = {
            id: item.id || "",
            label: item.label,
            href: item.href || "",
            icon: item.icon || "",
            labelPath: item.labelPath || [item.label], // For matching if structure changes
        };

        quickActions.push(quickAction);
        saveQuickActions();
        renderQuickActions();
        updateStarButtons();
        showToast(`Added "${item.label}" to Quick Actions`);
        return true;
    }

    function removeQuickAction(index) {
        if (index >= 0 && index < quickActions.length) {
            const removed = quickActions.splice(index, 1)[0];
            saveQuickActions();
            renderQuickActions();
            updateStarButtons();
            showToast(`Removed "${removed.label}" from Quick Actions`);
        }
    }

    function saveQuickActions() {
        const key = `quick_actions_${currentOrigin}`;
        chrome.storage.local.set({ [key]: quickActions });
    }

    function renderQuickActions() {
        // Update count badge
        quickActionsCount.textContent = `${quickActions.length}/${MAX_QUICK_ACTIONS}`;

        if (quickActions.length === 0) {
            // Show empty state
            quickActionsGrid.classList.add("hidden");
            quickActionsEmpty.classList.remove("hidden");
        } else {
            // Show grid with actions
            quickActionsGrid.classList.remove("hidden");
            quickActionsEmpty.classList.add("hidden");
            quickActionsGrid.innerHTML = "";

            quickActions.forEach((action, index) => {
                const btn = document.createElement("button");
                btn.className = "quick-action-btn";
                btn.dataset.index = index;

                // Number badge
                const numberBadge = document.createElement("span");
                numberBadge.className = "quick-action-number";
                numberBadge.textContent = index + 1;
                btn.appendChild(numberBadge);

                // Icon (if available)
                if (action.icon) {
                    const iconSpan = document.createElement("span");
                    iconSpan.className = "quick-action-icon";
                    iconSpan.textContent = action.icon;
                    btn.appendChild(iconSpan);
                }

                // Label
                const labelSpan = document.createElement("span");
                labelSpan.className = "quick-action-label";
                labelSpan.textContent = action.label;
                btn.appendChild(labelSpan);

                // Remove button
                const removeBtn = document.createElement("button");
                removeBtn.className = "quick-action-remove";
                removeBtn.innerHTML = "×";
                removeBtn.title = "Remove from Quick Actions";
                removeBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    removeQuickAction(index);
                });
                btn.appendChild(removeBtn);

                // Click handler
                btn.addEventListener("click", () => {
                    activateQuickAction(action);
                });

                quickActionsGrid.appendChild(btn);
            });
        }
    }

    function activateQuickAction(action) {
        if (
            action.href &&
            action.href !== "#" &&
            !action.href.startsWith("javascript:")
        ) {
            const openNewTab = newTabToggle.checked;
            if (openNewTab) {
                chrome.tabs.create({ url: action.href });
            } else {
                chrome.tabs.update(currentTabId, { url: action.href });
                window.close();
            }
        } else if (action.id) {
            // Try to click the element via content script
            chrome.tabs.sendMessage(
                currentTabId,
                {
                    action: "click_element",
                    id: action.id,
                },
                (response) => {
                    if (!response || !response.success) {
                        showToast("Action not supported (no valid link)");
                    } else {
                        window.close();
                    }
                },
            );
        } else {
            showToast("Unable to activate this action");
        }
    }

    function updateStarButtons() {
        // Update all star buttons based on current quick actions
        document.querySelectorAll(".star-btn").forEach((starBtn) => {
            const linkDiv = starBtn.closest(".menu-link");
            if (linkDiv && linkDiv._itemData) {
                const isPinned = isItemPinned(linkDiv._itemData);
                starBtn.classList.toggle("pinned", isPinned);
                starBtn.textContent = isPinned ? "★" : "☆";
                starBtn.title = isPinned
                    ? "Remove from Quick Actions"
                    : "Add to Quick Actions";
            }
        });
    }

    // Keyboard Navigation Functions
    function handleKeyboardNavigation(e) {
        const isSearchFocused = document.activeElement === searchInput;
        const isInputFocused =
            document.activeElement.tagName === "INPUT" ||
            document.activeElement.tagName === "TEXTAREA";

        // ESC key handling (priority order)
        if (e.key === "Escape") {
            e.preventDefault();
            if (isSearchFocused) {
                if (searchInput.value) {
                    // Clear search if it has text
                    searchInput.value = "";
                    filterMenu(menuContainer, "");
                    updateVisibleItems();
                    // Auto-select first item after clearing
                    if (visibleItems.length > 0) {
                        activeId = visibleItems[0].id;
                        renderSelection();
                    } else {
                        activeId = null;
                    }
                } else {
                    // Search is empty - close popup
                    window.close();
                }
            } else {
                // Search not focused - close popup
                window.close();
            }
            return;
        }

        // Slash key - focus search when not already focused on an input
        if (e.key === "/" && !isInputFocused) {
            e.preventDefault();
            searchInput.focus();
            return;
        }

        // Numeric shortcuts (1-9) - ONLY for Quick Actions, only when NOT typing
        if (!isInputFocused && numericShortcutsToggle.checked) {
            const num = parseInt(e.key);
            if (num >= 1 && num <= 9) {
                e.preventDefault();
                const index = num - 1;
                // Activate Quick Action, NOT menu item
                if (quickActions[index]) {
                    activateQuickAction(quickActions[index]);
                }
                return;
            }
        }

        // Arrow navigation - works even when search is focused
        if (e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            navigateDown();
            return;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            navigateUp();
            return;
        }

        // Enter key - activate selected item
        if (e.key === "Enter") {
            e.preventDefault();
            const selectedItem = visibleItems.find(
                (item) => item.id === activeId,
            );
            if (selectedItem) {
                activateItem(selectedItem.element);
            }
            return;
        }
    }

    // Generate stable ID for menu item
    function generateItemId(item, linkElement) {
        // Priority 1: Use original admin bar LI id
        if (item.id && item.id.trim()) {
            return item.id;
        }

        // Priority 2: Derive from href + label path
        const hrefPart = (item.href || "").replace(/[^a-zA-Z0-9]/g, "_");
        const labelPath = item.labelPath || [item.label];
        const labelPart = labelPath.join("|").replace(/[^a-zA-Z0-9]/g, "_");
        return `${hrefPart}__${labelPart}`;
    }

    function updateVisibleItems() {
        // Get all clickable menu links that are currently visible
        visibleItems = [];
        const allLinks = menuContainer.querySelectorAll(".menu-link");

        allLinks.forEach((link) => {
            const menuItem = link.closest(".menu-item");
            // Check if item is visible and clickable (not a parent header without link)
            if (menuItem && !menuItem.classList.contains("hidden")) {
                const hasRealLink =
                    link.dataset.href &&
                    link.dataset.href !== "#" &&
                    !link.dataset.href.startsWith("javascript:");
                const isChildItem = link.classList.contains("child");

                // Include child items and parent items with real links
                if (isChildItem || hasRealLink) {
                    const itemData = link._itemData;
                    const itemId = generateItemId(itemData, link);

                    visibleItems.push({
                        id: itemId,
                        element: link,
                        data: itemData,
                        href: link.dataset.href,
                        label: itemData.label,
                    });
                }
            }
        });

        return visibleItems;
    }

    function renderSelection() {
        // CRITICAL: Clear all selections first (prevent double-selection)
        const allLinks = menuContainer.querySelectorAll(".menu-link");
        allLinks.forEach((link) => link.classList.remove("keyboard-active"));

        // Apply selection to the one matching activeId
        if (activeId) {
            const selectedItem = visibleItems.find(
                (item) => item.id === activeId,
            );
            if (selectedItem && selectedItem.element) {
                selectedItem.element.classList.add("keyboard-active");
                selectedItem.element.scrollIntoView({
                    block: "nearest",
                    behavior: "smooth",
                });
            }
        }
    }

    function navigateDown() {
        updateVisibleItems();
        if (visibleItems.length === 0) return;

        let currentIndex = visibleItems.findIndex(
            (item) => item.id === activeId,
        );

        // Move to next with wrap-around
        const nextIndex = (currentIndex + 1) % visibleItems.length;
        activeId = visibleItems[nextIndex].id;

        renderSelection();
    }

    function navigateUp() {
        updateVisibleItems();
        if (visibleItems.length === 0) return;

        let currentIndex = visibleItems.findIndex(
            (item) => item.id === activeId,
        );

        // Move to previous with wrap-around
        const nextIndex =
            (currentIndex - 1 + visibleItems.length) % visibleItems.length;
        activeId = visibleItems[nextIndex].id;

        renderSelection();
    }

    function activateItem(linkElement) {
        // Get the stored item data
        const item = linkElement._itemData;
        if (item) {
            handleItemClick(item);
        }
    }

    // Selective Dashicons for essential top-level menu items only
    const DASHICON_MAP = {
        "wp-admin-bar-wp-logo": "\uf120",
        "wp-admin-bar-site-name": "\uf319",
        "wp-admin-bar-my-sites": "\uf325",
        "wp-admin-bar-customize": "\uf540",
        "wp-admin-bar-comments": "\uf101",
        "wp-admin-bar-new-content": "\uf132",
        "wp-admin-bar-updates": "\uf463",
        "wp-admin-bar-my-account": "\uf110",
        "wp-admin-bar-site-editor": "\uf464",
    };

    // Helper Functions
    function renderMenu(items, container, depth = 0, parentPath = []) {
        if (!items || items.length === 0) return;

        const ul = document.createElement("ul");
        ul.className = depth === 0 ? "menu-list" : "submenu-list";

        items.forEach((item) => {
            // Build hierarchical path for this item
            const pathLabels = [...parentPath, item.label];
            item.pathLabels = pathLabels;
            // Build searchText for matching (lowercase, normalized)
            item.searchText = pathLabels
                .join(" ")
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();
            const li = document.createElement("li");
            li.className = "menu-item";
            li.dataset.label = item.label.toLowerCase();
            li.dataset.depth = depth;

            // Parent items (depth 0) with children are rendered as group cards
            const isParentGroup =
                depth === 0 && item.children && item.children.length > 0;

            if (isParentGroup) {
                li.classList.add("menu-group");
                li.classList.add("expanded"); // Start expanded by default
            }

            const linkDiv = document.createElement("div");
            linkDiv.className =
                depth === 0 ? "menu-link parent" : "menu-link child";

            // Store item data for keyboard navigation
            linkDiv.dataset.href = item.href || "";
            linkDiv.dataset.itemId = item.id || "";
            linkDiv._itemData = item; // Store full item data

            // Icons only for top-level items (depth 0) and only if mapped
            if (depth === 0 && DASHICON_MAP[item.id]) {
                const iconSpan = document.createElement("span");
                iconSpan.className = "wp-icon";
                iconSpan.textContent = DASHICON_MAP[item.id];
                linkDiv.appendChild(iconSpan);
                // Store icon for quick actions
                item.icon = DASHICON_MAP[item.id];
            }

            // Create label container with main label and optional subtitle
            const labelContainer = document.createElement("div");
            labelContainer.className = "menu-label-container";

            const labelSpan = document.createElement("span");
            labelSpan.className = "menu-label";
            labelSpan.textContent = item.label;
            labelContainer.appendChild(labelSpan);

            // Add subtitle for disambiguation (show parent context for child items)
            if (depth > 0 && pathLabels.length > 1) {
                const subtitle = document.createElement("span");
                subtitle.className = "menu-subtitle";
                // Show last 1-2 ancestors (exclude leaf label)
                const ancestors = pathLabels.slice(0, -1);
                const contextLabels = ancestors.slice(-2); // Last 2 ancestors
                subtitle.textContent = contextLabels.join(" › ");
                labelContainer.appendChild(subtitle);
            }

            linkDiv.appendChild(labelContainer);

            // Add star button for pinning to Quick Actions (only for child items or items with links)
            const hasRealLink =
                item.href &&
                item.href !== "#" &&
                !item.href.startsWith("javascript:");
            const isChildItem = depth > 0;

            if (isChildItem || hasRealLink) {
                const starBtn = document.createElement("button");
                starBtn.className = "star-btn";
                starBtn.textContent = isItemPinned(item) ? "★" : "☆";
                starBtn.title = isItemPinned(item)
                    ? "Remove from Quick Actions"
                    : "Add to Quick Actions";
                if (isItemPinned(item)) {
                    starBtn.classList.add("pinned");
                }

                starBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (isItemPinned(item)) {
                        // Find and remove
                        const index = quickActions.findIndex(
                            (qa) =>
                                (qa.id && qa.id === item.id) ||
                                (qa.href && qa.href === item.href),
                        );
                        if (index >= 0) {
                            removeQuickAction(index);
                        }
                    } else {
                        addQuickAction(item);
                    }
                });

                linkDiv.appendChild(starBtn);
            }

            // Add expand/collapse chevron for items with children
            if (item.children && item.children.length > 0) {
                const chevron = document.createElement("span");
                chevron.className = "chevron";
                chevron.innerHTML =
                    "<svg width='12' height='12' viewBox='0 0 12 12' fill='currentColor'><path d='M6 9L2 5h8z'/></svg>";
                linkDiv.appendChild(chevron);

                // Toggle on chevron click
                chevron.addEventListener("click", (ev) => {
                    ev.stopPropagation();
                    li.classList.toggle("expanded");
                });
            }

            // Main click action only for items without children or if item has a real link
            if (!item.children || item.children.length === 0 || hasRealLink) {
                linkDiv.addEventListener("click", () => {
                    handleItemClick(item);
                });
                linkDiv.style.cursor = "pointer";
            } else {
                // Parent with children - clicking header toggles expansion
                linkDiv.addEventListener("click", () => {
                    li.classList.toggle("expanded");
                });
                linkDiv.style.cursor = "pointer";
            }

            li.appendChild(linkDiv);

            // Render children recursively with pathLabels
            if (item.children && item.children.length > 0) {
                const childContainer = document.createElement("div");
                childContainer.className = "submenu";
                renderMenu(
                    item.children,
                    childContainer,
                    depth + 1,
                    pathLabels,
                );
                li.appendChild(childContainer);
            }

            ul.appendChild(li);
        });

        container.appendChild(ul);
    }

    function handleItemClick(item) {
        const openNewTab = newTabToggle.checked;

        // Check if it's a real link
        if (
            item.href &&
            item.href !== "#" &&
            !item.href.startsWith("javascript:")
        ) {
            if (openNewTab) {
                chrome.tabs.create({ url: item.href });
            } else {
                chrome.tabs.update(currentTabId, { url: item.href });
                window.close();
            }
        } else {
            // Fallback for JS actions or empty hrefs
            chrome.tabs.sendMessage(
                currentTabId,
                {
                    action: "click_element",
                    id: item.id,
                },
                (response) => {
                    if (!response || !response.success) {
                        showToast("Action not supported (no valid link)");
                    } else {
                        // Generally close popup if action was successful, assuming navigation or modal
                        window.close();
                    }
                },
            );
        }
    }

    function filterMenu(container, term) {
        if (!term || term.trim() === "") {
            // No search - show all items
            const items = container.querySelectorAll(".menu-item");
            items.forEach((li) => {
                li.classList.remove("hidden");
                li.removeAttribute("data-score");
            });
            return;
        }

        // Tokenize query (split by whitespace, lowercase)
        const tokens = term
            .toLowerCase()
            .trim()
            .split(/\s+/)
            .filter((t) => t.length > 0);
        if (tokens.length === 0) return;

        const items = container.querySelectorAll(".menu-item");
        const scoredItems = [];

        items.forEach((li) => {
            const link = li.querySelector(".menu-link");
            if (!link || !link._itemData) {
                li.classList.add("hidden");
                return;
            }

            const item = link._itemData;
            const searchText = item.searchText || "";
            const pathLabels = item.pathLabels || [item.label];
            const leafLabel = pathLabels[pathLabels.length - 1].toLowerCase();

            // Check if ALL tokens match
            const allMatch = tokens.every((token) =>
                searchText.includes(token),
            );

            if (!allMatch) {
                li.classList.add("hidden");
                li.removeAttribute("data-score");
                return;
            }

            // Calculate match score
            let score = 0;

            tokens.forEach((token) => {
                // Bonus: token matches word-start (prefix) in searchText
                const words = searchText.split(/\s+/);
                const prefixMatch = words.some((word) =>
                    word.startsWith(token),
                );
                if (prefixMatch) score += 100;

                // Bonus: token matches word-start in leaf label specifically
                const leafWords = leafLabel.split(/\s+/);
                const leafPrefixMatch = leafWords.some((word) =>
                    word.startsWith(token),
                );
                if (leafPrefixMatch) score += 50;

                // Bonus: exact word match in leaf label
                if (leafWords.includes(token)) score += 30;

                // Base score for any match
                score += 10;
            });

            // Penalty: prefer shorter paths (less nesting)
            score -= pathLabels.length * 2;

            li.classList.remove("hidden");
            li.dataset.score = score;
            scoredItems.push({ li, score });
        });

        // Sort scored items by score (descending)
        scoredItems.sort((a, b) => b.score - a.score);

        // Reorder DOM to reflect scoring (best matches first)
        scoredItems.forEach(({ li }, index) => {
            li.style.order = index;
        });

        // Expand parent items if children match
        items.forEach((li) => {
            if (!li.classList.contains("hidden")) {
                let parent = li.parentElement?.closest(".menu-item");
                while (parent) {
                    parent.classList.remove("hidden");
                    parent.classList.add("expanded");
                    parent = parent.parentElement?.closest(".menu-item");
                }
            }
        });
    }

    function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.remove("hidden");
        setTimeout(() => {
            toastEl.classList.add("hidden");
        }, 3000);
    }
});
