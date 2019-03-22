from flask import Flask, url_for, redirect, render_template, request, abort
from flask import session, jsonify
from flask_sockets import Sockets
import random
import json
from yattag import Doc
import pyrebase
from google.cloud import firestore
from google.oauth2 import service_account

app = Flask(__name__)
app.config['SECRET_KEY'] = 'memeslol'

# firebase config (ONLY USED FOR AUTHENTICATION)
config = {
  "apiKey": "AIzaSyBwe2Fqvm4b39l654KUBwLfFf8wBSblLOM",
  "authDomain": "dndonline.firebaseapp.com",
  "databaseURL": "https://dndonline.firebaseio.com",
  "storageBucket": "dndonline.appspot.com",
  "serviceAccount": "./creds/dndonline-firebase-adminsdk-pjy9q-183230226d.json"
}
fb = pyrebase.initialize_app(config) # initialize firebase connection
auth = fb.auth()
creds = service_account.Credentials.from_service_account_file(
    './creds/CS1520Public-e5fe60f3af3f.json')
db = firestore.Client(project='dndonline', credentials=creds)

sockets = Sockets(app)             # create socket listener
u_to_client = {}                  # map users to Client object
r_to_client = {}                # map room to list of Clients connected`(uses Object from gevent API)
last_client = []            # use to store previous clients list, compare to track clients
single_events = ['get_sheet'] # track events where should only be sent to sender of event, i.e. not broadcast
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
  'none' : 'None',
  'str' : 'Strength',
  'const' : 'Constitution',
  'dex' : 'Dexterity',
  'intell' : 'Intelligence',
  'wis' : 'Wisdom',
  'char' : 'Charisma',
  'hp': 'Hit Points',
  'xp': 'Experience Points',
  'hero': 'Heroics',
  'curr_speed': 'Current Speed',
  'pp': 'PP',
  'gp': 'GP',
  'ep': 'EP',
  'sp': 'SP',
  'cp': 'CP'
}

# helper to roll dice, takes dice type and adv/disadv attributes
def roll_dice(size, mod, mod_v, adv, dis, uname):
  mod_val = modifier(mod_v)
  mod_msg = ('</br>' + '(modifier): ' + mod_stats[mod] + ' +' + str(mod_val)) if mod != 'none' else ''
  r1 = random.randint(1, size)
  if (adv != dis):
    # if distinct values, means rolled 2 dice
    r2 = random.randint(1, size)
    msg = ('(d' + str(size) + '): ' + uname + ' rolled ' + str(r1) + ' and ' + str(r2) +
    ' with ' + ('advantage' if adv else 'disadvantage') + ': use roll '
    + (str(max(r1, r2)) if adv else str(min(r1, r2))) + mod_msg)
  else:
    # just 1 roll
    msg = '(d' + str(size) + '): ' + uname + ' rolled a ' + str(r1) + mod_msg
  return msg

def modifier(mod_value):
  return (int(mod_value)-10) // 2

# helper for when new client enters room, store new Client object, map uname to Client object for removal
def add_client(clients, room, uname):
  # take set difference of new list of clients and old
  # difference should be one new client added
  global last_client
  global r_to_client
  global u_to_client
  new_client = list(set(clients) - set(last_client))
  if room not in r_to_client.keys():
    r_to_client[room] = []  # if empty, create new list
  r_to_client[room].append(new_client[0]) # append first element in collection, new client
  u_to_client[uname] = new_client[0]      # store Client for user
  last_client = clients # save new client list

# helper from when client leaves room, remove Client entry for uname and from room list
# update client list
def remove_client(uname, room):
  global last_client
  global r_to_client
  global u_to_client
  to_rem = u_to_client.pop(uname) # remove leaving client's entry and get val
  if to_rem in r_to_client[room]:
    r_to_client[room].remove(to_rem)
  if to_rem in last_client:
    last_client.remove(to_rem)  # client gone

