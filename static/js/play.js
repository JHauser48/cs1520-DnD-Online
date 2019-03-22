var socket;
var uname;
var roomname;
var isPlayer;
console.log("before doc");
$(document).ready(function(){
    console.log("doc loaded");
    //store client name, room name, and if the player is a dm or a regular Player
    arr = $('#hidden').text().split('roomname: ')[1].split(", clientname: ");
    roomname = arr[0];
    uname = arr[1].split(', isplayerordm: ')[0];
    isPlayer = (arr[1].split(', isplayerordm: ')[1] === 'True') ? true : false;
    console.log(roomname + ' ' + uname + ' ' + isPlayer);
    // if https, must be wss, otherwise ws
    var scheme = window.location.protocol == "https:" ? 'wss://' : 'ws://';
    var socket_uri = scheme + window.location.hostname + ':' + location.port + '/play';
    socket = new WebSocket(socket_uri);         //create socket for URI
    var sheet = isPlayer ? $('#sheet') : $('#dmstuff'); //save sheet element for adding in sheet/DM info
    var raw_sheet; //JSON version of sheet, use for updates during session, send back to server at end for updating in DB
    var l2x;      //used for players that need xp for next level, map level to needed XP

    //DM variables
    var currentMonsterEdit; //the monster that is currently being edited
    var currentMonsterTurn; //the monster whose turn it is

    // begin event handlers for socket
    //when new connection opened, should send type: enter
    socket.onopen = function(){
	    console.log("opened socket");
      // store in JSON for easy Python parsing
      // first send request for entry, then psheet or DM info
      let msg = JSON.stringify({type: 'enter'});
      socket.send(msg);
      msg = JSON.stringify({type: 'get_sheet'});
      socket.send(msg);
      console.log("sent get_sheet"); //debug
    };

    //handle receipt of messages, behavior changes based on type
    socket.onmessage = function(msg){
      data = JSON.parse(msg.data); //convert to JS object
      switch (data.type) {
        case 'status':
          $('#chatlog').append('<p style=\'color:' + data.color + '\'>&lt;' + data.msg + '&gt;</p>');
          $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
          break;
        case 'chat':
          $('#chatlog').append('<p style=\'color:' + data.color + '\'>' + data.msg + '</p>');
          $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
          break;
        case 'roll':
          $('#chatlog').append('<p style=\'color:' + data.color + ';' + 'font-weight:' + data.weight +'\'>' + data.msg + '</p>');
          $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
          break;
        case 'sheet':
          //server has sent the psheet or DM info for this player
          sheet.html(data.msg);   // add sheet to HTML
          raw_sheet = data.raw;   //store JSON
          l2x = data.l2x; //save level xp info
          //add current gems into options for changing
          let gem_html = "";
          raw_sheet.treasures.gems.forEach((gem) => {
            let gem_name = gem.name
            gem_html += `<option value="${gem_name}">${gem_name}</option>`
          });
          $('#change_attrs').append(gem_html);
          //handle if user clicks spells, need to switch to spell view
          $('#show_spell').click(function() {
            // set weapons to hidden, spells to shown, change "click" text to other
            // IF Not already shown
            if ($('.pspells').attr('id') == 'hidden') {
              $('.pweps').attr('id', 'hidden');
              $('.pspells').attr('id', 'shown');
              $('#show_wep').append(' (click to view)');
              let curr_html = $('#show_spell').html();
              curr_html = curr_html.replace(' (click to view)', '');
              $('#show_spell').html(curr_html);
            }
          });
          //handle if user clicks weps, need to switch to wep view
          $('#show_wep').click(function() {
            // set weapons to hidden, spells to shown, change "click" text to other
            // IF not already shown
            if ($('.pweps').attr('id') == 'hidden') {
              $('.pspells').attr('id', 'hidden');
              $('.pweps').attr('id', 'shown');
              $('#show_spell').append(' (click to view)');
              let curr_html = $('#show_wep').html();
              curr_html = curr_html.replace(' (click to view)', '');
              $('#show_wep').html(curr_html);
            }
          });
          break;
        case 'dmstuff':
          //server has sent the dm sheet
          sheet.html(data.msg);   //add sheet to HTML
          raw_sheet = data.raw; //store JSON
          //get all the content divs for easy access later
          arrDmContentDiv = [$('.dmnotes'), $('.dmmonster'), $('.dmencounter')];
          //dm sheet div buttons
          //need to be defined here so we know the dm sheet has been loaded
          $('#notes').click(function(){
            arrDmContentDiv.forEach(function(div){
              if(div.attr('id') === 'shown') div.attr('id', 'hidden');
              if(div.attr('class') === 'col dmnotes') div.attr('id', 'shown');
            });
          });
          $('#monster').click(function(){
            arrDmContentDiv.forEach(function(div){
              if(div.attr('id') === 'shown') div.attr('id', 'hidden');
              if(div.attr('class') === 'col dmmonster') div.attr('id', 'shown');
            });
          });
          $('#encounter').click(function(){
            arrDmContentDiv.forEach(function(div){
              if(div.attr('id') === 'shown') div.attr('id', 'hidden');
              if(div.attr('class') === 'col dmencounter') div.attr('id', 'shown');
            });
          });
          //get monster divs from monster list in the edit monster div
          $('#mmonsterlist').children('div').each(function(){
            //the next div is the one with the json in it
            //var monsterjson = JSON.parse($(this).children().html());
            $(this).click(function(){
              currentMonsterEdit = raw_sheet.monsters[$(this).html()];
              $('#monstername').html('Name: ' + $(this).html());
              $('#type').html('Type: ' + currentMonsterEdit.type);
              $('#size').html('Size: ' + currentMonsterEdit.size);
              $('#ac').html('AC: ' + currentMonsterEdit.ac);
              $('#speed').html('Speed: ' + currentMonsterEdit.speed);
              $('#health').html('Health: ' + currentMonsterEdit.hp);
              $('#hit_dice').html('Hit Dice: ' + currentMonsterEdit.hit_dice.number + 'd' + currentMonsterEdit.hit_dice.value);
              console.log(currentMonsterEdit);
              for(ability in currentMonsterEdit.ability_scores)
              {
                console.log(currentMonsterEdit.ability_scores[ability]);
                $('#ability-scores-' + ability).html(ability.charAt(0).toUpperCase() + ability.slice(1,3) + ': ' + currentMonsterEdit.ability_scores[ability]);
              }
            });
          });
          //get monster divs from monster list in the encounter div
          $('#emonsterlist').children('div').each(function(){
            //the next div is the one with the json in it
            //var monsterjson = JSON.parse($(this).children().html());
            $(this).click(function(){
              console.log($(this).html());
              //$('#dmmonsterinfo').html($(this).html());
            });
          });
          break;
      }
    }

    //Begin handlers for user-initiated events
    //handle if user sends message
    $('#text').keypress(function(e){
		  var code = e.keyCode || e.which;
		  if(code == 13)
		  {
			  var t = $('#text').val();
			  $('#text').val('');
			  //erase all script tags
			  var SCRIPT_REGEX = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
			  while (SCRIPT_REGEX.test(t)) {
				  t = t.replace(SCRIPT_REGEX, "");
        }
        // create string from chat text appended with type
        let msg = JSON.stringify({type: 'text', msg: t});
			  if(t !== "") socket.send(msg);
		  }
    });

    //handle if user asks for dice roll
    $('#dice_roll').click(function(){
      var adv, disadv, mod, mod_val;
      // 1, 0 used to represent true, false respectively for advantage and disadvantage
      adv = $('#adv:checked').val() == "on" ? 1 : 0;
      disadv = $('#disadv:checked').val() == "on" ? 1 : 0;
      mod = $('#modifier').val();
      mod_val = mod != "none" ? raw_sheet[mod] : 0;
      // create string from type appended with dice info
      let msg = JSON.stringify({type: 'dice_roll', dice_type: $('#dice_list').val(), modifier: mod, modifier_value: mod_val, adv: adv, disadv: disadv});
      socket.send(msg);
    });

    //handle if user submits attr change
    $('.btn.attr_amt').click(function(){
      let attr_field = $('#attr_num');
      let attr_num = attr_field.val(); //get number entered in
      attr_field.val('');    //clear field
      //must be a non-negative number and not empty, output error otherwise
      if (!(/^\+?\d+$/.test(attr_num))) {
        attr_field[0].setCustomValidity('Value must be a non-negative integer');
        attr_field[0].reportValidity();
        return;
      }
      attr_field[0].setCustomValidity('');
      let but_id = this.id; //which button (up_attr or down_attr)
      let attr_type = $('#change_attrs').val(); //which attr
      let rv = change_attr(but_id, attr_type, attr_num);
      //send message to notify room of change
      let msg = JSON.stringify({type: 'change_attr', attr: attr_type, dir: rv[1], 
      amt: rv[0], change: attr_num, lvl: rv[2]});
      console.log(msg); //DEBUG
      socket.send(msg);
    });

    //helper to change attribute based on params of client
    function change_attr(but, attr, num){
      // store if addition or subtraction
      let add_type = (but == 'up_attr') ? true : false;
      let curr, curr_html = 0;   //used for old values
      let level_up = false;    //used in case of level up
      //switch based on attr type, most fall into major groups
      switch(attr){
        case 'xp':
          curr = Number(raw_sheet[attr]); //retrieve current value
            if (add_type){
              curr += Number(num);
            } else {
              curr -= Number(num);
            }
          raw_sheet[attr] = curr; //update in JSON 
          // check if level up based on next xp
          let next_html = $('#next_xp').html();
          let next_xp = next_html.match(/\d+/g);
          if (curr >= Number(next_xp[0])) {
            // time to level up
            level_up = true;
            let curr_level = Number(raw_sheet['level']);
            curr_level += 1;
            let lev_html = $('#level').html();
            lev_html = lev_html.replace(/\d+/g, curr_level);
            $('#level').html(lev_html);
            raw_sheet['level'] = curr_level;
            next_xp = l2x[curr_level + 1];
            next_html = next_html.replace(/\d+/g, next_xp);
            $('#next_xp').html(next_html);
          }
          break;
        case 'str':
        case 'dex':
        case 'const':
        case 'intell':
        case 'wis':
        case 'char':
          //must recalculate modifier in these cases
          curr = Number(raw_sheet['ability-scores'][attr]); //retrieve current value
          if (add_type){
            curr += Number(num);
          } else {
            curr -= Number(num);
          }
          raw_sheet['ability-scores'][attr] = curr; //update in JSON 
          let new_mod = calc_mod(curr);
          let curr_mod = $('#' + attr + '_mod').html();
          curr_mod = curr_mod.replace(/\d+/g, new_mod);
          $('#' + attr + '_mod').html(curr_mod);
          break;
        case 'hp':
        case 'hero':
        case 'curr_speed':
          curr = Number(raw_sheet[attr]); //retrieve current value
          if (add_type){
            curr += Number(num);
          } else {
            curr -= Number(num);
          }
          raw_sheet[attr] = curr; //update in JSON
          break;
        case 'pp':
        case 'gp':
        case 'ep':
        case 'sp':
        case 'cp':
          curr = Number(raw_sheet['treasures'][attr]); //retrieve current value
          if (add_type){
            curr += Number(num);
          } else {
            curr -= Number(num);
          }
          raw_sheet['treasures'][attr] = curr;
          break;
        default:
          // only attrs in default should be gems
          let curr_gem = "";
          let gem_idx = 0;
          for (let gem of raw_sheet.treasures.gems){
            if (gem['name'] == attr) {
              curr_gem = gem;
              break;
            }
            gem_idx++;
          }
          curr = Number(curr_gem['num']); //retrieve current value
          if (add_type){
            curr += Number(num);
          } else {
            curr -= Number(num);
          }
          raw_sheet['treasures']['gems'][gem_idx]['num'] = curr;
          break;
      }
      // now update HTML for property
      curr_html = $('#' + attr).html();
      //replace digits in HTML with new digits
      curr_html = curr_html.replace(/\d+/g, curr);
      $('#' + attr).html(curr_html); //set new HTML
      return [curr, add_type, level_up]; //amount changed, type, if level up
    }

    //helper to calculate modifier for stat
    function calc_mod(stat_val){
      return Math.floor((Number(stat_val)-10) / 2)
    }

    //handle if user chooses to leave the room
    $('#leave').click(function(){
      // send leaving message first with updated sheet, and then close the connection
      let msg = JSON.stringify({type: 'leave', msg: raw_sheet});
      socket.send(msg);
      socket.close();
      window.location.href = "/static/index.html";
    });

    //handle if user exits page, make sure they leave the room
    $(window).on('beforeunload', function() {
      // send leaving message first w/ updated sheet, and then close the connection
      console.log("unloading");
      let msg = JSON.stringify({type: 'leave', msg: raw_sheet});
      socket.send(msg);
      socket.close();
    });

});
