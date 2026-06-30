# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for Tally Time Tracker
# Run:  pyinstaller TallyTimeTracker.spec
#
# The browser_extension/ folder is NOT bundled inside the exe — it is copied
# to the output folder by build.bat so users can load it in Chrome as an
# unpacked extension.

import os
from pathlib import Path

ROOT = Path(SPECPATH)

a = Analysis(
    [str(ROOT / 'TallyTimeTracker.py')],
    pathex=[str(ROOT)],
    binaries=[],
    datas=[
        # Brand fonts
        (str(ROOT / 'fonts'),          'fonts'),
        # Dashboard served over localhost
        (str(ROOT / 'dashboard.html'), '.'),
        # Tray / window icons
        (str(ROOT / 'tt_badge.ico'),        '.'),
        (str(ROOT / 'tt_tray.ico'),         '.'),
        (str(ROOT / 'tt_splash.png'),       '.'),
        # NetSuite lookup data
        (str(ROOT / 'netsuite_data.json'),  '.'),
    ],
    hiddenimports=[
        'pystray',
        'pystray._win32',
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        'pynput',
        'pynput.keyboard',
        'pynput.mouse',
        'win32gui',
        'win32process',
        'win32con',
        'psutil',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='TallyTimeTracker',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,           # no terminal window
    icon=str(ROOT / 'tt_badge.ico'),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='TallyTimeTracker',
)
