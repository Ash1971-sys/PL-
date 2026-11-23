import os
from flask import Flask, render_template, send_from_directory, jsonify

app = Flask(
    __name__,
    template_folder='templates',
    static_folder='static'
)

@app.route('/')
def match_center():
    return render_template('index.html')

@app.route('/players')
@app.route('/players.html')
def player_hub():
    return render_template('players.html')

@app.route('/simulator')
@app.route('/simulator.html')
def tactical_simulator():
    return render_template('simulator.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("=" * 65)
    print(f"  PREMIER LEAGUE ANALYTICS (Flask Engine)")
    print(f"  Live Server: http://127.0.0.1:{port}")
    print("=" * 65)
    app.run(host='0.0.0.0', port=port, debug=True)
