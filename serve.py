#!/usr/bin/env python3
"""
Simple local HTTP server for TrafficSimulator.
ES modules require HTTP — you cannot open index.html directly from the filesystem.

Usage:
    python serve.py          # serves on port 8080
    python serve.py 9000     # serves on a custom port
"""
import http.server, socketserver, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

# Ensure correct MIME type for ES modules
class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js':   'application/javascript',
        '.mjs':  'application/javascript',
        '.html': 'text/html',
    }
    def log_message(self, fmt, *args):
        pass  # silence per-request noise

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"\n  Traffic Simulator  →  http://localhost:{PORT}\n  Ctrl+C to stop.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
