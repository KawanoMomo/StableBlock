# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec — StableBlock の Windows アプリ(BLK-human-20260926-2100)
#
#   pyinstaller packaging/StableBlock.spec --noconfirm      (npm run build:app と同じ)
#
# 同梱するのは画面 1 枚だけ: 共通コア(core/*.js)を埋め込んだ stableblock.html(scripts/build-single-html.mjs が作る)。
# 窓は pywebview(WebView2)。Electron は使わない(成果物を数十 MB に収める)。
import os
import subprocess
import sys

# spec からの相対パスは packaging/ 起点になるので、リポジトリ直下を絶対パスで持つ
ROOT = os.path.abspath(os.path.join(SPECPATH, '..'))


def at(rel):
    return os.path.join(ROOT, rel.replace('/', os.sep))


sys.path.insert(0, at('packaging'))
import version_info  # noqa: E402

os.makedirs(workpath, exist_ok=True)
VERSION_FILE = version_info.write_version_file(os.path.join(workpath, 'version_info.txt'))
VERSION_TXT = version_info.write_version_txt(os.path.join(workpath, 'version.txt'))

# 画面: リポジトリの stableblock.html に core/ を埋め込んだ 1 ファイル(Release に添付する単体の HTML と同じもの)
SINGLE_HTML = os.path.join(workpath, 'stableblock.html')
subprocess.run(['node', at('scripts/build-single-html.mjs'), SINGLE_HTML], check=True)

ICON = at('packaging/icon.ico')

datas = [
    (SINGLE_HTML, '.'),
    (VERSION_TXT, '.'),
    (ICON, 'packaging'),
    (at('LICENSE'), '.'),
    (at('README.md'), '.'),
]

a = Analysis(
    [at('packaging/app.py')],
    pathex=[at('packaging')],
    binaries=[],
    datas=datas,
    hiddenimports=['version_info'],
    hookspath=[],
    runtime_hooks=[],
    excludes=['tkinter'],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='StableBlock',
    debug=False,
    strip=False,
    upx=False,
    console=False,
    icon=ICON,
    version=VERSION_FILE,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='StableBlock',
)
