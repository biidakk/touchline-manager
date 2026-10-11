"""Touchline Manager desktop app: serves the game files locally and opens them
in a window of its own (Microsoft Edge WebView2, part of Windows 10/11).

Run from source:   python desktop/launcher.py
Build the .exe:    desktop\\build_exe.bat   (creates app\\TouchlineManager.exe)

Saves live in the window's own browser storage under
%APPDATA%\\TouchlineManager (separate from saves made in a normal browser:
use Export / Import to move a career across).
"""

import os
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import webview

# Fixed address: the browser storage (saves) belongs to it, so it must not change.
HOST, PORT = '127.0.0.1', 8766
TITLE = 'Touchline Manager'


def game_dir():
    """The game files: inside the .exe when frozen, else the project folder."""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def user_dir():
    """Where the player keeps names.json: next to the .exe (or the project folder)."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return game_dir()


class Handler(SimpleHTTPRequestHandler):
    # Windows can map .js to text/plain from the registry; ES modules need JavaScript.
    extensions_map = {
        '': 'application/octet-stream', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
    }

    def translate_path(self, path):
        # names.json next to the .exe wins over the bundled example; a
        # realpack.json (real teams and players) is only ever read from there.
        name = path.split('?')[0].lstrip('/')
        if name in ('names.json', 'realpack.json'):
            own = os.path.join(user_dir(), name)
            if os.path.exists(own):
                return own
        return super().translate_path(path)

    def end_headers(self):
        # Always serve fresh files (no stale scripts after an update).
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass


def start_server():
    try:
        server = ThreadingHTTPServer((HOST, PORT), partial(Handler, directory=game_dir()))
    except OSError:
        # Already running (a second window): use the existing server.
        return None
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main():
    server = start_server()
    webview.settings['ALLOW_DOWNLOADS'] = True  # Export save files
    webview.create_window(TITLE, f'http://{HOST}:{PORT}/index.html', width=1320, height=790, min_size=(960, 560),
                          background_color='#0b2a6b')
    storage = os.path.join(os.environ.get('APPDATA', user_dir()), 'TouchlineManager')
    webview.start(private_mode=False, storage_path=storage)
    if server:
        server.shutdown()


if __name__ == '__main__':
    main()