# helper to form sheet for player based on uname and room, can be either psheet or DM, retrieves from DB
# turns into proper HTML format
def get_player_stats(uname, isPlayer, room):
  # build a dict of response stats (HARD CODED FOR TESTING)
  if isPlayer:
    raw_resp = {
      'sheet_title': 'Test Sheet',
      'name': 'Mikey',
      'class': 'Necromancer',
      'race': 'Dark Elf',
      'align': 'Chaotic Good',
      'ability-scores':
        {'str': '74',
        'dex': '56',
        'const': '22',
        'intell': '65',
        'wis': '49',
        'char': '33'},
      'level': '8',
      'xp': '300',
      'languages':
        ['Elvish', 'Dwarf'],
      'enhan':
        ['fat', 'cool', 'memes'],
      'resist':
        ['air', 'fire'],
      'special':
        ['Breathe water', 'fire breath'],
      'armor': '29',
      'hp': '350',
      'hero': '15',
      'weps':
        [{'name': 'Greatsword', 'to_hit': '22',
        'damage': '35', 'range': '12', 'notes': 'It sucks'},
        {'name': 'Holy Bow', 'to_hit': '45',
        'damage': '22', 'range': '65', 'notes': 'Will kill you'}],
      'spells':
        [{'name': 'Conjure Animals', 'level': '3nd', 'time': '1 Action', 'duration': 'Instantaneous',
        'range': '90 ft', 'attack': 'Ranged', 'damage': 'Acid', 'components': 'V, S, M'},
        {'name': 'Acid Arrow', 'level': '2nd', 'time': '1 Action', 'duration': '1 Hour',
        'range': '60 ft', 'attack': 'None', 'damage': 'Summoning', 'components': 'V, S'}],
      'items':
        [{'name': 'special ring', 'weight': '8', 'notes': 'kills things'},
        {'name': 'old book', 'weight': '12', 'notes': 'eerie...'}],
      'max_weight': '100',
      'base_speed': '30',
      'curr_speed': '50',
      'condition': 'fair',
      'treasures':
        {'gp': '32', 'cp': '22',
        'pp': '0', 'ep': '20', 'sp': '0',
        'gems': [{'name': 'rubies', 'num': '2'},
          {'name': 'sapphires', 'num': '3'}]}
    }
    # use dict to build HTML using library
    doc, tag, text = Doc().tagtext()
    with tag('div', klass = 'row'):
      with tag('div', klass = 'col title'):
        text('~ Player Sheet ~')
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
            text('Alignment: ' + raw_resp['align'])
      with tag('div', klass = 'col levelbox'):
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col title'):
            text('~ Level/XP ~')
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col levelfields', id='level'):
            text('Level: ' + raw_resp['level'])
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col levelfields', id='xp'):
            text('Experience Points: ' + raw_resp['xp'])
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col levelfields', id='next_xp'):
            text('Next Level Exp: ' + level_to_xp[(int(raw_resp['level']) + 1)])
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col levelfields', id='langs'):
            text('Languages: ' + (', ').join(raw_resp['languages']))
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col levelfields', id='condenhan'):
            text('Conditions + Enchancements: ' + (', ').join(raw_resp['enhan']))
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col levelfields', id='resist'):
            text('Resistances: ' + (', ').join(raw_resp['resist']))
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col levelfields', id='specs'):
            text('Special Skills + Abilities: ' + (', ').join(raw_resp['special']))
    with tag('div', klass = 'row'):
      with tag('div', klass = 'col attrbox'):
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col title'):
            text('~ Ability Scores ~')
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col str', id='str'):
            text(raw_resp['ability-scores']['str'] + ' Strength')
          with tag('div', klass = 'col str', id='str_mod'):
            text(str(modifier(raw_resp['ability-scores']['str'])) + ' Modifier')
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col dex', id='dex'):
            text(raw_resp['ability-scores']['dex'] + ' Dexterity')
          with tag('div', klass = 'col str', id='dex_mod'):
            text(str(modifier(raw_resp['ability-scores']['dex'])) + ' Modifier')
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col const', id='const'):
            text(raw_resp['ability-scores']['const'] + ' Constitution')
          with tag('div', klass = 'col str', id='const_mod'):
            text(str(modifier(raw_resp['ability-scores']['const'])) + ' Modifier')
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col intell', id='intell'):
            text(raw_resp['ability-scores']['intell'] + ' Intelligence')
          with tag('div', klass = 'col str', id='intell_mod'):
            text(str(modifier(raw_resp['ability-scores']['intell'])) + ' Modifier')
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col wis', id='wis'):
            text(raw_resp['ability-scores']['wis'] + ' Wisdom')
          with tag('div', klass = 'col str', id='wis_mod'):
            text(str(modifier(raw_resp['ability-scores']['wis'])) + ' Modifier')
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col char', id='char'):
            text(raw_resp['ability-scores']['char'] + ' Charisma')
          with tag('div', klass = 'col str', id='char_mod'):
            text(str(modifier(raw_resp['ability-scores']['char'])) + ' Modifier')
      with tag('div', klass = 'col statbox'):
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col title'):
            text('~ Stats ~')
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col armor', id='armor'):
            text(raw_resp['armor'] + " Armor Class")
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col hp', id='hp'):
            text(raw_resp['hp'] + " Hit Points")
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col hero', id='hero'):
            text(raw_resp['hero'] + " Heroics")
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
        with tag('div', id='hidden', klass='pspells'):
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col spellfields'):
              text('Level')
            with tag('div', klass = 'col spellfields'):
              text('Spell')
            with tag('div', klass = 'col spellfields'):
              text('Cast Time')
            with tag('div', klass = 'col spellfields'):
              text('Range/Area')
            with tag('div', klass = 'col spellfields'):
              text('Components')
            with tag('div', klass = 'col spellfields'):
              text('Duration')
            with tag('div', klass = 'col spellfields'):
              text('Attack/Save')
            with tag('div', klass = 'col spellfields'):
              text('Damage/Effect')
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
                text(spell['components'])
              with tag('div', klass = 'col spellfields'):
                text(spell['duration'])
              with tag('div', klass = 'col spellfields'):
                text(spell['attack'])
              with tag('div', klass = 'col spellfields'):
                text(spell['damage'])
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
        for item in raw_resp['items']:
          with tag('div', klass = 'row'):
            with tag('div', klass = 'col itemfields'):
              text(item['name'])
            with tag('div', klass = 'col itemfields'):
              text(item['weight'])
            with tag('div', klass = 'col itemfields'):
              text(item['notes'])
        with tag('div', id='items'):
          text() # placeholder in case of new items
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col itemfields'):
            text('Total Weight Carried: ')
          with tag('div', klass = 'col itemfields', id='weight_total'):
            text(sum(int(item['weight']) for item in raw_resp['items']))
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
                text('PP: ' + raw_resp['treasures']['pp'])
            with tag('div', klass = 'row'):
              with tag('div', klass = 'col treasfields', id='gp'):
                text('GP: ' + raw_resp['treasures']['gp'])
            with tag('div', klass = 'row'):
              with tag('div', klass = 'col treasfields', id='ep'):
                text('EP: ' + raw_resp['treasures']['ep'])
            with tag('div', klass = 'row'):
              with tag('div', klass = 'col treasfields', id='sp'):
                text('SP: ' + raw_resp['treasures']['sp'])
            with tag('div', klass = 'row'):
              with tag('div', klass = 'col treasfields', id='cp'):
                text('CP: ' + raw_resp['treasures']['cp'])
          with tag('div', klass ='col', id='gems'):
            with tag('div', klass = 'row'):
              with tag('div', klass = 'col title'):
                text('~ Gems ~')
            for gem in raw_resp['treasures']['gems']:
              with tag('div', klass ='row'):
                with tag('div', klass = 'col treasfields', id=gem['name']):
                  text(gem['name'] + ": " + gem['num'])
    with tag('div', klass = 'row'):
      with tag('div', klass = 'col condbox'):
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col title'):
            text('~ Condition/Speed ~')
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col condfields', id='base_speed'):
            text("Base Speed: " + raw_resp['base_speed'])
          with tag('div', klass = 'col condfields', id='curr_speed'):
            text("Current Speed: " + raw_resp['curr_speed'])
          with tag('div', klass = 'col condfields', id='cond'):
            text("Current Condition: " + raw_resp['condition'])

  else:
    #fake response and probably wont have the same parameters as a real one
    raw_resp = {
      'notes' : 'here are my notes we can just save this as plaintext maybe i will find a \nway to make a rich text editor so we can format \nthings better that would be cool.',
      'monsters' : {
        'Aarakocra' : {
          'size':'Medium',#size of monster
          'type':'Humanoid (aarakocra)',#idk if this is what its called
          'alignment': 'Neutral Good',#for role playing
          'ac': '12',#armor class
          'hp': '13',#hit Points
          'hit_dice': { #used to generate how many hit points a monster has
            'number': '3', #number of dice
            'value' : '8', #dice value (20 => d20 etc)
          },
          'speed': '20ft', #walking speed of the monster will worry about the other kinds of speed a monster can have later
          'ability_scores' : { #abillity scores of the monster
            'str' : '10',
            'dex' : '14',
            'const' : '10',
            'intell': '11',
            'wis' : '12',
            'char' : '11'
          },
          'saving_throws' : { #bonuses to saving throws form : "+10", "+0", "-3", etc
            'str' : '',
            'dex' : '',
            'const' : '',
            'intell': '',
            'wis' : '',
            'char' : ''
          },
          'c_rating' : '1/4', #challenge rating of the monster (have to think about the proficency bonuses involved with challenge rating)
          'skills' : [{
            'skill_name': 'Perception',
            'ability' : 'wis',
            'mod': '+5'
          }], #list of skills the monster has form: {'skill-name': '', 'ability': '', 'mod': ''}
          'resistances' : [], #list of damage types the monster has a resistance to
          'vulnerabilities' : [], #list of damage types the monster has a vulnerability to
          'immunities' : [], #list of damage types the monster has an immunity to
          'senses' : [{
            'sense' : 'passive perception',
            'value' : '17'
          }], #list of senses and the radius of that sense that the monster has form {'sense': '', 'radius': ''}
          'languages' : [], #languages the monster can speak form: {'language': '', 'speak': '', 'understand': ''}
          'telepathy' : {'radius' : ''}, #if radius is non zero then the monster has telepathy probably will integrate into the language portion of the monster shee
          'special_traits' : [{
            'trait' : 'Dive Attack',
            'notes' : 'If the aarakocra is flying and dives at least 30 feet straight toward the target and then hits is with a melee weapon attack, the attack deal an extra 1d6 damage to the target'
          }], # special traits that are relevant to combat form: {'trait': '', 'notes' : ''}
          'actions' : [{
            'action_type': 'weapon attack',
            'name' : 'Talon',
            'type' : 'melee',
            'reach' : '5ft',
            'min_range': '',
            'max_range': '',
            'hit_mod': '+4',
            'damage' : {
              'type' : 'slashing',
              'number' : '1',
              'value' : '4',
              'mod' : 'dex'
            },
            'notes' : ''
          },{
            'action-type': 'weapon attack',
            'name' : 'Javelin',
            'type' : 'melee/ranged',
            'reach' : '5ft',
            'min_range': '30ft',
            'max_range': '120ft',
            'hit-mod': '+4',
            'damage' : {
              'type' : 'piercing',
              'number' : '1',
              'value' : '6',
              'mod' : 'dex'
            },
            'notes' : ''
          }], #a list of actions that the monster can perform the form of each action varies on the type of action
          'reactions' : [], # a list of reactions a monster can have
          'legendary_actions' : {
            'num_action' : '',
            'actions' : []
          }
        },
        'Goristro' : {
          'size':'Huge',#size of monster
          'type':'Fiend (Demon)',#idk if this is what its called
          'alignment': 'Chaotic Evil',#for role playing
          'ac': '19',#armor class
          'hp': '310',#hit Points
          'hit_dice': { #used to generate how many hit points a monster has
            'number': '23', #number of dice
            'value' : '12' #dice value (20 => d20 etc)
          },
          'speed': '40ft', #walking speed of the monster will worry about the other kinds of speed a monster can have later
          'ability_scores' : { #abillity scores of the monster
            'str' : '25',
            'dex' : '11',
            'const' : '25',
            'intell': '6',
            'wis' : '13',
            'char' : '14'
          },
          'saving_throws' : { #bonuses to saving throws form : "+10", "+0", "-3", etc
            'str' : '+13',
            'dex' : '+6',
            'const' : '+13',
            'intell': '',
            'wis' : '+7',
            'char' : ''
          },
          'c-rating' : '17', #challenge rating of the monster (have to think about the proficency bonuses involved with challenge rating)
          'skills' : [{
            'skill_name': 'Perception',
            'ability' : 'wis',
            'mod': '+7'
          }], #list of skills the monster has form: {'skill-name': '', 'ability': '', 'mod': ''}
          'resistances' : ['cold', 'fire', 'lightning', 'bludgeoning', 'piercing', 'slashing'], #list of damage types the monster has a resistance to
          'vulnerabilities' : [], #list of damage types the monster has a vulnerability to
          'immunities' : ['poison'], #list of damage types the monster has an immunity to
          'senses' : [{
            'sense' : 'darkvision',
            'value' : '120ft'
          },{
            'sense' : 'passive perception',
            'value': '17'
          }], #list of senses and the value of that sense that the monster has form {'sense': '', 'value': ''}
          'languages' : [{
            'language':'Abyssal',
            'speak' : 'true',
            'understand' : 'true'
          }], #languages the monster can speak form: {'language': '', 'speak': '', 'understand': ''}
          'telepathy' : {'radius' : ''}, #if radius is non zero then the monster has telepathy probably will integrate into the language portion of the monster shee
          'special_traits' : [{
            'trait' : 'Charge',
            'notes' : 'If the goristro moves at least 15 feet straight toward a target and then hits it with a gore attack on the same turn, the target takes an extra 7d10 piercing damage. If the target is a creature, it must succeed on a DC 21 Strength saving throw or be pushed up to 20 feet away and knocked prone.'
          },{
            'trait' : 'Labyrinthine Recall',
            'notes' : 'The goristro can perfectly recall any path it has traveled.'
          },{
            'trait' : 'Magic Resistence',
            'notes' : 'The goristro has advantage on saving throws against spells and other magical effects.'
          },{
            'trait' : 'Siege Monster',
            'notes' : 'The goristro deals double damage to objects and structures.'
          }], # special traits that are relevant to combat form: {'trait': '', 'notes' : ''}
          'actions' : [{
            'action_type' : 'other',
            'name' : 'Multiattack',
            'notes' : 'The goristro makes three attacks: two with its fists and one with its hoof.'
          },{
            'action_type': 'weapon attack',
            'name' : 'Fist',
            'type' : 'melee',
            'reach' : '10ft',
            'min_range': '',
            'max_range': '',
            'hit_mod': '+13',
            'damage' : {
              'type' : 'bludgeoning',
              'number' : '3',
              'value' : '8',
              'mod' : 'str'
            },
            'notes' : ''
          },{
            'action_type': 'weapon attack',
            'name' : 'Hoof',
            'type' : 'melee',
            'reach' : '5ft',
            'min_range': '',
            'max_range': '',
            'hit_mod': '+13',
            'damage' : {
              'type' : 'bludgeoning',
              'number' : '3',
              'value' : '10',
              'mod' : 'str'
            },
            'notes' : 'If the target is a creature, it must succeed on a DC 21 Strength saving throw or be knocked prone.'
          },{
            'action_type': 'weapon attack',
            'name' : 'Gore',
            'type' : 'melee',
            'reach' : '10ft',
            'min_range': '',
            'max_range': '',
            'hit_mod': '+13',
            'damage' : {
              'type' : 'piercing',
              'number' : '7',
              'value' : '10',
              'mod' : 'str'
            },
            'notes' : ''
          }], #a list of actions that the monster can perform the form of each action varies on the type of action
          'reactions' : [], # a list of reactions a monster can have
          'legendary_actions' : {
            'num_action' : '',
            'actions' : []
          }
        }
      },
      'encounter' : {
        'monsters':[{
          'name' : 'Big man',
          'type' : 'Goristro'
        },{
          'name' : 'bird man',
          'type' : 'Aarakocra'
        }],
        'turnorder':[]
      }
    }
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
        with tag('textarea', placeholder='Notes for campaign go here...', id='dmtextarea'):
          text(raw_resp['notes'])
      with tag('div', klass = 'col dmmonster', id='hidden'):
        with tag('div', klass = 'row'):
          with tag('div', klass = 'col-md-4'):
            with tag('div', klass = 'row'):
              with tag('div', klass = 'col', id='newmonsterbtn'):
                text('New Monster')
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
                text('Monster Name')
              with tag('div', klass = 'col col-md-5', id = 'size'):
                text('Size: ')
            with tag('div', klass = 'row row-no-gutters'):
              with tag('div', klass = 'col col-md-12', id = 'type'):
                text('Type: ')
            with tag('div', klass = 'row row-no-gutters'):
              with tag('div', klass = 'col col-md-4' , id='ac'):
                text('AC: ')
              with tag('div', klass = 'col col-md-4', id='health'):
                text('Health: ')
              with tag('div', klass = 'col col-md-4', id='hit_dice'):
                text('Hit Dice: ')
            with tag('div', klass = 'row row-no-gutters'):
              with tag('div', klass = 'col no-border col-md-6', id = 'ability-scores'):
                text('Ability Scores')
                with tag('div', klass = 'row'):
                  with tag('div', klass = 'col', id = 'ability-scores-str'):
                    text('Str: ')
                  with tag('div', klass = 'col', id = 'ability-scores-str-mod'):
                    text('Mod: ')
                with tag('div', klass = 'row'):
                  with tag('div', klass = 'col', id = 'ability-scores-dex'):
                    text('Dex: ')
                  with tag('div', klass = 'col', id = 'ability-scores-dex-mod'):
                    text('Mod: ')
                with tag('div', klass = 'row'):
                  with tag('div', klass = 'col', id = 'ability-scores-const'):
                    text('Con: ')
                  with tag('div', klass = 'col', id = 'ability-scores-const-mod'):
                    text('Mod: ')
                with tag('div', klass = 'row'):
                  with tag('div', klass = 'col', id = 'ability-scores-intell'):
                    text('Int: ')
                  with tag('div', klass = 'col', id = 'ability-scores-intell-mod'):
                    text('Mod: ')
                with tag('div', klass = 'row'):
                  with tag('div', klass = 'col', id = 'ability-scores-wis'):
                    text('Wis: ')
                  with tag('div', klass = 'col', id = 'ability-scores-wis-mod'):
                    text('Mod: ')
                with tag('div', klass = 'row'):
                  with tag('div', klass = 'col', id = 'ability-scores-char'):
                    text('Cha: ')
                  with tag('div', klass = 'col', id = 'ability-scores-char-mod'):
                    text('Mod: ')

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
  return raw_resp, resp # return both JSON and HTML for sending to JS

