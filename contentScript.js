// Checks if the current page has a WordPress admin bar
function getAdminBar() {
    return document.getElementById("wpadminbar");
}

// Check if current page is a backend page (wp-admin, network admin, login)
function isBackendPage() {
    const path = window.location.pathname;
    // Standard wp-admin or network admin
    if (path.includes("/wp-admin/")) {
        // Exception: admin-ajax.php is technically in wp-admin but accessed by frontend sometimes.
        // However, usually admin bar isn't injected on raw ajax responses.
        // We treat all /wp-admin/ navigation as backend.
        return true;
    }
    if (path.includes("wp-login.php")) {
        return true;
    }
    return false;
}

// Trigger hover events to ensure lazy/JS-based menus are initialized
// and DOM is ready for parsing.
async function expandMenus() {
    const menuPops = document.querySelectorAll("#wpadminbar .menupop");
    menuPops.forEach((el) => {
        // Dispatch events to trigger any WP/Plugin JS that builds menus on hover
        el.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    // Give a short delay for any JS to execute
    return new Promise((resolve) => setTimeout(resolve, 50));
}

// Recursively parse the admin bar DOM into a JSON structure
function parseMenu(rootElement) {
    if (!rootElement) return [];

    const items = [];
    // Use :scope > li to get immediate children
    const listItems = rootElement.querySelectorAll(":scope > li");

    listItems.forEach((li) => {
        // Skip separators if they are purely decorative (empty)
        const link = li.querySelector(".ab-item");
        if (!link && !li.classList.contains("menupop")) {
            // If it has an ID, it might be a custom text item (like "Howdy, User")
            if (!li.innerText.trim()) return;
        }

        // Determine label text
        let label = "";

        // Helper to get text from node, respecting hidden elements via textContent if innerText is empty
        const getText = (node) => {
            if (!node) return "";
            // innerText is style-aware (returns "" if hidden). textContent gives raw text.
            let text = node.innerText;
            if (!text || text.trim() === "") {
                text = node.textContent;
            }
            return text;
        };

        if (link) {
            const clone = link.cloneNode(true);
            // Remove screen-reader-text to avoid garbage
            clone
                .querySelectorAll(".screen-reader-text")
                .forEach((el) => el.remove());
            // Remove icon markup usually found in span.ab-icon
            // (Optional: depending on preference, sometimes icons have text inside?)
            // clone.querySelectorAll('.ab-icon').forEach(el => el.remove());

            label = getText(clone).trim();
        } else {
            // Text node directly in LI
            label = getText(li).split("\n")[0].trim();
        }

        if (!label && li.id === "wp-admin-bar-wp-logo") label = "WP Logo";
        if (!label && li.id === "wp-admin-bar-site-name") label = "Site Name";
        if (!label) label = "(No Label)";

        const item = {
            id: li.id,
            label: label,
            href: link ? link.getAttribute("href") : null,
            target: link ? link.getAttribute("target") : null,
            children: [],
        };

        // Find submenu(s)
        // WordPress structure:
        // 1. Direct child ul.ab-submenu
        // 2. Wrapper div.ab-sub-wrapper > ul.ab-submenu
        // Note: Some menus (like "My Sites" in multisite) have MULTIPLE ul.ab-submenu elements
        // We need to collect all of them

        // First, check for submenus inside .ab-sub-wrapper
        let subMenus = li.querySelectorAll(
            ":scope > .ab-sub-wrapper > ul.ab-submenu",
        );

        // If none found in wrapper, check for direct child submenus
        if (subMenus.length === 0) {
            subMenus = li.querySelectorAll(":scope > ul.ab-submenu");
        }

        // Parse all found submenus and combine their children
        if (subMenus.length > 0) {
            subMenus.forEach((subMenu) => {
                item.children = item.children.concat(parseMenu(subMenu));
            });
        }

        items.push(item);
    });

    return items;
}

// Inject or remove the hiding CSS
const STYLE_ID = "wp-admin-bar-hider-style";

function toggleAdminBar(shouldHide) {
    const existingStyle = document.getElementById(STYLE_ID);
    const isBackend = isBackendPage();

    // Safety: Never hide on backend pages
    if (isBackend) {
        if (existingStyle) existingStyle.remove();
        return;
    }

    if (shouldHide) {
        if (!existingStyle) {
            const style = document.createElement("style");
            style.id = STYLE_ID;
            style.textContent = `
        #wpadminbar { display: none !important; }
        html { margin-top: 0 !important; }
        body { margin-top: 0 !important; padding-top: 0 !important; }
        body.admin-bar { margin-top: 0 !important; }
      `;
            document.head.appendChild(style);
        }
    } else {
        if (existingStyle) {
            existingStyle.remove();
        }
    }
}

// Handle clicking an item programmatically
function clickMenuItem(itemId) {
    const item = document.getElementById(itemId);
    if (item) {
        const link = item.querySelector(".ab-item");
        if (link) {
            link.click();
            return true;
        }
        // Try clicking the item itself if no link class
        item.click();
        return true;
    }
    return false;
}

// Initial check on load
function init() {
    const adminBar = getAdminBar();
    if (!adminBar) return;

    const hostname = window.location.hostname;
    const isBackend = isBackendPage();

    // Don't hide on backend pages
    if (isBackend) return;

    chrome.storage.local.get(["hidden_sites"], (result) => {
        const hiddenSites = result.hidden_sites || {};
        if (hiddenSites[hostname]) {
            toggleAdminBar(true);
        }
    });
}

// Message Listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const adminBar = getAdminBar();
    const hostname = window.location.hostname;
    const isBackend = isBackendPage();

    if (request.action === "check_status") {
        if (!adminBar) {
            sendResponse({ detected: false });
        } else {
            // Async handling to allow for hover simulation
            (async () => {
                // Expand menus to ensure DOM is ready (fixes empty My Sites submenus)
                await expandMenus();

                chrome.storage.local.get(["hidden_sites"], (result) => {
                    const hiddenSites = result.hidden_sites || {};
                    const isHidden = !!hiddenSites[hostname];

                    // Force isHidden to false in report if we are on backend (UI logic)
                    const effectiveHidden = isBackend ? false : isHidden;

                    const leftMenu = document.getElementById(
                        "wp-admin-bar-root-default",
                    );
                    const rightMenu = document.getElementById(
                        "wp-admin-bar-top-secondary",
                    );

                    const menuTree = [
                        ...parseMenu(leftMenu),
                        ...parseMenu(rightMenu),
                    ];

                    sendResponse({
                        detected: true,
                        isHidden: effectiveHidden, // The actual visual state
                        isConfiguredHidden: isHidden, // The user's preference setting
                        isBackend: isBackend,
                        hostname: hostname,
                        menu: menuTree,
                    });
                });
            })();

            return true; // Indicates async response
        }
    }

    if (request.action === "toggle_hide") {
        toggleAdminBar(request.shouldHide);

        // Update storage
        chrome.storage.local.get(["hidden_sites"], (result) => {
            const hiddenSites = result.hidden_sites || {};
            if (request.shouldHide) {
                hiddenSites[hostname] = true;
            } else {
                delete hiddenSites[hostname];
            }
            chrome.storage.local.set({ hidden_sites: hiddenSites });
        });

        sendResponse({ success: true });
    }

    if (request.action === "click_element") {
        const success = clickMenuItem(request.id);
        sendResponse({ success: success });
    }
});

// Run initialization
init();
