import re

with open('public/app.js', 'r') as f:
    content = f.read()

# Change main-title to page-title in js
content = content.replace("getElementById('main-title')", "getElementById('page-title')")

with open('public/app.js', 'w') as f:
    f.write(content)
