import re

with open('public/app.js', 'r') as f:
    content = f.read()

# Update title logic in app.js
title_update = """
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
"""

content = re.sub(r"    setupDropdown\('seed', 'selectedSeedFilter', \(val\) => \{\n        if \(selectedSeedFilter !== val\) \{\n            selectedSeedFilter = val;\n            currentPage = 1;\n            fetchServerData\(\); // Fetch new data from server\n        \}\n    \}\);", title_update, content)

with open('public/app.js', 'w') as f:
    f.write(content)
