from flask import Flask, url_for, redirect, render_template, request, abort
from flask import session, jsonify
from flask_sockets import Sockets
import random
import json
from yattag import Doc
import pyrebase
from flask_pymongo import PyMongo
import dns
from bson.json_util import loads, dumps

with open('./creds/keys.txt') as f:
  # open file with secret keys, read in vals with newline stripped
  mongo_uri = f.readline().rstrip()
  api_key = f.readline().rstrip()
app = Flask(__name__)
app.config['SECRET_KEY'] = 'doesntmatter'
app.config["MONGO_URI"] = mongo_uri
mongo = PyMongo(app)

# firebase config (ONLY USED FOR AUTHENTICATION)
config = {
  "apiKey": api_key,
  "authDomain": "dndonline.firebaseapp.com",
  "databaseURL": "https://dndonline.firebaseio.com",
  "storageBucket": "dndonline.appspot.com",
  "serviceAccount": "./creds/dndonline-firebase-adminsdk-pjy9q-0f2dc0d576.json"
}
fb = pyrebase.initialize_app(config) # initialize firebase connection
auth = fb.auth()

sockets = Sockets(app)             # create socket listener
u_to_client = {}                  # map users to Client object
r_to_client = {}                # map room to list of Clients connected`(uses Object from gevent API)
r_to_dm = {}     # maps room to boolean marking True if room already has DM, false if no DM
r_u_char = {}    # for each room, maps username to character name 
single_events = ['get_sheet', 'get_blank', 'load_sheets'] # track events where should only be sent to sender of event, i.e. not broadcast
user_acc = ''
user_token = ''

# map level to amount of XP needed
level_to_xp = {
  2: '300',
  3: '900',
  4: '2700',
  5: '6500',
  6: '14000',
  7: '23000',
  8: '34000',
  9: '48000',
  10: '64000',
  11: '85000',
  12: '100000',
  13: '120000',
  14: '140000',
  15: '165000',
  16: '195000',
  17: '225000',
  18: '265000',
  19: '305000',
  20: '355000'
}

# for both mods and figuring out attr changed
mod_stats = {
  'none': 'None',
  'str': 'Strength',
  'const': 'Constitution',
  'dex': 'Dexterity',
  'intell': 'Intelligence',
  'wis': 'Wisdom',
  'char': 'Charisma',
  'hp': 'Hit Points',
  'xp': 'Experience Points',
  'hero': 'Heroics',
  'curr_speed': 'Current Speed',
  'pp': 'PP',
  'gp': 'GP',
  'ep': 'EP',
  'sp': 'SP',
  'cp': 'CP',
  'languages': 'Languages',
  'enhan': 'Conditions & Enchantments',
  'resist': 'Resistances',
  'special': 'Special Skills & Abilities'
}

# map all abbreviated ids to full name for printing
align_abbrev = {
  'lg': 'Lawful Good',
  'ng': 'Neutral Good',
  'cg': 'Chaotic Good',
  'ln': 'Lawful Neutral',
  'neu': 'Neutral',
  'cn': 'Chaotic Neutral',
  'le': 'Lawful Evil',
  'ne': 'Neutral Evil',
  'ce': 'Chaotic Evil'
}

dice_info = {
  0: ('(d4): ', 4),
  1: ('(d6): ', 6),
  2: ('(d8): ', 8),
  3: ('(d10): ', 10),
  4: ('(d12): ', 12),
  5: ('(d20): ', 20),
}
# helper to roll dice, takes dice type and adv/disadv attributes
def roll_dice(dice_list, mod, mod_v, adv, dis, uname, room, isPlayer):
  mod_val = modifier(mod_v)
  mod_msg = (' (modifier) ' + mod_stats[mod] + ' +' + str(mod_val)) if mod != 'none' else ''
  if sum(dice_list) == 0:
    return "No rolls selected..."

  rolls = roll_all(dice_list)
  if isPlayer:
    if room in r_u_char.keys() and uname in r_u_char[room].keys():
      # display alias if character has taken name 
      alias = r_u_char[room][uname]
      msg = alias + ' (' + uname + ') rolled:' + mod_msg + '</br>'
    else:
      msg = uname + ' rolled:' + mod_msg + '</br>'
  else:
    msg = 'Dungeon Master (' + uname + ') rolled:' + mod_msg + '</br>'
  msg += rolls[0]
  print(rolls[0])
  if (adv != dis):
    #if distinct values, means rolled 2 dice
    rolls2 = roll_all(dice_list)
    msg += 'and ' + ('(with advantage)</br>' if adv else '(with disadvantage) </br>') + rolls2[0]
    msg += 'Use the ' + ('FIRST ' if ((rolls[1] >= rolls2[1] and adv) or (rolls[1] <= rolls2[1] and dis)) else 'SECOND ')
    msg += ' set of rolls'
  return msg

def roll_all(dice_list):
  roll_i = 0
  roll_sum = 0
  msg = ''
  for roll_count in dice_list:
    if roll_count > 0:
      msg += dice_info[roll_i][0]
      for i in range(roll_count):
        roll = random.randint(1, dice_info[roll_i][1])
        roll_sum += roll
        msg += str(roll) + (', ' if i != roll_count-1 else '</br>')
    roll_i += 1
  roll_data = [msg, roll_sum]
  return roll_data

def modifier(mod_value):
  mod_try = (int(mod_value)-10) // 2
  return mod_try

# helper for when new client enters room, store new Client object, map uname to Client object for removal
def add_client(clients, room, uname, ip, port):
  # use IP port tuple to identify client, find client with matching info, map for later messages
  if room not in r_to_client.keys():
    r_to_client[room] = []  # if empty, create new list
  client_tuple = (str(ip), int(port))
  print(list(clients.keys())) # DEBUG
  print(client_tuple)   # DEBUG
  for ip_tuple in list(clients.keys()):
    if ip_tuple == client_tuple:
      print('found client!')
      found_client = clients[ip_tuple]
      u_to_client[uname] = found_client
      r_to_client[room].append(found_client)
      break

# helper from when client leaves room, remove Client entry for uname and from room list
# update client list
def remove_client(uname, room):
  global r_to_client
  global u_to_client
  to_rem = u_to_client.pop(uname) # remove leaving client's entry and get val
  print(to_rem) # DEBUG
  if to_rem in r_to_client[room]:
    print('removing client') # DEBUG
    r_to_client[room].remove(to_rem)
  if not r_to_client[room]:
    print('room ' + room + ' is empty!') # DEBUG
    r_to_client.pop(room) # remove room

