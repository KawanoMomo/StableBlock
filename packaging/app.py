#!/usr/bin/env python3
"""StableBlock — Windows アプリ版の起動口(BLK-human-20260926-2100)。

画面は単体 HTML 版と同じ stableblock.html(共通コアを埋め込んだもの。scripts/build-single-html.mjs が作る)を
file:// でそのまま開く薄い入れ物で、アプリ専用の画面は作らない。

  python packaging/app.py                 … 窓で開く(リポジトリの stableblock.html をそのまま)
  python packaging/app.py --smoke out.json [--shot out.bmp]
                                          … 起動して初期画面が出たかを確かめて終わる(CI のスモーク)

ここがするのは 4 つだけ:
  1. stableblock.html を file:// で開く(今の Import / Export がそのまま動く。書き出しは保存ダイアログで保存先を選ぶ)
  2. 窓のタイトルに版を出す(版はビルド時に git tag から焼き込んだ version.txt)
  3. 起動に失敗したら理由を crash.log に残して日本語で知らせる(console=False なので黙って消えると何も分からない)
  4. --smoke: 図が描かれステータスバーが出たら結果を JSON に書いて閉じる(出なければ終了コード 1)
"""
import json
import os
import sys
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
# 同梱物の置き場所。exe では PyInstaller の展開先(_internal)、ソースからはリポジトリ直下
APP_ROOT = Path(getattr(sys, '_MEIPASS', HERE.parent))
FROZEN = bool(getattr(sys, 'frozen', False))
APP_NAME = 'StableBlock'
REQUIRED_FILES = ('stableblock.html',)


def app_version():
    """窓のタイトルに出す版。exe はビルド時に焼いた version.txt、ソースからは version_info が git から取る。"""
    baked = APP_ROOT / 'version.txt'
    if baked.exists():
        return baked.read_text(encoding='utf-8').strip()
    try:
        sys.path.insert(0, str(HERE))
        import version_info
        return version_info.resolve_version()
    except Exception:
        return ''


def window_title():
    v = app_version()
    return f'{APP_NAME} v{v}' if v else APP_NAME


def crash_log_path():
    base = os.environ.get('LOCALAPPDATA') or os.environ.get('APPDATA') or str(Path.home())
    folder = Path(base) / APP_NAME
    try:
        folder.mkdir(parents=True, exist_ok=True)
    except OSError:
        return Path(base) / f'{APP_NAME}-crash.log'
    return folder / 'crash.log'


def missing_bundled_files():
    """同梱されているはずのファイルで見つからないもの(zip を展開せずに exe を叩いたときの目印)。"""
    return [rel for rel in REQUIRED_FILES if not (APP_ROOT / rel).exists()]


def write_crash_log(summary, detail):
    lines = [f'==== {datetime.now().isoformat(timespec="seconds")} {summary}',
             f'version   : {app_version()}', f'frozen    : {FROZEN}', f'executable: {sys.executable}',
             f'app_root  : {APP_ROOT}', f'missing   : {", ".join(missing_bundled_files()) or "(なし)"}',
             '', detail.rstrip(), '']
    path = crash_log_path()
    try:
        with open(path, 'a', encoding='utf-8') as fp:
            fp.write('\n'.join(lines) + '\n')
    except OSError:
        return None
    return path


def show_error(message):
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, message, f'{APP_NAME} を起動できませんでした', 0x10 | 0x10000)
    except Exception:
        try:
            print(message)
        except Exception:
            sys.stdout.write(message.encode('ascii', 'replace').decode('ascii') + '\n')


def report_failure(summary, hint, detail, quiet=False):
    log = write_crash_log(summary, detail)
    msg = '\n'.join([f'{APP_NAME} の起動に失敗しました。', '', f'原因: {summary}', '', f'次にすること: {hint}', '',
                     f'詳しい記録: {log}' if log else '記録を書ける場所が見つかりませんでした。'])
    if quiet:
        print(msg)
    else:
        show_error(msg)
    return 1


