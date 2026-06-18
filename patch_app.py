import re

with open('public/app.js', 'r') as f:
    content = f.read()

# Add state variables
state_vars = """
// Filter State
let selectedCountryFilter = 'all'; // 'all', 'unknown', or country code (e.g., 'ca')
let selectedSeedFilter = 'random'; // 'random' or 'set'
let selectedVersionFilter = '4qye4731'; // '4qye4731' is 1.16-1.19
"""
content = re.sub(r'// Filter State.*?\nlet selectedCountryFilter = \'all\';.*?\n', state_vars, content, count=1, flags=re.DOTALL)

# Update fetchServerData
fetch_logic = """
async function fetchServerData() {
    try {
        const url = `/api/runs?seedType=${selectedSeedFilter}&version=${selectedVersionFilter}`;
        const res = await fetch(url);
"""
content = content.replace("async function fetchServerData() {\n    try {\n        const res = await fetch('/api/runs');", fetch_logic)

# Add dropdown listeners setup
dropdown_setup = """
// Dropdown toggle listener
document.addEventListener('DOMContentLoaded', () => {
    function setupDropdown(idPrefix, stateVarName, onChangeCallback) {
        const btn = document.getElementById(`${idPrefix}-dropdown-btn`);
        const menu = document.getElementById(`${idPrefix}-dropdown-menu`);
        const container = document.getElementById(`${idPrefix}-filter-dropdown`);
        const textEl = document.getElementById(`${idPrefix}-dropdown-text`);

        if(!btn || !menu || !container) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('show');
            container.classList.toggle('open');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                menu.classList.remove('show');
                container.classList.remove('open');
            }
        });

        // Handle selection for static dropdowns (seed/version)
        if (idPrefix === 'seed' || idPrefix === 'version') {
            menu.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();

                    // Update UI selection
                    menu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    textEl.innerText = item.innerText;

                    // Close menu
                    menu.classList.remove('show');
                    container.classList.remove('open');

                    // Call callback with new value
                    onChangeCallback(item.getAttribute('data-value'));
                });
            });
        }
    }

    const countryDropdownBtn = document.getElementById('country-dropdown-btn');
    const countryDropdownMenu = document.getElementById('country-dropdown-menu');
    const countryDropdownContainer = document.getElementById('country-filter-dropdown');

    if (countryDropdownBtn && countryDropdownMenu && countryDropdownContainer) {
        countryDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            countryDropdownMenu.classList.toggle('show');
            countryDropdownContainer.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!countryDropdownContainer.contains(e.target)) {
                countryDropdownMenu.classList.remove('show');
                countryDropdownContainer.classList.remove('open');
            }
        });
    }

    setupDropdown('seed', 'selectedSeedFilter', (val) => {
        if (selectedSeedFilter !== val) {
            selectedSeedFilter = val;
            currentPage = 1;
            fetchServerData(); // Fetch new data from server
        }
    });

    setupDropdown('version', 'selectedVersionFilter', (val) => {
        if (selectedVersionFilter !== val) {
            selectedVersionFilter = val;
            currentPage = 1;
            fetchServerData(); // Fetch new data from server
        }
    });
});
"""

# Replace the existing dropdown listener section
content = re.sub(r'// Dropdown toggle listener\ndocument\.addEventListener\(\'DOMContentLoaded\', \(\) => \{.*?\}\);\n', dropdown_setup, content, count=1, flags=re.DOTALL)

with open('public/app.js', 'w') as f:
    f.write(content)
