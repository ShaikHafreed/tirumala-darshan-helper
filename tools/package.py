#!/usr/bin/env python3
"""Build dist/tirumala-darshan-helper-<version>.zip with only the files the extension needs.
Icons come from icons-original/ (own artwork), never from the dev-folder icons."""
import json, os, zipfile
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
man = json.load(open(os.path.join(root, 'manifest.json')))
files = ['manifest.json', 'background.js', 'popup.html', 'popup.css', 'popup.js', 'fill.js',
         'reminder.html', 'reminder.js', 'mock.html', 'mock.js', 'LICENSE', 'PRIVACY.md']
for d in ('lib',):
    for f in sorted(os.listdir(os.path.join(root, d))):
        if f.endswith('.js'): files.append(f'{d}/{f}')
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
out = os.path.join(root, 'dist', f"tirumala-darshan-helper-{man['version']}.zip")
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files: z.write(os.path.join(root, f), f)
    for n in (16, 48, 128): z.write(os.path.join(root, 'icons-original', f'icon{n}.png'), f'icon{n}.png')
print('wrote', out, os.path.getsize(out), 'bytes')