# helper to determine what type of request based on header, form response
def decide_request(req, uname, isPlayer, clients, room, ip, port):
  resp = ""
  join_resp = "" # in case of player loading/creating sheet, must also let room know of new character
  req_type = req['type']
  # for all include character name if exists
  if req_type == 'enter':
    # person has joined room, must take difference of new clients list and old
    # use to track person in room
    add_client(clients, room, uname, ip, port)
    resp = {'msg': uname + ' has entered the battle!', 'color': 'red', 'type': 'status',
    'weight': 'normal'}
  elif req_type == 'text':
    # someone is sending a message
    if isPlayer:
      if room in r_u_char.keys() and uname in r_u_char[room].keys():
        # display alias if character has taken name 
        alias = r_u_char[room][uname]
        resp = {'msg': alias + ' (' + uname + '): ' + req['msg'], 'color': 'blue', 'type': 'chat',
        'weight': 'normal'}
      else:
        resp = {'msg': uname + ': ' + req['msg'], 'color': 'blue', 'type': 'chat', 'weight':'normal'}
    else:
      # DM (bold + urple)
      resp = {'msg': 'Dungeon Master (' + uname + '): ' + req['msg'], 'color': 'purple', 'type': 'chat',
      'weight': 'bold'}
  elif req_type == 'dice_roll':
    # someone is asking for dice rolls
    msg = roll_dice(req['dice_list'],req['modifier'], req['modifier_value'], req['adv'], req['disadv'], uname, room, isPlayer)
    resp = {'msg': msg, 'color':'green', 'weight': 'bold', 'type': 'roll'}
  elif req_type == 'leave':
    # someone leaving the room, remove from room client list to avoid issues, print status
    # also need to update sheet for leaving user, key = UID + title, IF NOT EMPTY
    if req['msg']:
      title = req['msg']['sheet_title']
      uid = session['u_token']
      if isPlayer:
        mongo.db['psheets'].replace_one({"$and":[{'uid': uid}, {'sheet_title': title}]}, req['msg'])
      else:
        mongo.db['dmsheets'].replace_one({"$and":[{'uid': uid}, {'sheet_title': title}]}, req['msg'])
    #print(f'{uname} is leaving')
    remove_client(uname, room)
    if not isPlayer:
      # if DM, must mark room as having no dm
      if room in r_to_dm.keys():
        r_to_dm[room] = False
      resp = {'msg': 'The Dungeon Master (' + uname + ') has left the battle.', 'color': 'red', 'type': 'status',
      'weight': 'bold'}
    else:
      # if player, remove aliased character name
      curr_name = req['msg']['name'] # remove name from list
      if room in r_u_char.keys() and uname in r_u_char[room].keys():
        print('removed ' + uname)
        r_u_char[room].pop(uname)
        # display with char name if has one, otherwise don't
        resp = {'msg': uname + ' (' + curr_name + ')  has left the battle.', 'color': 'red', 'type': 'status',
        'weight': 'normal'}
      else:
        resp = {'msg': uname + ' has left the battle.', 'color': 'red', 'type': 'status', 'weight': 'normal'}
  elif req_type == 'get_sheet':
    # client asking for psheet OR DM info, depending on type, send requested info
    # include both formatted HTML and raw JSON
    # can be either grabbing from db or forming based on raw JSON
    # must both get the sheet and send message showing joining as character
    if 'title' in req.keys():
      # title indicates retrieving from db, use UID as key
      uid = session['u_token']
      title = req['title']
      char_name = ''
      # find requested sheet in DB
      if isPlayer:
        found_raw = mongo.db['psheets'].find_one({"$and":[{'uid': uid}, {'sheet_title': title}]})
        if room not in r_u_char.keys():
          r_u_char[room] = {}
        if uname not in r_u_char[room].keys():
          r_u_char[room][uname] = ''
        char_name = found_raw['name']
        r_u_char[room][uname] = char_name   # store character name
        jsonstr, data = get_player_stats(uname, isPlayer, room, found_raw) # build HTML
        resp = {'msg': data, 'raw': found_raw, 'type': 'sheet', 'l2x': level_to_xp}
      else:
        found_raw = mongo.db['dmsheets'].find_one({"$and":[{'uid': uid}, {'sheet_title': title}]})
        jsonstr, data = get_player_stats(uname, isPlayer, room, found_raw) # build HTML
        resp = {'msg': data, 'raw': found_raw, 'type': 'dmstuff'}
    else:
      # raw JSON of sheet sent in message, store in db using UID as key
      raw_sheet = req['msg']
      raw_sheet['uid'] = session['u_token']
      if isPlayer:
        mongo.db['psheets'].insert_one(raw_sheet)
        if room not in r_u_char.keys():
          r_u_char[room] = {}
        if uname not in r_u_char[room].keys():
          r_u_char[room][uname] = ''
        char_name = raw_sheet['name']
        r_u_char[room][uname] = char_name  # store character name
      else:
        mongo.db['dmsheets'].insert_one(raw_sheet)
      # db.collection(u'psheets').add(raw_sheet)
      jsonstr, data = get_player_stats(uname, isPlayer, room, raw_sheet)
      if isPlayer:
          resp = {'msg': data, 'raw': raw_sheet, 'type': 'sheet', 'l2x': level_to_xp}
      else:
          resp = {'msg': data, 'raw': raw_sheet, 'type': 'dmstuff'}
    # create broadcast message for room status
    if isPlayer:
      join_resp = {'msg': uname + ' has joined the game as ' + char_name + '.', 'color': 'chocolate', 'type': 'status',
      'weight': 'normal'}
    else:
      join_resp = {'msg': uname + ' has joined the game as Dungeon Master.', 'color': 'chocolate', 'type': 'status', 
      'weight': 'bold'}
  elif req_type == 'change_attr':
    # someone changed a numeric attribute
    direction = 'increased' if req['dir'] else 'decreased'
    lvl_up = ' Level Up!!!' if req['lvl'] else ''
    # keep same if not shortened version (should only be gems)
    attr = mod_stats[(req['attr'])] if req['attr'] in mod_stats.keys() else req['attr']
    if room in r_u_char.keys() and uname in r_u_char[room].keys():
      # display alias if character has taken name 
      alias = r_u_char[room][uname]
      resp = {'msg': alias + ' (' + uname + ') has ' + direction + ' their ' + attr + ' by ' +
      str(req['change']) + ' to ' + str(req['amt']) + '.' + lvl_up, 'color': 'chocolate', 'type': 'chat',
      'weight': 'normal'}
    else:
      resp = {'msg': uname + ' has ' + direction + ' their ' + attr + ' by ' +
      str(req['change']) + ' to ' + str(req['amt']) + '.' + lvl_up,
      'color': 'chocolate', 'type': 'status', 'weight': 'normal'}
  elif req_type == 'change_text':
    # someone has added to textual attribute
    attr = mod_stats[(req['attr'])] if req['attr'] in mod_stats.keys() else req['attr']
    if room in r_u_char.keys() and uname in r_u_char[room].keys():
      # display alias if character has taken name 
      alias = r_u_char[room][uname]
      resp = {'msg': alias + ' (' + uname + ') has added ' + str(req['change']) + ' to their ' + attr + '.',
      'color': 'chocolate', 'type': 'status', 'weight': 'normal'}
    else:
      resp = {'msg': uname + ' has added ' + str(req['change']) + ' to their ' + attr + '.',
      'color': 'chocolate', 'type': 'status', 'weight': 'normal'}
  elif req_type == 'add_gem':
    # someone has added new gems
    if room in r_u_char.keys() and uname in r_u_char[room].keys():
      # display alias if character has taken name 
      alias = r_u_char[room][uname]
      resp = {'msg': alias + ' (' + uname + ') has added ' + str(req['change']) + ' ' + str(req['attr']) +
      ' to their inventory.', 'color': 'chocolate', 'type': 'status', 'weight': 'normal'}
    else:
      resp = {'msg': uname + ' has added ' + str(req['change']) + ' ' + str(req['attr']) +
      ' to their inventory.', 'color': 'chocolate', 'type': 'status', 'weight': 'normal'}
  elif req_type == 'add_item':
    # someone added either weapon, item, or spell
    if room in r_u_char.keys() and uname in r_u_char[room].keys():
      # display alias if character has taken name 
      alias = r_u_char[room][uname]
      resp = {'msg': alias + ' (' + uname + ') has added ' + str(req['name']) + ' to their ' + str(req['it_type']) +
      '.', 'color': 'chocolate', 'type': 'status', 'weight': 'normal'}
    else:
      resp = {'msg': uname + ' has added ' + str(req['name']) + ' to their ' + str(req['it_type']) +
      '.', 'color': 'chocolate', 'type': 'status', 'weight': 'normal'}
  elif req_type == 'change_cond':
    # someone has changed their condition
    if room in r_u_char.keys() and uname in r_u_char[room].keys():
      # display alias if character has taken name 
      alias = r_u_char[room][uname]
      resp = {'msg': alias + ' (' + uname + ') has changed their condition from ' + str(req['last']) + ' to ' + str(req['change']) +
      '.', 'color': 'chocolate', 'type': 'status', 'weight': 'normal'}
    else:
      resp = {'msg': uname + ' has changed their condition from ' + str(req['last']) + ' to ' + str(req['change']) +
      '.', 'color': 'chocolate', 'type': 'status', 'weight': 'normal'}
  elif req_type == 'get_blank':
    if isPlayer:
      # player asking for blank html form to fill out
      blank_form = get_sheet_form()
      resp = {'msg': blank_form, 'type': 'create_psheet'}
    else:
      raw = {
        'sheet_title' : '',
        'notes' : '',
        'monsters' : {},
        'encounter' : {
          'monsters': [],
          'turnorder': []
        }
      }
      blank_form = get_dm_sheet_form()
      resp = {'msg': blank_form, 'raw': raw, 'type': 'create_dmsheet'}
  elif req_type == 'load_sheets':
    # player asking for list of their sheets, get from DB
    #uid = session['u_token']
    uid = session['u_token']
    if isPlayer:
      all_sheets = dumps(mongo.db['psheets'].find({'uid': uid})) # store list of all sheets
    else:
      all_sheets = dumps(mongo.db['dmsheets'].find({'uid': uid}))
    resp = {'msg': all_sheets, 'type': 'sheet_list'}
  return (dumps(resp), dumps(join_resp)) # convert JSON to string for both


