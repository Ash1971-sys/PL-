"""Optional Flask entry point for the same routes used by serve.py."""

import os

from flask import Flask, Response, abort, jsonify, redirect, request

from backend.yolo_pipeline import upload_response
from league_chat import MAX_CHAT_BODY, chat_response, reply
from site_content import canonical_path, representation, resource, site_origin

app = Flask(__name__, static_folder=None)

@app.post('/api/analyze-video')
def analyze_video():
    status, content = upload_response(request.stream, request.content_length, request.headers)
    response = jsonify(content)
    response.status_code = status
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.post('/api/chat')
def chat():
    if request.mimetype != 'application/json':
        status, content = 415, reply('Send the question as JSON.')
    elif request.content_length is not None and request.content_length > MAX_CHAT_BODY:
        status, content = 413, reply('That request is too large.')
    else:
        status, content = chat_response(request.stream.read(MAX_CHAT_BODY + 1))
    response = jsonify(content)
    response.status_code = status
    response.headers['Cache-Control'] = 'no-store'
    return response


@app.route('/', defaults={'relative_path': ''})
@app.route('/<path:relative_path>')
def serve_site(relative_path):
    requested_path = '/' + relative_path
    path = canonical_path(requested_path)
    if path != requested_path:
        query = request.query_string.decode('latin-1')
        return redirect(path + ('?' + query if query else ''), code=301)

    item = resource(path, site_origin(request.host_url))
    if item is None:
        abort(404)
    status, body, headers = representation(
        item, request.headers.get('Accept-Encoding', ''), request.headers.get('If-None-Match', '')
    )
    return Response(body, status=status, headers=headers)


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('PORT', 5000)))
