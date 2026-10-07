"""Serve the app at http://localhost:8765 without letting the browser cache anything.

Only needed if you would rather not open index.html straight from disk:

    python serve.py
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8765


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    print(f'House Map is at http://localhost:{PORT}  (Ctrl+C to stop)')
    ThreadingHTTPServer(('127.0.0.1', PORT), NoCacheHandler).serve_forever()
