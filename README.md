# WP Admin Bar Manager

A Chrome extension that enhances WordPress admin bar navigation with keyboard shortcuts, Quick Actions, and a powerful search interface.

## Features

- **Hide Admin Bar**: Toggle WordPress admin bar visibility per site
- **Quick Actions**: Pin up to 9 frequently-used menu items for instant access
- **Keyboard-First Workflow**: Navigate and activate menu items without touching the mouse
- **Smart Search**: Context-aware hierarchical search with automatic result ranking
- **Per-Site Settings**: Customizable preferences for each WordPress site
- **Modern UI**: Clean, professional interface with smooth animations

---

## Quick Start

### Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select the extension folder
6. Done! The extension icon appears in your toolbar

### First Use

1. Visit any WordPress site where you're logged in
2. Click the extension icon (or press `Ctrl+Shift+Y`)
3. The popup shows your WordPress admin bar menu items
4. Start exploring the features below!

---

## Core Features

### 1. Quick Actions (⚡)

Pin your most-used WordPress menu items for instant access.

**How to Use:**
- Click the star (☆) next to any menu item to pin it
- Pinned items appear at the top in a 3×3 grid
- Press `1-9` to activate Quick Actions instantly
- Maximum of 9 Quick Actions per site
- Each WordPress site has its own Quick Actions

**Example Setup (Content Writer):**
```
1. New Post
2. Media Library
3. All Posts
4. Comments
```

**Speed:** Open popup → Press `1` → Start writing (< 1 second!)

### 2. Keyboard Navigation

Navigate menus at lightning speed without the mouse.

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Y` | Open/close popup |
| `1-9` | Activate Quick Action #1-9 |
| `↓` | Navigate down |
| `↑` | Navigate up |
| `/` | Focus search |
| `Enter` | Activate selected item |
| `Esc` | Close popup or clear search |

**Two Modes:**

**Command Palette Mode** (default):
- Search auto-focuses on open
- Type to filter → Arrow keys → Enter

**Speed-Dial Mode** (disable auto-focus):
- Open → Press number → Done

### 3. Hierarchical Search

Smart search that understands WordPress menu structure.

**Features:**
- Multi-token matching: "jp visi" finds "Urolift JP › Visit Site"
- Context display: Shows parent path for disambiguation
- Automatic ranking: Best matches appear first
- Partial matching: "pos" matches "Posts"
- First result auto-selected for quick activation

**Example:** On a multisite network with many "Dashboard" items:
- Search "kr dash" → finds only "Urolift KR › Dashboard"
- No more guessing which site you're accessing!

### 4. Settings

Click the gear icon (⚙️) in the popup to access settings:

- **Hide on this site**: Toggle admin bar visibility per site
- **Open links in new tab**: Keep popup open when navigating
- **Auto-focus search**: Automatically focus search on popup open
- **Enable numeric shortcuts**: Turn 1-9 Quick Actions on/off
- **Change keyboard shortcut**: Customize popup shortcut key

---

## How It Works

### Architecture

```
┌──────────────────┐
│  Content Script  │ ← Parses WordPress admin bar DOM
└────────┬─────────┘
         │ Sends menu data
         ▼
┌──────────────────┐
│   Popup (UI)     │ ← Renders menu, handles interactions
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Chrome Storage   │ ← Persists Quick Actions & settings
└──────────────────┘
```

### Content Script

- Runs on all pages automatically
- Detects WordPress admin bar (`#wpadminbar`)
- Parses menu structure into hierarchical tree
- Sends data to popup when requested
- Hides/shows admin bar based on user settings

### Popup Interface