# helper to determine what type of request based on header, form response
def decide_request(req, uname, isPlayer, clients, room):
  resp = ""
  req_type = req['type']
  if req_type == 'enter':
    # person has joined room, must take difference of new clients list and old
    # use to track person in room
    add_client(clients, room, uname)
    resp = {'msg': uname + ' has entered the battle!', 'color': 'red', 'type': 'status'}
  elif req_type == 'text':
    # someone is sending a message
    resp = {'msg': uname + ': ' + req['msg'], 'color': 'blue', 'type': 'chat'}
  elif req_type == 'dice_roll':
    # someone is asking for dice rolls
    msg = roll_dice(int(req['dice_type']),req['modifier'], req['modifier_value'], req['adv'], req['disadv'], uname)
    resp = {'msg': msg, 'color':'green', 'weight':'bold', 'type': 'roll'}
  elif req_type == 'leave':
    # someone leaving the room, remove from room client list to avoid issues, print status
    remove_client(uname, room)
    resp = {'msg': uname + ' has left the battle.', 'color': 'red', 'type': 'status'}
  elif req_type == 'get_sheet':
    # client asking for psheet OR DM info, depending on type, send requested info
    # include both formatted HTML and raw JSON
    jsonstr, data = get_player_stats(uname, isPlayer, room)
    if isPlayer:
        resp = {'msg': data, 'raw': jsonstr, 'type': 'sheet', 'l2x': level_to_xp}
    else:
        resp = {'msg': data, 'raw': jsonstr, 'type': 'dmstuff'}
  elif req_type == 'change_attr':
    # someone changed a numeric attribute
    direction = 'increased' if req['dir'] else 'decreased'
    lvl_up = ' Level Up!!!' if req['lvl'] else ''
    # keep same if not shortened version (should only be gems)
    attr = mod_stats[(req['attr'])] if req['attr'] in mod_stats.keys() else req['attr']
    resp = {'msg': uname + ' has ' + direction + ' their ' + attr + ' by ' +
    str(req['change']) + ' to ' + str(req['amt']) + '.' + lvl_up,
    'color': 'chocolate', 'type': 'status'}
  return json.dumps(resp) # convert JSON to string