###############################################
# begin listening for different socket events #
###############################################

# on client sending socket message, process request and decide how to form response
@sockets.route('/play')
def chat_socket(ws):
  # while socket is open, process messages
  while not ws.closed:
    message = ws.receive()
    if message is None:  # message is "None" if the client has closed.
      continue
    # store name of sender
    uname = session.get('name')
    isPlayer = session.get('isPlayer')
    client_ip = request.environ['REMOTE_ADDR'] # store IP of client
    client_port = request.environ['REMOTE_PORT'] # store port of client
    msg = loads(message) # convert to dict
    # now process message dependent on type + room, clients
    if ws.handler.server.clients:
      clients = ws.handler.server.clients
    room = session.get('room')
    resp = decide_request(msg, uname, isPlayer, clients, room, client_ip, client_port)
    # check if broadcast or single event
    broadcast = True if msg['type'] not in single_events else False
    # send response to every one in sender's room if broadcast
    if broadcast:
      for client in r_to_client[room]:
        print("sending")
        print(resp[0])
        client.ws.send(resp[0])
    else:
      # otherwise only to sender of event
      curr = u_to_client[uname]
      print("sending")
      print(resp[0])
      curr.ws.send(resp[0])
      if msg['type'] == 'get_sheet':
        # special case, broadcast join message
        for client in r_to_client[room]:
          print("sending")
          print(resp[1])
          client.ws.send(resp[1])


@app.route('/')
def root():
    return render_template('login.html')

@app.route('/play')
def play():
    #print ('in play\n')
    room = session.get('room')
    name = session.get('name')
    isPlayer = session.get('isPlayer')
    return render_template('play.html', room=room, name=name, isPlayer=isPlayer)

# post to join room, store session data for user
# redirect them to play url
@app.route('/joinRoom', methods=['POST'])
def join_post():
  # first check, to make sure player is not joining as DM when DM already exists
  if request.form['isPlayer'] == 'DM':
    curr_room = request.form['rname']
    if curr_room in r_to_dm.keys():
      if r_to_dm[curr_room]:
        # if set, already DM, shouldn't allow
        return render_template('index.html', badDm=True)
    r_to_dm[curr_room] = True # otherwise room as DM now
  # store session info for use
  #session['name'] = request.form['uname']
  session['room'] = request.form['rname']
  session['isPlayer'] = True if request.form['isPlayer'] == "Player" else False
  return redirect(url_for('.play'), code=302)

# disabling caching by modifying headers of each response
@app.after_request
def add_header(resp):
  resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
  resp.headers['Pragma'] = 'no-cache'
  resp.headers['Expires'] = '0'
  return resp

@app.route('/create', methods=['POST'])
def create_account():
  try:
    user = auth.create_user_with_email_and_password(str(request.form['email']), str(request.form['password']))
    auth.send_email_verification(user['idToken'])
    email_strip = str(request.form['email']).replace('.', '')
    pb_username = str(request.form['username'])
    name = {email_strip: pb_username}
    mongo.db['unames'].insert_one(name)
    return redirect('/', code=302)
  except:
    return redirect('/static/taken.html', code=302)

@app.route('/login', methods=['POST'])
def login_account():
  try:
    user_acc = auth.sign_in_with_email_and_password(str(request.form['email']), str(request.form['password']))
    db= fb.database()
    session['u_token'] = str(request.form['email'])
    email_strip = str(request.form['email']).replace('.', '')
    user_name = list(mongo.db['unames'].find({}, {email_strip: 1}))
    e_key = user_name[0]
    session['name'] = e_key[email_strip]
    print(session['name'])
    return render_template('index.html', badDm=False)
  except:
    return redirect('/static/invalid.html', code=302)

@app.route('/login', methods=['GET'])
def return_index():
  # on a get, means returning to login
  return render_template('index.html', badDm=False)

def get_dm_sheet_form():
  doc, tag, text= Doc().tagtext()
  with tag('div', klass = 'row'):
    with tag('div', klass = 'col title'):
      text('~ Name Your DM Sheet ~')
  with tag('div', klass = 'row'):
    with tag('div', klass = 'col col-md-10'):
      doc.asis('<input type="text" id="dmtitle" placeholder="Title">')
    with tag('div', klass = 'col col-md-2 no-border'):
      with tag('div', klass = '.btn', id='tbtn'):
        text('Enter Title')
  with tag('div', klass = 'row', id='err'):
    text('')
  resp = doc.getvalue()
  return resp

