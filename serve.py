"""Lightweight local HTTP entry point for PL Analytics."""

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from backend.yolo_pipeline import upload_response
from league_chat import MAX_CHAT_BODY, chat_response, reply
from site_content import canonical_path, representation, resource, site_origin


class PremierLeagueHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        target = urlsplit(self.path)
        path = canonical_path(target.path)
        if path != target.path:
            self.send_response(301)
            self.send_header('Location', path + ('?' + target.query if target.query else ''))
            self.end_headers()
            return

        origin = site_origin('http://' + self.headers.get('Host', 'localhost:8000'))
        item = resource(path, origin)
        if item is None:
            self.send_error(404)
            return

        status, body, headers = representation(
            item, self.headers.get('Accept-Encoding', ''), self.headers.get('If-None-Match', '')
        )
        self.send_response(status)
        for key, value in headers.items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != 'HEAD' and body:
            self.wfile.write(body)

    do_HEAD = do_GET

    def do_POST(self):
        route = urlsplit(self.path).path
        if route == '/api/analyze-video':
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                length = 0
            self.connection.settimeout(30)
            status, content = upload_response(self.rfile, length, self.headers)
            self.send_chat(status, content)
            return
        if route != '/api/chat':
            self.send_error(404)
            return
        if self.headers.get_content_type() != 'application/json':
            self.send_chat(415, reply('Send the question as JSON.'))
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if length > MAX_CHAT_BODY:
            self.send_chat(413, reply('That request is too large.'))
            return
        status, content = chat_response(self.rfile.read(max(length, 0)))
        self.send_chat(status, content)

    def send_chat(self, status, content):
        body = json.dumps(content, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_server(port=8000):
    with ThreadingHTTPServer(('127.0.0.1', port), PremierLeagueHandler) as server:
        print(f'PL Analytics running at http://localhost:{server.server_port}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    run_server(int(sys.argv[1]) if len(sys.argv) > 1 else 8000)
