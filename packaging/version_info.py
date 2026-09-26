# -*- coding: utf-8 -*-
"""Windows アプリ版の版(窓のタイトル・exe の「詳細」・インストーラ)。手で書かない(BLK-human-20260926-2100)。

次の順に見て最初に取れたものを使う:
  1. 環境変数 ``APP_VERSION``(CI がタグ ``v1.1`` から渡す)
  2. ``git describe --tags --abbrev=0``(手元のビルド)
  3. リポジトリ直下の ``VERSION``(git が無い場所での最後の砦。bump-version.sh が揃える正本)
"""
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

PRODUCT = 'StableBlock'
DESCRIPTION = 'StableBlock - テキストが正本のブロック図エディタ'
COPYRIGHT = 'GPL-3.0-only'


def _from_git():
    try:
        out = subprocess.run(['git', 'describe', '--tags', '--abbrev=0'], cwd=ROOT,
                             capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return ''
    return out.stdout.strip() if out.returncode == 0 else ''


def _from_version_file():
    try:
        with open(os.path.join(ROOT, 'VERSION'), encoding='utf-8') as f:
            return f.readline().strip()
    except OSError:
        return ''


def resolve_version():
    """表示用の版('1.1' など。先頭の v は付けない)。取れなければ '0.0.0'。"""
    for raw in (os.environ.get('APP_VERSION', ''), _from_git(), _from_version_file()):
        raw = (raw or '').strip()
        if raw:
            return re.sub(r'^v', '', raw)
    return '0.0.0'


def version_tuple(version):
    """'1.1' → (1, 1, 0, 0)。Windows の版情報は 4 つの整数しか受け付けない。"""
    nums = [int(n) for n in re.findall(r'\d+', version)[:4]]
    while len(nums) < 4:
        nums.append(0)
    return tuple(nums)


def version_file_text(version=None):
    version = version or resolve_version()
    t = version_tuple(version)
    return u"""VSVersionInfo(
  ffi=FixedFileInfo(filevers=%(t)s, prodvers=%(t)s, mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable(u'041104b0', [
      StringStruct(u'CompanyName', u'%(product)s'),
      StringStruct(u'FileDescription', u'%(desc)s'),
      StringStruct(u'FileVersion', u'%(v)s'),
      StringStruct(u'InternalName', u'%(product)s'),
      StringStruct(u'LegalCopyright', u'%(copy)s'),
      StringStruct(u'OriginalFilename', u'%(product)s.exe'),
      StringStruct(u'ProductName', u'%(product)s'),
      StringStruct(u'ProductVersion', u'%(v)s')])]),
    VarFileInfo([VarStruct(u'Translation', [0x0411, 1200])])
  ]
)
""" % {'t': t, 'product': PRODUCT, 'desc': DESCRIPTION, 'copy': COPYRIGHT, 'v': version}


def write_version_file(dest):
    """PyInstaller の version= に渡す版情報ファイルを書き、そのパスを返す。"""
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(version_file_text())
    return dest


def write_version_txt(dest):
    """exe に同梱する version.txt(窓のタイトルに出す。exe には git が無いので焼き込む)。"""
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(resolve_version() + '\n')
    return dest


if __name__ == '__main__':
    print(resolve_version())
