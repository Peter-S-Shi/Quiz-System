#!/usr/bin/env python3
"""
Quiz Studio Local Development Server
Serves static files with no-store / no-cache headers to prevent ES module cache incoherence during development.
"""

import sys
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

class DevHttpHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        # Concise standard output
        sys.stderr.write(f"[{self.log_date_time_string()}] {format % args}\n")

def run(port=8000, host="127.0.0.1", directory=None):
    if directory:
        os.chdir(directory)
    
    server_address = (host, port)
    try:
        httpd = HTTPServer(server_address, DevHttpHandler)
    except OSError as err:
        sys.stderr.write(f"Error: Could not bind to {host}:{port} - {err}\n")
        sys.exit(1)
        
    print(f"Quiz Studio local dev server running at http://{host}:{port}/", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8000
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    run(port=port, host="127.0.0.1", directory=repo_root)