**Layout:**
```
┌─────────────────────────────┐
│ WP Admin Bar          ⚙️    │ ← Header (title + status + settings)
│ Frontend • Detected          │
├─────────────────────────────┤
│ ⚡ Quick Actions       [2/9]│
│ ┌────┐ ┌────┐ ┌────┐       │ ← Quick Actions grid (3×3)
│ │ 1  │ │ 2  │ │    │       │
│ │Post│ │Edit│ │    │       │
│ └────┘ └────┘ └────┘       │
├─────────────────────────────┤
│ 🔍 [Search menu items...]   │ ← Search + Menu panel
│ ────────────────────────────│   (visually connected)
│ ▼ Dashboard                 │
│   • Home                   ⭐│
│   • Updates                ☆│
│ ▼ Posts                     │
│   • All Posts              ⭐│
│   • Add New                ☆│
└─────────────────────────────┘
```

**Empty State:**
When no Quick Actions are pinned, a helpful card appears:
```
    ⭐
No Quick Actions yet
Pin ⭐ items to add them here
```

### Data Storage

**Per-Site (origin-specific):**
- Quick Actions: `quick_actions_${origin}`
- Hide admin bar: `hide_on_site_${origin}`

**Global:**
- Open in new tab: `open_in_new_tab`
- Auto-focus search: `auto_focus_search`
- Numeric shortcuts: `numeric_shortcuts`

---

## Technical Details

### Menu Rendering

**Visual Hierarchy:**

1. **Parent Items** (depth 0):
   - Bold text, gray background
   - Icon (if available from Dashicons)
   - Collapsible with chevron
   - Act as section headers

2. **Child Items** (depth ≥ 1):
   - Normal weight, white background
   - Indented based on depth (32px per level)
   - No icons
   - Show parent context in search results

**Icon System:**
- Only top-level items get icons
- Uses WordPress Dashicons font
- Selective mapping for common items:
  - `wp-admin-bar-site-name` → Site icon
  - `wp-admin-bar-comments` → Comment icon
  - `wp-admin-bar-new-content` → Plus icon
  - etc.
- No empty placeholders for unknown items

### Search Algorithm

**Token-Based Matching:**
1. Query split into tokens: "jp visi" → `["jp", "visi"]`
2. Each menu item has `pathLabels`: `["My Sites", "Urolift JP", "Visit Site"]`
3. Build `searchText`: `"my sites urolift jp visit site"`
4. Match if ALL tokens found in searchText

**Scoring System:**
- **+100 points**: Token matches word-start in path
- **+50 points**: Token matches word-start in leaf label
- **+30 points**: Exact word match in leaf label
- **+10 points**: Base score for any match
- **-2 points per level**: Penalty for deeper nesting

**Example:**
```
Query: "jp visi"

Item: "My Sites › Urolift JP › Visit Site"
- "jp": word-start in path (+100)
- "visi": word-start in leaf (+100, +50)
- Depth penalty: -6
→ Score: 244

Result: Ranked first, auto-selected
```

### Keyboard Navigation System

**State Management:**
```javascript
let activeId = null;          // Currently selected item (ID-based)
let visibleItems = [];        // Array of visible/navigable items
```

**Selection Flow:**
```
User Action → Update activeId → renderSelection()
                                      ↓
                            1. Clear all highlights
                            2. Find item by ID
                            3. Add highlight to ONE element
                            4. Scroll into view
```

**ID Generation:**
- Priority 1: Original WordPress admin bar ID
- Priority 2: Derived from `href + labelPath`
- Ensures stable selection across filtering

**Safety Mechanisms:**
- Focus detection prevents number shortcuts while typing
- Item validation prevents out-of-bounds access
- Event prevention for all navigation keys
- Modal focus trap when settings open

---

## Development

### Project Structure

```
wp-admin-bar-manager/
├── manifest.json          # Extension configuration
├── popup.html            # Popup UI structure
├── popup.css             # Popup styles
├── popup.js              # Popup logic
├── contentScript.js      # WordPress admin bar parser
├── icons/                # Extension icons
├── package.json          # Dependencies
├── vite.config.ts        # Vite configuration
└── tsconfig.json         # TypeScript configuration
```

### Key Files

**manifest.json**
- Chrome Extension Manifest V3
- Permissions: `activeTab`, `scripting`, `storage`
- Content script runs on all URLs
- Default keyboard shortcut: `Ctrl+Shift+Y`