def capture_window_bmp(title, dest):
    """窓の見た目を BMP で保存する(PrintWindow。PIL を同梱しないため ctypes で書く)。取れなければ False。"""
    if os.name != 'nt':
        return False
    import ctypes
    from ctypes import wintypes
    user32, gdi32 = ctypes.windll.user32, ctypes.windll.gdi32
    hwnd = user32.FindWindowW(None, title)
    if not hwnd:
        return False
    rect = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    w, h = rect.right - rect.left, rect.bottom - rect.top
    if w <= 0 or h <= 0:
        return False
    hdc = user32.GetWindowDC(hwnd)
    mdc = gdi32.CreateCompatibleDC(hdc)
    bmp = gdi32.CreateCompatibleBitmap(hdc, w, h)
    gdi32.SelectObject(mdc, bmp)
    user32.PrintWindow(hwnd, mdc, 2)  # PW_RENDERFULLCONTENT: WebView2 の中身も描く

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [('biSize', wintypes.DWORD), ('biWidth', wintypes.LONG), ('biHeight', wintypes.LONG),
                    ('biPlanes', wintypes.WORD), ('biBitCount', wintypes.WORD), ('biCompression', wintypes.DWORD),
                    ('biSizeImage', wintypes.DWORD), ('biXPelsPerMeter', wintypes.LONG),
                    ('biYPelsPerMeter', wintypes.LONG), ('biClrUsed', wintypes.DWORD),
                    ('biClrImportant', wintypes.DWORD)]
    bih = BITMAPINFOHEADER(ctypes.sizeof(BITMAPINFOHEADER), w, h, 1, 32, 0, 0, 0, 0, 0, 0)
    buf = ctypes.create_string_buffer(w * h * 4)
    gdi32.GetDIBits(mdc, bmp, 0, h, buf, ctypes.byref(bih), 0)
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(mdc)
    user32.ReleaseDC(hwnd, hdc)
    size = w * h * 4
    header = b'BM' + (54 + size).to_bytes(4, 'little') + b'\0\0\0\0' + (54).to_bytes(4, 'little')
    with open(dest, 'wb') as f:
        f.write(header + bytes(bih) + buf.raw)
    return True


# 初期画面が出たか: 見本の図の block が描かれ、ステータスバーに寸法が出ている
SMOKE_JS = """(() => ({
  blocks: document.querySelectorAll('#svg-wrap svg g[data-type="block"]').length,
  status: (document.getElementById('status') || {}).innerText || '',
  tools: !!document.querySelector('[data-term="open-sb"]'),
  core: !!(window.StableBlockLabel && window.StableBlockLayout && window.StableBlockExcel),
}))()"""


def run_smoke(window, out, shot, timeout=60):
    result = {'ok': False, 'title': window_title()}
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            r = window.evaluate_js(SMOKE_JS) or {}
        except Exception as e:  # 読み込み前は評価できない
            r = {'error': str(e)}
        result.update(r)
        if r.get('blocks', 0) > 0 and 'Canvas' in r.get('status', '') and r.get('tools') and r.get('core'):
            result['ok'] = True
            break
        time.sleep(0.5)
    if shot:
        time.sleep(1)
        result['shot'] = bool(capture_window_bmp(window_title(), shot))
    Path(out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    window.destroy()
    os._exit(0 if result['ok'] else 1)


def main(argv):
    smoke_out = argv[argv.index('--smoke') + 1] if '--smoke' in argv else None
    shot = argv[argv.index('--shot') + 1] if '--shot' in argv else None
    missing = missing_bundled_files()
    if missing:
        return report_failure('画面のファイルが見つからない: ' + ', '.join(missing),
                              'zip を右クリック →「すべて展開」でフォルダごと取り出し、その中の StableBlock.exe を起動する',
                              f'app_root={APP_ROOT}', quiet=bool(smoke_out))
    try:
        import webview
    except Exception:
        return report_failure('pywebview を読み込めない', 'インストーラ版を入れ直す', traceback.format_exc(), quiet=bool(smoke_out))
    # 書き出し(.sb 保存・SVG・PNG・Excel・Mermaid)はブラウザではダウンロード。窓では保存ダイアログで保存先を選ぶ
    webview.settings['ALLOW_DOWNLOADS'] = True
    webview.settings['ALLOW_FILE_URLS'] = True
    url = (APP_ROOT / 'stableblock.html').resolve().as_uri()
    try:
        window = webview.create_window(window_title(), url, width=1400, height=900, min_size=(900, 600))
        func, args = (run_smoke, (window, smoke_out, shot)) if smoke_out else (None, None)
        webview.start(func, args, private_mode=True)
    except Exception:
        return report_failure('窓を開けない(WebView2 ランタイムが無い可能性)',
                              'Microsoft Edge WebView2 ランタイムを入れてから起動し直す', traceback.format_exc(),
                              quiet=bool(smoke_out))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except SystemExit:
        raise
    except Exception:
        sys.exit(report_failure('想定外の例外', 'crash.log を添えて知らせる', traceback.format_exc()))