# helper to build HTML for user creating new sheet
def get_sheet_form():
  doc, tag, text= Doc().tagtext()
  with tag('div', klass = 'row'):
    with tag('div', klass = 'col title'):
      text('~ Player Sheet Creation ~')
  with tag('div', klass = 'row'):
    with tag('div', klass = 'col title'):
      text('Name your Sheet: ')
      doc.asis('<input class="in create_p" id="ptitle" placeholder="Title">')
  with tag('div', klass = 'row'):
    with tag('div', klass = 'col namebox'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col title'):
          text('~ Character Info ~')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col namefields', id='name'):
          text('Enter Character Name: ')
          doc.asis('<input class="in create_p" id="pname" placeholder="Name">')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col namefields', id='class'):
          text('Class: ')
          doc.asis('<input class="in create_p" id="pclass" placeholder="Class">')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col namefields', id='race'):
          text('Race: ')
          doc.asis('<input class="in create_p" id="prace" placeholder="Race">')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col namefields', id='align'):
          text('Alignment: ')
          with tag('select', klass='sel create_p', id="palign"):
            with tag('option', value='lg'):
              text('Lawful Good')
            with tag('option', value='ng'):
              text('Neutral Good')
            with tag('option', value='cg'):
              text('Chaotic Good')
            with tag('option', value='ln'):
              text('Lawful Neutral')
            with tag('option', value='neu'):
              text('Neutral')
            with tag('option', value='cn'):
              text('Chaotic Neutral')
            with tag('option', value='le'):
              text('Lawful Evil')
            with tag('option', value='ne'):
              text('Neutral Evil')
            with tag('option', value='ce'):
              text('Chaotic Evil')
    with tag('div', klass = 'col levelbox'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col title'):
          text('~ Knowledge ~')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col levelfields', id='langs'):
          text('Languages: ')
          doc.asis('<button class="btn add_text add_com" id="add_lang">Add</button>')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col levelfields', id='condenhan'):
          text('Conditions & Enchantments: ')
          doc.asis('<button class="btn add_text add_com" id="add_cond">Add</button>')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col levelfields', id='resist'):
          text('Resistances: ')
          doc.asis('<button class="btn add_text add_com" id="add_resist">Add</button>')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col levelfields', id='specs'):
          text('Special Skills & Abilities: ')
          doc.asis('<button class="btn add_text add_com" id="add_spec">Add</button>')
  with tag('div', klass = 'row'):
    with tag('div', klass = 'col attrbox'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col title'):
          text('~ Ability Scores ~')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col str', id='str'):
          text('Strength: ')
          doc.asis('<input class="in create_p attr" id="pstr" placeholder="Strength">')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col dex', id='dex'):
          text('Dexterity: ')
          doc.asis('<input class="in create_p attr" id="pdex" placeholder="Dexterity">')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col const', id='const'):
          text('Constitution: ')
          doc.asis('<input class="in create_p attr" id="pconst" placeholder="Constitution">')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col intell', id='intell'):
          text('Intelligence: ')
          doc.asis('<input class="in create_p attr" id="pintell" placeholder="Intelligence">')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col wis', id='wis'):
          text('Wisdom: ')
          doc.asis('<input class="in create_p attr" id="pwis" placeholder="Wisdom">')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col char', id='char'):
          text('Charisma: ')
          doc.asis('<input class="in create_p attr" id="pchar" placeholder="Charisma">')
    with tag('div', klass = 'col statbox'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col title'):
          text('~ Stats ~')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col hp', id='hp'):
          text("Hit Points: ")
          doc.asis('<input class="in create_p attr" id="php" placeholder="Hit Points">')
  with tag('div', klass = 'row'):
    with tag('div', klass = 'col wepbox', id='weps'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col title', id='show_wep'):
          text('~ Weapons ~')
        with tag('div', klass = 'col title', id='show_spell'):
          text('~ Spells ~ (click to view)')
      with tag('div', id='shown', klass='pweps'):
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col wepfields'):
            text('Weapon')
          with tag('div', klass = 'col wepfields'):
            text('To Hit')
          with tag('div', klass = 'col wepfields'):
            text('Damage')
          with tag('div', klass = 'col wepfields'):
            text('Range')
          with tag('div', klass = 'col wepfields'):
            text('Notes')
        with tag('div', klass = 'row', id="wep_but"):
          # use element above to insert new weps
          with tag('div', klass = 'col wepfields title'):
            doc.asis('<button class="btn add_text add_table" id="add_wep">Add</button>')
      with tag('div', id='hidden', klass='pspells'):
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col spellfields'):
            text('Level')
          with tag('div', klass = 'col spellfields'):
            text('Spell')
          with tag('div', klass = 'col spellfields'):
            text('Cast Time')
          with tag('div', klass = 'col spellfields'):
            text('Range')
          with tag('div', klass = 'col spellfields'):
            text('Components + Duration')
          with tag('div', klass = 'col spellfields'):
            text('Attack/Save + Effect')
        with tag('div', klass = 'row', id="spell_but"):
          # use element above to insert new spells
          with tag('div', klass = 'col spellfields title'):
              doc.asis('<button class="btn add_text add_table" id="add_spell">Add</button>')
  with tag('div', klass = 'row'):
    with tag('div', klass = 'col itembox'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col title'):
          text('~ Items ~')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col itemfields'):
          text('Name')
        with tag('div', klass = 'col itemfields'):
          text('Weight')
        with tag('div', klass = 'col itemfields'):
          text('Notes')
      with tag('div', klass = 'row', id="item_but"):
        # use element above to insert new items
        with tag('div', klass = 'col itemfields title'):
          doc.asis('<button class="btn add_text add_table" id="add_item">Add</button>')
    with tag('div', klass = 'col treasbox'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col title'):
          text('~ Treasures ~')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col'):
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col treasfields', id='pp'):
              text('PP: ')
              doc.asis('<input class="in create_p attr" id="ppp" placeholder="PP">')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col treasfields', id='gp'):
              text('GP: ')
              doc.asis('<input class="in create_p attr" id="pgp" placeholder="GP">')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col treasfields', id='ep'):
              text('EP: ')
              doc.asis('<input class="in create_p attr" id="pep" placeholder="EP">')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col treasfields', id='sp'):
              text('SP: ')
              doc.asis('<input class="in create_p attr" id="psp" placeholder="SP">')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col treasfields', id='cp'):
              text('CP: ')
              doc.asis('<input class="in create_p attr" id="pcp" placeholder="CP">')
        with tag('div', klass ='col', id='gems'):
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col title'):
              text('~ Gems ~')
          with tag('div', klass = 'row', id="gem_but"):
            # use element above to insert new gems
            with tag('div', klass = 'col treasfields title'):
              doc.asis('<button class="btn add_text new_gem" id="add_gem">Add</button>')
  with tag('div', klass = 'row'):
    with tag('div', klass = 'col condbox'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col title'):
          text('~ Condition/Speed ~')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col condfields', id='base_speed'):
          text("Base Speed: ")
          doc.asis('<input class="in create_p attr" id="pbase" placeholder="Base Speed">')
        with tag('div', klass = 'col condfields', id='curr_speed'):
          text("Current Speed: ")
          doc.asis('<input class="in create_p attr" id="pcurr" placeholder="Current Speed">')
  with tag('div', klass='row'):
    with tag('div', klass = 'col submitbox title'):
      doc.asis('<button class="btn but_sheet" id="sub_sheet">Create Sheet</button>')
  resp = doc.getvalue()
  return resp

# helper to form sheet for player based on uname and room, can be either psheet or DM, retrieves from DB
# turns into proper HTML format
def get_player_stats(uname, isPlayer, room, raw_resp):
  # use passed in JSON to build HTML
  if isPlayer:
    print('Im a player') # DEBUG
    doc, tag, text = Doc().tagtext()
    with tag('div', klass = 'row'):
      with tag('div', klass = 'col title'):
        text('~ Player Sheet ~')
    with tag('div', klass = 'row'):
      with tag('div', klass = 'col title'):
        text(raw_resp['sheet_title'])
    with tag('div', klass = 'row'):
      with tag('div', klass = 'col title showbox', id='show_info'):
        text('Character/Level Info')
      with tag('div', klass = 'col title showbox', id='show_stats'):
        text('Stats (click to view)')
      with tag('div', klass = 'col title showbox', id='show_ws'):
        text('Weapons/Spells (click to view)')
      with tag('div', klass = 'col title showbox', id='show_items'):
        text('Items & Condition (click to view)')
    with tag('div', id='shown', klass='pinfo'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col namebox'):
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col title'):
              text('~ Character Info ~')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col namefields', id='name'):
              text('Name: ' + raw_resp['name'])
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col namefields', id='class'):
              text('Class: ' + raw_resp['class'])
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col namefields', id='race'):
              text('Race: ' + raw_resp['race'])
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col namefields', id='align'):
              text('Alignment: ' + align_abbrev[(raw_resp['align'])])
        with tag('div', klass = 'col levelbox'):
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col title'):
              text('~ Level/XP ~')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col levelfields', id='level'):
              text('Level: ' + str(raw_resp['level']))
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col levelfields', id='xp'):
              text('Experience Points: ' + str(raw_resp['xp']))
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col levelfields', id='next_xp'):
              text('Next Level Exp: ' + level_to_xp[(int(raw_resp['level']) + 1)])
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col levelfields', id='langs'):
              if 'languages' in raw_resp.keys():
                text('Languages: ' + (', ').join(raw_resp['languages']))
              else:
                text('Languages: ')
              doc.asis('<button class="btn add_text add_com" id="add_lang">Add</button>')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col levelfields', id='condenhan'):
              if 'enhan' in raw_resp.keys():
                text('Conditions & Enchantments: ' + (', ').join(raw_resp['enhan']))
              else:
                text('Conditions & Enchantments: ')
              doc.asis('<button class="btn add_text add_com" id="add_cond">Add</button>')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col levelfields', id='resist'):
              if 'resist' in raw_resp.keys():
                text('Resistances: ' + (', ').join(raw_resp['resist']))
              else:
                text('Resistances: ')
              doc.asis('<button class="btn add_text add_com" id="add_resist">Add</button>')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col levelfields', id='specs'):
              if 'specs' in raw_resp.keys():
                text('Special Skills & Abilities: ' + (', ').join(raw_resp['special']))
              else:
                text('Special Skills & Abilities: ')
              doc.asis('<button class="btn add_text add_com" id="add_spec">Add</button>')
    with tag('div', id='hidden', klass='pstats'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col attrbox'):
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col title'):
              text('~ Ability Scores ~')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col str', id='str'):
              text(str(raw_resp['ability-scores']['str']) + ' Strength')
            with tag('div', klass = 'col str', id='str_mod'):
              text(str(modifier(raw_resp['ability-scores']['str'])) + ' Modifier')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col dex', id='dex'):
              text(str(raw_resp['ability-scores']['dex']) + ' Dexterity')
            with tag('div', klass = 'col str', id='dex_mod'):
              text(str(modifier(raw_resp['ability-scores']['dex'])) + ' Modifier')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col const', id='const'):
              text(str(raw_resp['ability-scores']['const']) + ' Constitution')
            with tag('div', klass = 'col str', id='const_mod'):
              text(str(modifier(raw_resp['ability-scores']['const'])) + ' Modifier')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col intell', id='intell'):
              text(str(raw_resp['ability-scores']['intell']) + ' Intelligence')
            with tag('div', klass = 'col str', id='intell_mod'):
              text(str(modifier(raw_resp['ability-scores']['intell'])) + ' Modifier')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col wis', id='wis'):
              text(str(raw_resp['ability-scores']['wis']) + ' Wisdom')
            with tag('div', klass = 'col str', id='wis_mod'):
              text(str(modifier(raw_resp['ability-scores']['wis'])) + ' Modifier')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col char', id='char'):
              text(str(raw_resp['ability-scores']['char']) + ' Charisma')
            with tag('div', klass = 'col str', id='char_mod'):
              text(str(modifier(raw_resp['ability-scores']['char'])) + ' Modifier')
        with tag('div', klass = 'col statbox'):
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col title'):
              text('~ Stats ~')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col armor', id='armor'):
              # armor = dex modifier + 10
              text(str(modifier(raw_resp['ability-scores']['dex']) + 10) + " Armor Class")
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col hp', id='hp'):
              text(str(raw_resp['hp']) + " Hit Points")
    with tag('div', id='hidden', klass='pws'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col wepbox', id='weps'):
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col title'):
              text('~ Weapons ~')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col wepfields'):
              text('Weapon')
            with tag('div', klass = 'col wepfields'):
              text('To Hit')
            with tag('div', klass = 'col wepfields'):
              text('Damage')
            with tag('div', klass = 'col wepfields'):
              text('Range')
            with tag('div', klass = 'col wepfields'):
              text('Notes')
          if 'weps' in raw_resp.keys():
            for weapon in raw_resp['weps']:
              with tag('div', klass = 'row'):
                with tag('div', klass = 'col wepfields'):
                  text(weapon['name'])
                with tag('div', klass = 'col wepfields'):
                  text(weapon['to_hit'])
                with tag('div', klass = 'col wepfields'):
                  text(weapon['damage'])
                with tag('div', klass = 'col wepfields'):
                  text(weapon['range'])
                with tag('div', klass = 'col wepfields'):
                  text(weapon['notes'])
          with tag('div', klass = 'row', id="wep_but"):
            # use element above to insert new weps
            with tag('div', klass = 'col wepfields title'):
              doc.asis('<button class="btn add_text add_table" id="add_wep">Add</button>')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col title'):
              text('~ Spells ~')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col spellfields'):
              text('Level')
            with tag('div', klass = 'col spellfields'):
              text('Spell')
            with tag('div', klass = 'col spellfields'):
              text('Cast Time')
            with tag('div', klass = 'col spellfields'):
              text('Range')
            with tag('div', klass = 'col spellfields'):
              text('Components + Duration')
            with tag('div', klass = 'col spellfields'):
              text('Attack/Save + Effect')
          if 'spells' in raw_resp.keys():
            for spell in raw_resp['spells']:
              with tag('div', klass = 'row'):
                with tag('div', klass = 'col spellfields'):
                  text(spell['level'])
                with tag('div', klass = 'col spellfields'):
                  text(spell['name'])
                with tag('div', klass = 'col spellfields'):
                  text(spell['time'])
                with tag('div', klass = 'col spellfields'):
                  text(spell['range'])
                with tag('div', klass = 'col spellfields'):
                  text(spell['components'] + ';')
                  doc.stag('br')
                  text(spell['duration'])
                with tag('div', klass = 'col spellfields'):
                  text(spell['attack'] + ';')
                  doc.stag('br')
                  text(spell['damage'])
          with tag('div', klass = 'row', id="spell_but"):
            # use element above to insert new spells
            with tag('div', klass = 'col spellfields title'):
                doc.asis('<button class="btn add_text add_table" id="add_spell">Add</button>')
    with tag('div', id='hidden', klass='pitems'):
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col itembox'):
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col title'):
              text('~ Items ~')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col itemfields'):
              text('Name')
            with tag('div', klass = 'col itemfields'):
              text('Weight')
            with tag('div', klass = 'col itemfields'):
              text('Notes')
          if 'items' in raw_resp.keys():
            for item in raw_resp['items']:
              with tag('div', klass = 'row'):
                with tag('div', klass = 'col itemfields'):
                  text(item['name'])
                with tag('div', klass = 'col itemfields'):
                  text(item['weight'])
                with tag('div', klass = 'col itemfields'):
                  text(item['notes'])
          with tag('div', klass = 'row', id="item_but"):
            # use element above to insert new items
            with tag('div', klass = 'col itemfields title'):
              doc.asis('<button class="btn add_text add_table" id="add_item">Add</button>')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col itemfields'):
              text('Total Weight Carried: ')
            with tag('div', klass = 'col itemfields', id='weight_total'):
              if 'items' in raw_resp.keys():
                text(sum(int(item['weight']) for item in raw_resp['items']))
              else:
                text('0')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col itemfields'):
              text('Max Carry Weight: ')
            with tag('div', klass = 'col itemfields', id='max_weight'):
              text((int(raw_resp['ability-scores']['str']) * 15))
        with tag('div', klass = 'col treasbox'):
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col title'):
              text('~ Treasures ~')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col'):
              with tag('div', klass = 'row'):
                with tag('div', klass = 'col treasfields', id='pp'):
                  text('PP: ' + str(raw_resp['treasures']['pp']))
              with tag('div', klass = 'row'):
                with tag('div', klass = 'col treasfields', id='gp'):
                  text('GP: ' + str(raw_resp['treasures']['gp']))
              with tag('div', klass = 'row'):
                with tag('div', klass = 'col treasfields', id='ep'):
                  text('EP: ' + str(raw_resp['treasures']['ep']))
              with tag('div', klass = 'row'):
                with tag('div', klass = 'col treasfields', id='sp'):
                  text('SP: ' + str(raw_resp['treasures']['sp']))
              with tag('div', klass = 'row'):
                with tag('div', klass = 'col treasfields', id='cp'):
                  text('CP: ' + str(raw_resp['treasures']['cp']))
            with tag('div', klass ='col', id='gems'):
              with tag('div', klass = 'row'):
                with tag('div', klass = 'col title'):
                  text('~ Gems ~')
              if 'gems' in raw_resp['treasures'].keys():
                for gem in raw_resp['treasures']['gems']:
                  with tag('div', klass ='row'):
                    with tag('div', klass = 'col treasfields', id=gem['name']):
                      text(gem['name'] + ": " + str(gem['num']))
              with tag('div', klass = 'row', id="gem_but"):
                # use element above to insert new gems
                with tag('div', klass = 'col treasfields title'):
                  doc.asis('<button class="btn add_text new_gem" id="add_gem">Add</button>')
      with tag('div', klass = 'row'):
        with tag('div', klass = 'col condbox'):
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col title'):
              text('~ Condition/Speed ~')
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col condfields', id='base_speed'):
              text("Base Speed: " + str(raw_resp['base_speed']))
            with tag('div', klass = 'col condfields', id='curr_speed'):
              text("Current Speed: " + str(raw_resp['curr_speed']))
            with tag('div', klass = 'col condfields', id='cond'):
              with tag('span', id='cond_text'):
                text("Current Condition: " + raw_resp['condition'])
              doc.asis('<button class="btn add_text change" id="change_cond">Change</button>')

  else:
    #fake response and probably wont have the same parameters as a real one

    # use dict to build HTML using library
    doc, tag, text = Doc().tagtext()
    with tag('div', klass = 'row'):
      with tag('div', klass = 'col title'):
        text(' ~ DM Sheet ~ ')
    with tag('div', klass = 'row'):
      with tag('div', klass = 'col dmbutton', id='encounter'):
        text('Encounter')
      with tag('div', klass = 'col dmbutton', id='monster'):
        text('Monsters')
      with tag('div', klass = 'col dmbutton', id='notes'):
        text('Notes')
    with tag('div', klass = 'row dmcontent'):
      with tag('div', klass = 'col dmnotes', id='shown'):
        with tag('div', klass='row row-no-gutters'):
          with tag('div', klass = 'col col-md-12'):
            with tag('textarea', placeholder='Notes for campaign go here...', id='dmtextarea'):
              text(raw_resp['notes'])
      with tag('div', klass = 'col dmmonster', id='hidden'):
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col-md-4'):
            with tag('div', klass = 'row'):
              with tag('div', klass = 'col', id='newmonsterbtn'):
                text('New Monster')
              with tag('div', klass = 'col', id='addmonsterbtn'):
                text('Add Monster')
            with tag('div', klass = 'row'):
              with tag('div', klass = 'col dmmonsterlist'):
                with tag('div', klass='row'):
                  with tag('div', klass='col'):
                    text('Monster List')
                with tag('div', klass='row'):
                  with tag('div', klass='col no-border', id='mmonsterlist'):
                    for monster, monsterinfo in raw_resp['monsters'].items():
                      with tag('div', klass = 'col'):
                        text(monster)
                        #dont need this now that we are storing the raw_sheet in js
                        #with tag('div', klass='json'+monster['type'] ,id='hidden'):
                          #text(str(monster))
          with tag('div', klass = 'col no-border col-md-8 dmmonsteredit'):
            with tag('div', klass = 'row row-no-gutters'):
              with tag('div', klass = 'col col-md-7', id = 'monstername'):
                text('Monster Name: ')
                doc.asis('<input type="text" name="name" class="newMonsterTextField" placeholder="Monster Name" value="">');
              with tag('div', klass = 'col col-md-5', id = 'size'):
                text('Size: ')
                doc.asis('<input type="text" name="size" class="newMonsterTextField" placeholder="Size" value="">');
            with tag('div', klass = 'row row-no-gutters'):
              with tag('div', klass = 'col col-md-8', id = 'type'):
                text('Type: ')
                doc.asis('<input type="text" name="type" class="newMonsterTextField" placeholder="Monster Type" value="">')
              with tag('div', klass = 'col col-md-4', id = 'rating'):
                text('Rating: ')
                doc.asis('<input type="text" name="c_rating" class="newMonsterTextField" value="">')
            with tag('div', klass = 'row row-no-gutters'):
              with tag('div', klass = 'col col-md-4' , id='ac'):
                text('AC: ')
                doc.asis('<input type="text" name="ac" class="newMonsterTextField" placeholder="AC" value="">')
              with tag('div', klass = 'col col-md-4', id='health'):
                text('Health: ')
                doc.asis('<input type="text" name="hp" class="newMonsterTextField" placeholder="Avg. HP" value="">')
              with tag('div', klass = 'col col-md-4', id='hit_dice'):
                text('Hit Dice: ')
                doc.asis('<input type="text" name="hdnumber" class="newMonsterHD" value="">')
                text('d')
                doc.asis('<input type="text" name="hdvalue" class="newMonsterHD" value="">')
            with tag('div', klass = 'row row-no-gutters'):
              with tag('div', klass = 'col col-md-8', id = 'alignment'):
                text('Alignment: ')
                doc.asis('<input type="text" name="alignment" class="newMonsterTextField" placeholder="Alignment" value="">');
              with tag('div', klass = 'col col-md-4', id = 'speed'):
                text('Speed: ')
                doc.asis('<input type="text" name="speed" class="newMonsterTextField" placeholder="Speed" value="">')
            with tag('div', klass = 'row row-no-gutters'):
              with tag('div', klass = 'col'):
                with tag('div', klass = 'row'):
                  with tag('div', klass = 'col col-md-4', id = 'asbtn'):
                    text('Ability Scores~')
                  with tag('div', klass = 'col col-md-5', id = 'tsbtn'):
                    text('Throws/Skills')
                  with tag('div', klass = 'col col-md-3', id='assBtn'):
                    text('show')
                with tag('div', klass = 'row row-no-gutters assSec', style='display: none'):
                  with tag('div', klass = 'col aswin', id = 'shown'):
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col col-md-8', id = 'ability-scores-str'):
                        text('Str: ')
                        doc.asis('<input type="text" name="str" class="newMonsterTextField" placeholder="Strength Stat" value="">')
                      with tag('div', klass = 'col col-md-4', id = 'ability-scores-str-mod'):
                        text('Mod: ')
                        doc.asis('<input type="text" name="str-mod" class="newMonsterTextField" placeholder="Strength Modifier" value="" readonly>')
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col col-md-8', id = 'ability-scores-dex'):
                        text('Dex: ')
                        doc.asis('<input type="text" name="dex" class="newMonsterTextField" placeholder="Dexterity Stat" value="">')
                      with tag('div', klass = 'col col-md-4', id = 'ability-scores-dex-mod'):
                        text('Mod: ')
                        doc.asis('<input type="text" name="dex-mod" class="newMonsterTextField" placeholder="Dexterity Modifier" value="" readonly>')
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col col-md-8', id = 'ability-scores-const'):
                        text('Con: ')
                        doc.asis('<input type="text" name="const" class="newMonsterTextField" placeholder="Constitution Stat" value="">')
                      with tag('div', klass = 'col col-md-4', id = 'ability-scores-const-mod'):
                        text('Mod: ')
                        doc.asis('<input type="text" name="const-mod" class="newMonsterTextField" placeholder="Constitution Modifier" value="" readonly>')
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col col-md-8', id = 'ability-scores-intell'):
                        text('Int: ')
                        doc.asis('<input type="text" name="intell" class="newMonsterTextField" placeholder="Intelligence Stat" value="">')
                      with tag('div', klass = 'col col-md-4', id = 'ability-scores-intell-mod'):
                        text('Mod: ')
                        doc.asis('<input type="text" name="intell-mod" class="newMonsterTextField" placeholder="Intelligence Modifier" value="" readonly>')
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col col-md-8', id = 'ability-scores-wis'):
                        text('Wis: ')
                        doc.asis('<input type="text" name="wis" class="newMonsterTextField" placeholder="Wisdom Stat" value="">')
                      with tag('div', klass = 'col col-md-4', id = 'ability-scores-wis-mod'):
                        text('Mod: ')
                        doc.asis('<input type="text" name="wis-mod" class="newMonsterTextField" placeholder="Wisdom Modifier" value="" readonly>')
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col col-md-8', id = 'ability-scores-char'):
                        text('Cha: ')
                        doc.asis('<input type="text" name="char" class="newMonsterTextField" placeholder="Charisma Stat" value="">')
                      with tag('div', klass = 'col col-md-4', id = 'ability-scores-char-mod'):
                        text('Mod: ')
                        doc.asis('<input type="text" name="char-mod" class="newMonsterTextField" placeholder="Charisma Modifier" value="" readonly>')
                  with tag('div', klass = 'col tswin', id = 'hidden'):
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col col-md-4', id='throws'):
                        with tag('div', klass = 'row'):
                          with tag('div', klass = 'col', id = 'throws-str'):
                            text('Str: ')
                            doc.asis('<input type="text" name="throw-str" class="newMonsterTextField" value="">')
                        with tag('div', klass = 'row'):
                          with tag('div', klass = 'col', id = 'throws-dex'):
                            text('Dex: ')
                            doc.asis('<input type="text" name="throw-dex" class="newMonsterTextField" value="">')
                        with tag('div', klass = 'row'):
                          with tag('div', klass = 'col', id = 'throws-const'):
                            text('Con: ')
                            doc.asis('<input type="text" name="throw-const" class="newMonsterTextField" value="">')
                        with tag('div', klass = 'row'):
                          with tag('div', klass = 'col', id = 'throws-intell'):
                            text('Int: ')
                            doc.asis('<input type="text" name="throw-intell" class="newMonsterTextField" value="">')
                        with tag('div', klass = 'row'):
                          with tag('div', klass = 'col', id = 'throws-wis'):
                            text('Wis: ')
                            doc.asis('<input type="text" name="throw-wis" class="newMonsterTextField" value="">')
                        with tag('div', klass = 'row'):
                          with tag('div', klass = 'col', id = 'throws-char'):
                            text('Cha: ')
                            doc.asis('<input type="text" name="throw-char" class="newMonsterTextField" value="">')
                      with tag('div', klass = 'col col-md-8', id='skills'):
                        with tag('div', klass = 'row'):
                          with tag('div', klass = 'col no-border', id='skillList'):
                            text('Skills:')
                        with tag('div', klass = 'row', id='newSkillRow'):
                          with tag('div', klass = 'col col-md-6', id='skillName'):
                            text('Name: ')
                            doc.asis('<input type="text" name="newSkillName" class="newMonsterTextField" placeholder="Name" value="">')
                          with tag('div', klass = 'col col-md-6', id='skillValue'):
                            text('Value: ')
                            doc.asis('<input type="text" name="newSkillValue" class="newMonsterTextField" placeholder="Value" value="">')
                        with tag('div', klass = 'row'):
                          with tag('div', klass = 'col', id='addSkill'):
                            text('Add Skill')
        #senses languages and traits section
            with tag('div', klass = 'row row-no-gutters'):
              with tag('div', klass = 'col'):
                with tag('div', klass = 'row'):
                  with tag('div', klass = 'col col-md-3', id = 'sensebtn'):
                    text('Senses~')
                  with tag('div', klass = 'col col-md-3', id = 'langbtn'):
                    text('Lang')
                  with tag('div', klass = 'col col-md-3', id = 'traitbtn'):
                    text('Traits')
                  with tag('div', klass = 'col col-md-3', id='sltBtn'):
                    text('show')
                with tag('div', klass = 'row row-no-gutters sltSec', style='display: none'):
                  with tag('div', klass = 'col senseswin', id = 'shown'):
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col no-border', id='senseList'):
                        text('Senses:')
                    with tag('div', klass = 'row', id='newSenseRow'):
                      with tag('div', klass = 'col col-md-6', id='senseName'):
                        text('Name: ')
                        doc.asis('<input type="text" name="newSenseName" class="newMonsterTextField" placeholder="Name" value="">')
                      with tag('div', klass = 'col col-md-6', id='senseValue'):
                        text('Value: ')
                        doc.asis('<input type="text" name="newSenseValue" class="newMonsterTextField" placeholder="Value" value="">')
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col', id='addSense'):
                        text('Add Sense')
                  with tag('div', klass = 'col langwin', id = 'hidden'):
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col no-border', id='langList'):
                        text('Languages:')
                    with tag('div', klass = 'row', id='newLangRow'):
                      with tag('div', klass = 'col col-md-8', id='langName'):
                        text('Lang: ')
                        doc.asis('<input type="text" name="newLangName" class="newMonsterTextField" placeholder="Name" value="">')
                      with tag('div', klass = 'col col-md-2', id='langS'):
                        text('S: ')
                        doc.asis('<input type="text" name="newLangS" class="newMonsterTextField" placeholder="Y/N" value="">')
                      with tag('div', klass = 'col col-md-2', id='langU'):
                        text('U: ')
                        doc.asis('<input type="text" name="newLangU" class="newMonsterTextField" placeholder="Y/N" value="">')
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col', id='addLang'):
                        text('Add Language')
                  with tag('div', klass = 'col traitwin', id = 'hidden'):
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col no-border', id='traitList'):
                        text('Traits:')
                    with tag('div', klass = 'row', id='newSenseRow'):
                      with tag('div', klass = 'col col-md-6', id='traitName'):
                        text('Trait: ')
                        doc.asis('<input type="text" name="newTraitName" class="newMonsterTextField" placeholder="Trait" value="">')
                      with tag('div', klass = 'col col-md-6', id='traitDesc'):
                        text('Desc: ')
                        doc.asis('<textarea name="newTraitDesc" class="newMonsterTextArea" placeholder="Description of trait..."></textarea>')
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col', id='addTrait'):
                        text('Add Trait')
        #actions reactions and legendary actions
            with tag('div', klass = 'row row-no-gutters'):
              with tag('div', klass = 'col'):
                with tag('div', klass = 'row'):
                  with tag('div', klass = 'col col-md-3', id = 'actionbtn'):
                    text('Actions~')
                  with tag('div', klass = 'col col-md-3', id = 'reactionbtn'):
                    text('Reactions')
                  with tag('div', klass = 'col col-md-3', id = 'legendbtn'):
                    text('Legend')
                  with tag('div', klass = 'col col-md-3', id='arlBtn'):
                    text('show')
                with tag('div', klass = 'row row-no-gutters arlSec', style='display: none'):
                  with tag('div', klass = 'col actionswin', id = 'shown'):
                    text('Actions')
                  with tag('div', klass = 'col reactionwin', id = 'hidden'):
                    text('Reactions')
                  with tag('div', klass = 'col legendwin', id = 'hidden'):
                    text('Legendary Actions')
        #resistances immunities and vulnerabilities
            with tag('div', klass = 'row row-no-gutters'):
              with tag('div', klass = 'col'):
                with tag('div', klass = 'row'):
                  with tag('div', klass = 'col col-md-3', id = 'resistbtn'):
                    text('Resist~')
                  with tag('div', klass = 'col col-md-3', id = 'immunebtn'):
                    text('Immune')
                  with tag('div', klass = 'col col-md-3', id = 'vulnerbtn'):
                    text('Vulner')
                  with tag('div', klass = 'col col-md-3', id='rivBtn'):
                    text('show')
                with tag('div', klass = 'row row-no-gutters rivSec', style='display: none'):
                  with tag('div', klass = 'col resistwin', id = 'shown'):
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col no-border', id='resistList'):
                        text('Resistances:')
                    with tag('div', klass = 'row', id='newResistRow'):
                      with tag('div', klass = 'col col-md-12', id='resistName'):
                        text('New Resistance: ')
                        doc.asis('<input type="text" name="newResistName" class="newMonsterTextField" placeholder="Resistance" value="">')
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col', id='addResist'):
                        text('Add Resist')
                  with tag('div', klass = 'col immunewin', id = 'hidden'):
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col no-border', id='immuneList'):
                        text('Immunities:')
                    with tag('div', klass = 'row', id='newImmuneRow'):
                      with tag('div', klass = 'col col-md-12', id='immuneName'):
                        text('New Immunity: ')
                        doc.asis('<input type="text" name="newImmuneName" class="newMonsterTextField" placeholder="Immunity" value="">')
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col', id='addImmune'):
                        text('Add Immunity')
                  with tag('div', klass = 'col vulnerwin', id = 'hidden'):
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col no-border', id='vulnerList'):
                        text('Vulnerabilities:')
                    with tag('div', klass = 'row', id='newVulnerRow'):
                      with tag('div', klass = 'col col-md-12', id='vulnerName'):
                        text('New Vulnerability: ')
                        doc.asis('<input type="text" name="newVulnerName" class="newMonsterTextField" placeholder="Vulnerability" value="">')
                    with tag('div', klass = 'row'):
                      with tag('div', klass = 'col', id='addVulner'):
                        text('Add Vulnerability')
      #end dm edit
      with tag('div', klass = 'col dmencounter', id='hidden'):
        with tag('div', klass = 'col col-xs-4 col-sm-4 col-md-4 dmmonsterlist'):
          with tag('div', klass='row'):
            with tag('div', klass='col'):
              text('Monster List')
          with tag('div', klass='row'):
            with tag('div', klass='col', id='emonsterlist'):
              for monster, monsterinfo in raw_resp['monsters'].items():
                with tag('div', klass = 'col'):
                  text(monster)
                  #dont need this now that we are storing the raw_sheet in js
                  #with tag('div', klass='json'+monster['type'] ,id='hidden'):
                    #text(str(monster))
        with tag('div', klass = 'col-xs-8 col-sm-8 col-md-8 dmencountercontent'):
          with tag('div', klass = 'col dmturnorder'):
            text('turn order stuff here')
          with tag('div', klass = 'col', id='dmmonsterinfo'):
            text('specific enemy info here')

  resp = doc.getvalue()
  print('returning from get_stats')
  return raw_resp, resp # return both JSON and HTML for sending to JS

if __name__ == '__main__':
  print("""
  This can not be run directly because the Flask development server does not
  support web sockets. Instead, use gunicorn:

  gunicorn -b 127.0.0.1:8080 -k flask_sockets.worker main:app

  """)
