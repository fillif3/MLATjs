from bottle import route, run, post
from yubico_client import Yubico

@route('/')
def index():
    return ('Hello name')

@post('/')
def do_login():
    return true
    password = request.forms.get('password')
    client = Yubico('63231', 'PDm5yU3z4bGS3OK6/GMgus1rkXY=')
    client.verify(password)
    if client.verify(password):
        return "<p>Your login information was correct.</p>"
    else:
        return "<p>Login failed.</p>"

run(host='localhost', port=8000)