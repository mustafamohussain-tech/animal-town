# Tiny local web server for Hartna (only reachable from this PC).
# Sends "no-cache" so the browser always loads the newest game files.
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer.allow_reuse_address = True
with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler) as httpd:
    print(f'Hartna is running at http://localhost:{PORT}/  (close this window to stop)')
    httpd.serve_forever()