**contentScript.js**
- Parses `#wpadminbar` DOM
- Builds hierarchical menu tree
- Responds to popup messages
- Handles admin bar visibility

**popup.js**
- Main application logic (~1000 lines)
- Functions:
  - `renderMenu()` - Builds menu UI recursively
  - `filterMenu()` - Search filtering with scoring
  - `handleKeyboardNavigation()` - Keyboard event handler
  - `addQuickAction()` / `removeQuickAction()` - Quick Actions management
  - `navigateDown()` / `navigateUp()` - Arrow navigation
  - `activateItem()` - Item activation

**popup.css**
- CSS variables for theming
- Responsive grid layouts
- Smooth animations (200ms modal, 150ms hovers)
- Accessibility-friendly focus states

---

## Troubleshooting

### Extension not detecting WordPress

**Symptoms:** Popup shows "Not detected"

**Solutions:**
1. Refresh the WordPress page
2. Make sure you're logged in (admin bar must be visible)
3. Check browser console for errors
4. Verify content script is running in DevTools

### Keyboard shortcuts not working

**Symptoms:** Number keys don't activate Quick Actions

**Solutions:**
1. Check "Enable numeric shortcuts" is ON (in settings)
2. Make sure search input is NOT focused (press `Esc` to blur)
3. Verify Quick Actions exist at that number
4. Check for conflicts with other extensions

### Settings not saving

**Symptoms:** Toggles reset after closing popup

**Solutions:**
1. Check Chrome extension permissions for storage API
2. Look for errors in browser console
3. Try reloading the extension

### Quick Actions not persisting

**Symptoms:** Quick Actions disappear after page reload

**Solutions:**
1. Verify you're on the same site (origin-specific storage)
2. Check Chrome's storage quota isn't exceeded
3. Clear extension storage and re-add items

### Can't close popup with keyboard

**Solution:** Press `Esc` key to close popup reliably

**Note:** Browser security prevents extensions from intercepting `Cmd+W` / `Ctrl+W`

---

## Privacy & Security

**Data Collection:**
- **None.** This extension does NOT collect any user data
- **No analytics**, no tracking, no external requests
- All data stored locally in Chrome's storage API

**Permissions Used:**
- `activeTab`: Access current page DOM to parse admin bar
- `scripting`: Inject content script on pages
- `storage`: Save settings and Quick Actions locally

**Security:**
- Content script only reads DOM, never modifies passwords/forms
- No eval() or remote code execution
- All URLs validated before navigation
- CSP-compliant code

---

## Changelog

### Version 1.0

**Initial Release:**
- WordPress admin bar detection and parsing
- Quick Actions system (max 9, per-site)
- Hierarchical search with context-aware scoring
- Keyboard navigation (arrows, slash, numbers, enter, esc)
- Settings modal with 4 toggles
- Per-site storage for Quick Actions and hide setting
- Empty states and helpful guidance
- Smooth animations and modern UI
- Full keyboard accessibility

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (see testing guide)
5. Submit a pull request

**Areas for contribution:**
- Fuzzy search matching
- Custom icon support
- Drag-and-drop Quick Actions reordering
- Export/import Quick Actions configurations
- Dark mode theme
- Localization (i18n)

---

## License

MIT License - feel free to modify and distribute

---

## Support

For issues, questions, or feature requests:
- Open an issue on GitHub
- Check the troubleshooting section above
- Review the test checklist for expected behavior

---

## Keyboard Shortcut Quick Reference

```
┌─────────────────────────────────────────────┐
│              NAVIGATION                     │
├─────────────────────────────────────────────┤
│  Ctrl+Shift+Y  Open/close popup             │
│  1-9           Activate Quick Action        │
│  /             Focus search                 │
│  ↓             Navigate down                │
│  ↑             Navigate up                  │
│  Enter         Activate selected item       │
│  Esc           Close popup / Clear search   │
└─────────────────────────────────────────────┘
```

---

**Built with AI for WordPress power users**
