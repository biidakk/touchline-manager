"""Serves Squadra Manager on the home network for phones and tablets.

Like `python -m http.server`, but it prints the addresses to open, keeps the log
quiet, sends no-cache headers (so the phone always gets the latest files), and
explains what to do when a phone tries a secure https:// connection, which a
simple home server can't offer.
"""
import http.server
import os
import socket
import socketserver
import sys
import time

PORT = 8765
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lan_addresses():
    """The PC's addresses on the home network."""
    found = set()
    try:
        # The address used to reach the internet is the LAN one (no data is sent).
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        found.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            found.add(info[4][0])
    except OSError:
        pass
    return sorted(a for a in found if not a.startswith('127.'))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # quiet: only the hints below are printed

    def log_error(self, fmt, *args):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    last_hint = 0
    seen = set()

    def verify_request(self, request, client_address):
        # A TLS handshake starts with byte 0x16: the phone asked for https://.
        try:
            request.settimeout(5)
            first = request.recv(1, socket.MSG_PEEK)
            request.settimeout(None)
        except OSError:
            return False
        if first == b'\x16':
            if time.time() - self.last_hint > 20:
                self.last_hint = time.time()
                print(f'\n  ! {client_address[0]} tried a secure https:// connection, which this home server cannot do.')
                print('    On the phone, type the address with http:// at the start (see above).')
                print('    Chrome: if it still switches to https, tap "Continue to site", or turn off')
                print('            Settings > Privacy and security > Security > "Always use secure connections".')
                print('    iPhone: Settings > Apps > Safari > turn off "Not Secure Connection Warning", then retry.\n')
            return False
        if client_address[0] not in self.seen:
            self.seen.add(client_address[0])
            print(f'  Connected: {client_address[0]}')
        return True


def main():
    addrs = lan_addresses()
    print()
    print('  Squadra Manager for your phone')
    print('  --------------------------------')
    print('  On your phone (same Wi-Fi), type this address exactly, including http://')
    print()
    for a in addrs or ['(no network address found: is this PC on Wi-Fi or a network cable?)']:
        print(f'      http://{a}:{PORT}')
    print()
    print('  Turn the phone sideways. Close this window to stop.')
    print()
    try:
        with Server(('0.0.0.0', PORT), Handler) as httpd:
            httpd.serve_forever()
    except OSError as e:
        print(f'  Could not start on port {PORT}: {e}')
        print('  Is the game already running in another window (start.bat or start-phone.bat)? Close it and try again.')
        input('  Press Enter to close.')
        sys.exit(1)


if __name__ == '__main__':
    main()
