import re

with open('public/index.html', 'r') as f:
    content = f.read()

# Replace the seed dropdown with tabs
tabs_ui = """
      <div class="seed-tabs">
        <button class="seed-tab active" data-value="random">Random Seed</button>
        <button class="seed-tab" data-value="set">Set Seed</button>
      </div>

      <div class="custom-dropdown" id="version-filter-dropdown">
"""
content = re.sub(r'      <div class="custom-dropdown" id="seed-filter-dropdown">.*?</div>\n\n      <div class="custom-dropdown" id="version-filter-dropdown">', tabs_ui, content, flags=re.DOTALL)

with open('public/index.html', 'w') as f:
    f.write(content)

with open('public/style.css', 'r') as f:
    css = f.read()

css_tabs = """
.seed-tabs {
  display: flex;
  background-color: #1a1a1a;
  border: 1px solid var(--accent);
  border-radius: 6px;
  overflow: hidden;
}

.seed-tab {
  background: none;
  border: none;
  color: var(--text-muted);
  padding: 8px 16px;
  font-family: 'Inter', sans-serif;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.seed-tab:hover {
  color: var(--text-main);
  background-color: rgba(255, 255, 255, 0.05);
}

.seed-tab.active {
  background-color: var(--accent);
  color: white;
}
"""
with open('public/style.css', 'a') as f:
    f.write(css_tabs)

with open('public/app.js', 'r') as f:
    js = f.read()

js_tabs = """
    // Seed Tabs Setup
    const seedTabs = document.querySelectorAll('.seed-tab');
    seedTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active state
            seedTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const val = tab.getAttribute('data-value');
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
    });

    setupDropdown('version', 'selectedVersionFilter', (val) => {
"""
js = re.sub(r'    setupDropdown\(\'seed\', \'selectedSeedFilter\', \(val\) => \{.*?    \}\);\n\n    setupDropdown\(\'version\', \'selectedVersionFilter\', \(val\) => \{', js_tabs, js, flags=re.DOTALL)

with open('public/app.js', 'w') as f:
    f.write(js)
