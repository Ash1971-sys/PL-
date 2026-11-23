import os
import sys
import mimetypes
from http.server import HTTPServer, SimpleHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')
STATIC_DIR = os.path.join(BASE_DIR, 'static')

class PremierLeagueHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_GET(self):
        url_path = self.path.split('?')[0]
        
        if url_path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return

        # Route mapping
        if url_path in ['/', '/index.html']:
            return self.serve_file(os.path.join(TEMPLATES_DIR, 'index.html'), 'text/html')
        elif url_path in ['/players', '/players.html']:
            return self.serve_file(os.path.join(TEMPLATES_DIR, 'players.html'), 'text/html')
        elif url_path in ['/simulator', '/simulator.html']:
            return self.serve_file(os.path.join(TEMPLATES_DIR, 'simulator.html'), 'text/html')
        
        # Handle templates directory requests
        if url_path.startswith('/templates/'):
            filename = url_path.replace('/templates/', '')
            file_path = os.path.join(TEMPLATES_DIR, filename)
            if os.path.exists(file_path):
                mime, _ = mimetypes.guess_type(file_path)
                return self.serve_file(file_path, mime or 'text/html')
        
        # Fallback to standard static file serving
        return super().do_GET()

    do_HEAD = do_GET

    def serve_file(self, filepath, content_type):
        if not os.path.exists(filepath):
            self.send_error(404, f"File not found: {filepath}")
            return
        
        try:
            with open(filepath, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Internal server error: {e}")

def run_server(port=8000):
    server_address = ('', port)
    httpd = HTTPServer(server_address, PremierLeagueHandler)
    print("=" * 65)
    print(f"  PREMIER LEAGUE ANALYTICS ARCHIVE (2021–2026)")
    print(f"  Sharp-Edge Design System // Total Frontend: <80 KB")
    print(f"  Local Server running at: http://localhost:{port}")
    print(f"  - Match Center: http://localhost:{port}/")
    print(f"  - Player Stats Hub: http://localhost:{port}/players")
    print("=" * 65)
    print("  Press Ctrl+C to stop server.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer terminated by user.")
        httpd.server_close()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port)
