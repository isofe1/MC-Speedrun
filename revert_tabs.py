import re

with open('public/index.html', 'r') as f:
    content = f.read()

# Revert Tabs to Dropdown
dropdown_ui = """
      <div class="custom-dropdown" id="seed-filter-dropdown">
        <button class="dropdown-toggle" id="seed-dropdown-btn">
          <span class="dropdown-icon">🌱</span>
          <span class="dropdown-text" id="seed-dropdown-text">Random Seed</span>
          <span class="dropdown-arrow">⌄</span>
        </button>
        <div class="dropdown-menu" id="seed-dropdown-menu">
          <div class="dropdown-item selected" data-value="random">Random Seed</div>
          <div class="dropdown-item" data-value="set">Set Seed</div>
        </div>
      </div>

      <div class="custom-dropdown" id="version-filter-dropdown">
"""
content = re.sub(r'      <div class="seed-tabs">.*?</div>\n\n      <div class="custom-dropdown" id="version-filter-dropdown">', dropdown_ui, content, flags=re.DOTALL)

with open('public/index.html', 'w') as f:
    f.write(content)


with open('public/app.js', 'r') as f:
    js = f.read()

# Revert JS
js_dropdown = """
    setupDropdown('seed', 'selectedSeedFilter', (val) => {
        if (selectedSeedFilter !== val) {
            selectedSeedFilter = val;

            // Update the main title dynamically based on selection
            const titleEl = document.getElementById('main-title');
            if (titleEl) {
                const seedText = val === 'set' ? 'Set Seed' : 'Random Seed';
                titleEl.innerText = `Any% Glitchless - ${seedText}`;
            }

            currentPage = 1;
            fetchServerData(); // Fetch new data from server
        }
    });

    setupDropdown('version', 'selectedVersionFilter', (val) => {
"""

js = re.sub(r'    // Seed Tabs Setup.*?    setupDropdown\(\'version\', \'selectedVersionFilter\', \(val\) => \{', js_dropdown, js, flags=re.DOTALL)

with open('public/app.js', 'w') as f:
    f.write(js)

with open('public/style.css', 'r') as f:
    css = f.read()

# Remove CSS Tabs
css = re.sub(r'\.seed-tabs \{.*\}\n', '', css, flags=re.DOTALL)

with open('public/style.css', 'w') as f:
    f.write(css)