# begin listening for different socket events

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
    global r_to_client
    global u_to_client
    msg = json.loads(message) # convert to dict
    # now process message dependent on type + room, clients
    clients = list(ws.handler.server.clients.values())
    room = session.get('room')
    resp = decide_request(msg, uname, isPlayer, clients, room)
    # check if broadcast or single event
    broadcast = True if msg['type'] not in single_events else False
    # send response to every one in sender's room if broadcast
    if broadcast:
      for client in r_to_client[room]:
        print("sending")
        print(resp)
        client.ws.send(resp)
    else:
      # otherwise only to sender of event
      curr = u_to_client[uname]
      print("sending")
      print(resp)
      curr.ws.send(resp)


@app.route('/')
def root():
    return redirect("/static/index.html", code=302)

@app.route('/play')
def play():
    #print ('in play\n')
    room = session.get('room')
    name = session.get('name')
    isPlayer = session.get('isPlayer')
    return render_template('play.html', room=room, name=name, isPlayer=isPlayer)

#post to join room, store session data for user
# redirect them to play url
@app.route('/joinRoom', methods=['POST'])
def join_post():
  # store session info for use
  session['name'] = request.form['uname']
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

    user = auth.create_user_with_email_and_password(str(request.form['email']), str(request.form['password']))
    auth.send_email_verification(user['idToken'])
    newData = {u"username": str(request.form['username']), u"email": str(request.form['email'])}
    db.collection(u'user').add(newData)

    return redirect('/static/login.html', code=302)



if __name__ == '__main__':
  print("""
  This can not be run directly because the Flask development server does not
  support web sockets. Instead, use gunicorn:

  gunicorn -b 127.0.0.1:8080 -k flask_sockets.worker main:app

  """)
