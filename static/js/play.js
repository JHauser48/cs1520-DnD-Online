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
    var newMonsterEdit = { //new monster info that gets input into the html
      'size':'<input type=\'text\' name=\'size\' id=\'newMonsterTextField\' placeholder=\'Size\'>',
      'type':'<input type=\'text\' name=\'type\' id=\'newMonsterTextField\' placeholder=\'Monster Type\'>',
      'alignment': '<input type=\'text\' name=\'alignment\' id=\'newMonsterTextField\' placeholder=\'Alignment\'>',
      'ac': '<input type=\'text\' name=\'ac\' id=\'newMonsterTextField\' placeholder=\'AC\'>',
      'hp': '<input type=\'text\' name=\'hp\' id=\'newMonsterTextField\' placeholder=\'Avg. HP\'>',
      'hit_dice': {
      'number': '<input type=\'text\' name=\'number\' id=\'newMonsterHD\'>',
      'value' : '<input type=\'text\' name=\'value\' id=\'newMonsterHD\'>',
      },
      'speed': '<input type=\'text\' name=\'speed\' id=\'newMonsterTextField\' placeholder=\'Speed\'>',
      'ability_scores' : {
        'str' : '<input type=\'text\' name=\'str\' id=\'newMonsterTextField\' placeholder=\'Strength Stat\'>',
        'dex' : '<input type=\'text\' name=\'dex\' id=\'newMonsterTextField\' placeholder=\'Dexterity Stat\'>',
        'const' : '<input type=\'text\' name=\'const\' id=\'newMonsterTextField\' placeholder=\'Constitution Stat\'>',
        'intell': '<input type=\'text\' name=\'intell\' id=\'newMonsterTextField\' placeholder=\'Intelligence Stat\'>',
        'wis' : '<input type=\'text\' name=\'wis\' id=\'newMonsterTextField\' placeholder=\'Wisdom Stat\'>',
        'char' : '<input type=\'text\' name=\'char\' id=\'newMonsterTextField\' placeholder=\'Charisma Stat\'>'
      },
      'saving_throws' : {
        'str' : '',
        'dex' : '',
        'const' : '',
        'intell': '',
        'wis' : '',
        'char' : ''
      },
      'c_rating' : '0',
      'skills' : [], //{'skill-name': '', 'ability': '', 'mod': ''}
      'resistances' : [],
      'vulnerabilities' : [],
      'immunities' : [],
      'senses' : [],//{'sense': '', 'radius': ''} <--need to modify this cause of passive perception
      'languages' : [],//{'language': '', 'speak': '', 'understand': ''}
      'telepathy' : {'radius' : ''},
      'special_traits' : [],//{'trait': '', 'notes' : ''}
      'actions' : [],
      'reactions' : [],
      'legendary_actions' : {
        'num_action' : '',
        'actions' : []
      }
    };
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

          // --- BEGIN HANDLERS FOR PSHEET ELEMENTS ---
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

          //handle if user wants to add text in comma sep vals
          $('.btn.add_text.add_com').click(function() {
            //insert text box for entering in new value
            let but_id = this;    //where are we adding?
            //form new ids for input based on button clicked
            let in_id = this.id + "_input";
            let sub_id = this.id + "_sub";
            //first check if an input has already been created, if so, output error
            //should submit that one first
            if ($('#' + in_id).length) {
              let in_field = $('#' + in_id);
              in_field[0].setCustomValidity('Must submit before creating new');
              in_field[0].reportValidity();
              return;
            }
            $(but_id).before(`<input class="in add_text add_com" id=${in_id}` +
            ` placeholder="Enter new element..."><button class = "btn add_text sub_com"
            id=${sub_id}>Submit</button>`);
            //register handler for newly created field + button if a add on is submitted
            $('#' + sub_id).click(function() {
              let in_id = this.id.replace('sub', 'input');
              let in_field = $('#' + in_id).val();
              //must be non empty
              if (in_field.length == 0) {
                $('#' + in_id)[0].setCustomValidity("Input must not be empty");
                $('#' + in_id)[0].reportValidity();
                return;
              }
              $('#' + in_id)[0].setCustomValidity("");
              $('#' + in_id).val(''); //clear
              //closest div up in hierarchy will be where to add text
              let parent = $('#' + in_id).closest('div');
              //remove unneeded fields
              $('#' + sub_id).remove();
              $('#' + in_id).remove();
              //find button in div to where to add text before
              let but_child = parent.children('button');
              //must add to HTML and JSON
              $(but_child).before(', ' + in_field);
              let j_key = get_key(parent[0].id);
              raw_sheet[j_key].push(in_field);
              //now send message indicating change    
              let msg = JSON.stringify({type: 'change_text', attr: j_key, change: in_field});
              socket.send(msg);    
            });
          });

          //handle if user wants to add gem
          $('#add_gem').click(function() {
            //form new ids for input based on button clicked
            let in_id = this.id + "_input";
            let num_id = this.id + "_num";
            let sub_id = this.id + "_sub";
            //first check if an input has already been created, if so, output error
            //should submit that one first
            if ($('#' + in_id).length || $('#' + num_id).length) {
              let in_field = $('#' + in_id);
              in_field[0].setCustomValidity('Must submit before creating new');
              in_field[0].reportValidity();
              return;
            }
            //add text fields for gem + num, also submit button (wrap in new row + col)
            $('#gem_but').before(`<div class="row"><div class="col treasfields">` +
            `<input class="in add_text add_gem" id=${in_id}` +
            ` placeholder="Name"> <input class="in add_text add_gem"` +
            ` id=${num_id} placeholder="Amount">` +
            `<button class="btn add_text sub_com" id=${sub_id}>Submit</button></div></div>`);
            
            //register handler for newly created field + button if an add on is submitted
            $('#' + sub_id).click(function() {
              let in_id = this.id.replace('sub', 'input');
              let num_id = this.id.replace('sub', 'num') ;
              let in_field = $('#' + in_id).val();
              let num_field = $('#' + num_id).val();
              //both must be non-empty, second must be number
              if (in_field.length == 0) {
                $('#' + in_id)[0].setCustomValidity("Name must not be empty");
                $('#' + in_id)[0].reportValidity();
                return;
              }
              if (num_field.length == 0) {
                $('#' + num_id)[0].setCustomValidity("Amount must not be empty");
                $('#' + num_id)[0].reportValidity();
                return;
              }
              if (!(/^\+?\d+$/.test(num_field))) {
                $('#' + num_id)[0].setCustomValidity("Value must be non-negative integer");
                $('#' + num_id)[0].reportValidity();
                return;
              }
              $('#' + in_id)[0].setCustomValidity("");
              $('#' + in_id).val(''); //clear
              $('#' + num_id)[0].setCustomValidity("");
              $('#' + num_id).val(''); //clear
              //closest col in hierarchy will be where to insert new gem
              let parent = $('#' + in_id).closest('.col');
              //remove unneeded fields
              $('#' + sub_id).remove();
              $('#' + in_id).remove();
              $('#' + num_id).remove();
              //must add to HTML and JSON
              parent.attr('id', in_field);      //id == name of gem
              parent.html(in_field + ": " + num_field);
              let gem_obj = {name: in_field, num: num_field};
              raw_sheet['treasures']['gems'].push(gem_obj);
              //now add to options for increase/decrease, send message to server
              let gem_html = `<option value="${in_field}">${in_field}</option>`;
              $('#change_attrs').append(gem_html);
              let msg = JSON.stringify({type: 'add_gem', attr: in_field, change: num_field});
              socket.send(msg);    
            });
           });

           //handle if user wants to add table entry (i.e. weapons, spells, items)
           $('.btn.add_text.add_table').click(function() {
            let but_id = this;    //where are we adding?
            let sub_id = this.id + "_sub";
            add_item(this.id);      //employ helper to deal with html
           });
          break;
        case 'dmstuff':
          //server has sent the dm sheet
          sheet.html(data.msg);   //add sheet to HTML
          raw_sheet = data.raw; //store JSON
          //get all the content divs for easy access later
          arrDmContentDiv = [$('.dmnotes'), $('.dmmonster'), $('.dmencounter')];//dm sheet div buttons


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
          var loadMonsterEdit = function(){
            currentMonsterEdit = newMonsterEdit;
            $('#monstername').html('Name: <input type=\'text\' name=\'name\' id=\'newMonsterTextField\' placeholder=\'Monster Name\'>');
            $('#type').html('Type: ' + currentMonsterEdit.type);
            $('#size').html('Size: ' + currentMonsterEdit.size);
            $('#ac').html('AC: ' + currentMonsterEdit.ac);
            $('#speed').html('Speed: ' + currentMonsterEdit.speed);
            $('#health').html('Health: ' + currentMonsterEdit.hp);
            $('#hit_dice').html('Hit Dice: ' + currentMonsterEdit.hit_dice.number + 'd' + currentMonsterEdit.hit_dice.value);
            console.log(currentMonsterEdit);
            for(ability in currentMonsterEdit.ability_scores)
            {
              $('#ability-scores-' + ability + '-mod').css('display', 'none');
              //console.log(currentMonsterEdit.ability_scores[ability]);
              $('#ability-scores-' + ability).html(ability.charAt(0).toUpperCase() + ability.slice(1,3) + ': ' + currentMonsterEdit.ability_scores[ability]);
            }
          }
          //loads the monster editing html by default
          loadMonsterEdit();
          $('#newmonsterbtn').click(loadMonsterEdit);
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
              //console.log(currentMonsterEdit);
              for(ability in currentMonsterEdit.ability_scores)
              {
                //console.log(currentMonsterEdit.ability_scores[ability]);
                $('#ability-scores-' + ability).html(ability.charAt(0).toUpperCase() + ability.slice(1,3) + ': ' + currentMonsterEdit.ability_scores[ability]);
                $('#ability-scores-' + ability + '-mod').html('Mod: ' + Math.floor((parseInt(currentMonsterEdit.ability_scores[ability]) - 10) / 2).toString());
                $('#ability-scores-' + ability + '-mod').css('display', 'inline-block');
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

    //helper to deal with a player adding a table item (i.e. weapon, spell, item)
    function add_item(but_id) {
      let sub_id = but_id + "_sub";  //id of submit button, all types have one
      let name_id = but_id + "_name"; //same w name
      let ran_id = "";
      let not_id = "";
      var item_type = "";       //weapon, item, spell
      var item_name = "";       //for socket message
      switch(but_id) {
        case 'add_wep':
          //adding a weapon
          //fields = name, to hit, damage, range, notes
          let hit_id = but_id + "_to_hit";
          let dam_id = but_id + "_damage";
          ran_id = but_id + "_range";
          not_id = but_id + "_notes";
          //first check if an input has already been created, if so, output error
          //should submit that one first
          if ($('#' + name_id).length || $('#' + hit_id).length || $('#' + dam_id).length ||
              $('#' + ran_id).length || $('#' + not_id).length)  {
            let in_field = $('#' + name_id);
            in_field[0].setCustomValidity('Must submit before creating new');
            in_field[0].reportValidity();
            return;
          }
          //add text fields for weapon attrs, also submit button (wrap in new row + col)
          $('#wep_but').before(`<div class="row"><div class="col wepfields">` +
          `<input class="in add_text add_table" id=${name_id}` +
          ` placeholder="Name"></div><div class="col wepfields">` +
          `<input class="in add_text add_table" id=${hit_id} placeholder="To Hit"></div>` +
          `<div class="col wepfields"><input class="in add_text add_table" id=${dam_id}` +
          ` placeholder="Damage"></div><div class="col wepfields">` +
          `<input class="in add_text add_table" id=${ran_id} placeholder="Range"></div>` +
          `<div class="col wepfields"><input class="in add_text add_table" id=${not_id}` +
          ` placeholder="Notes"></div></div><div class="row"><div class="col wepfields title">` +
          `<button class="btn add_text sub_tab" id=${sub_id}>Submit</button></div></div>`);
          
          //register handler for newly created weapon + button if an add on is submitted
          $('#' + sub_id).click(function() {
            // get all fields
            let field_arr = {};     //store all id to field maps for looping
            let name_id = this.id.replace('sub', 'name');
            let name_field = $('#' + name_id).val();
            item_name = name_field;
            field_arr[name_id] = name_field;
            let hit_id = this.id.replace('sub', 'to_hit');
            let hit_field = $('#' + hit_id).val();
            field_arr[hit_id] = hit_field;
            let dam_id = this.id.replace('sub', 'damage');
            let dam_field = $('#' + dam_id).val();
            field_arr[dam_id] = dam_field;
            let ran_id = this.id.replace('sub', 'range');
            let ran_field = $('#' + ran_id).val();
            field_arr[ran_id] = ran_field;
            let not_id = this.id.replace('sub', 'notes');
            let not_field = $('#' + not_id).val();
            field_arr[not_id] = not_field;
            //ensure not empty
            var empty = false;
            Object.keys(field_arr).forEach((key) => {
              if (field_arr[key].length == 0) {
                empty = true;
                $('#' + key)[0].setCustomValidity("Field must not be empty");
                $('#' + key)[0].reportValidity();
                return;
              }
            });
            if (empty)      return;     //empty
            //now loop thru and clear fields
            Object.keys(field_arr).forEach((key) => {
              $('#' + key)[0].setCustomValidity("");
              $('#' + key).val(''); 
            });
            //now, go thru each, update HTML and JSON
            //closest col in hierarchy will be where to insert new wep attr
            //each corresponding col content will need to be updated
            var wep_obj = {}      //build wep object
            Object.keys(field_arr).forEach((key) => {
              let parent = $('#' + key).closest('.col');
              parent.html(field_arr[key]);   //add new text
              let raw_key = key.replace('add_wep_', '');  //convert id to json key
              wep_obj[raw_key] = field_arr[key]; 
            });
            raw_sheet['weps'].push(wep_obj);      //save newly created weapon object
            //remove submit button for now
            let parent = this.closest('.row');   //start nearest row, remove all children
            $(parent).children().remove();
            $(parent).remove();
            //now just send a socket message indicating adding an item
            item_type = "Weapons";
            let msg = JSON.stringify({type: 'add_item', name: item_name, it_type: item_type});
            socket.send(msg);
          });
          break;
        case 'add_spell':
          //player adding a spell
          //fields = Level, Spell/Name, Cast Time, Range, Comp,Duration, Attack,effect
          let lev_id = but_id + "_level";
          let time_id = but_id + "_time";
          ran_id = but_id + "_range";
          let dur_id = but_id + "_duration";
          let comp_id = but_id + "_components";
          let att_id = but_id + "_attack";
          let eff_id = but_id + "_damage";
          //first check if an input has already been created, if so, output error
          //should submit that one first
          if ($('#' + name_id).length || $('#' + lev_id).length || $('#' + time_id).length ||
              $('#' + ran_id).length || $('#' + dur_id).length || $('#' + comp_id).length ||
              $('#' + att_id).length || $('#' + eff_id).length)  {
            let in_field = $('#' + name_id);
            in_field[0].setCustomValidity('Must submit before creating new');
            in_field[0].reportValidity();
            return;
          }
          //add text fields for spell attrs, also submit button (wrap in new row + col)
          $('#spell_but').before(`<div class="row"><div class="col spellfields">` +
          `<input class="in add_text add_table" id=${lev_id}` +
          ` placeholder="Level"></div><div class="col spellfields">` +
          `<input class="in add_text add_table" id=${name_id} placeholder="Spell"></div>` +
          `<div class="col spellfields"><input class="in add_text add_table" id=${time_id}` +
          ` placeholder="Cast Time"></div><div class="col spellfields">` +
          `<input class="in add_text add_table" id=${ran_id} placeholder="Range"></div>` +
          `<div class="col spellfields"><input class="in add_text add_table" id=${comp_id}` +
          ` placeholder="Components"><input class="in add_text add_table" id=${dur_id}` +
          ` placeholder="Duration"></div><div class="col spellfields"><input class="in ` +
          `add_text add_table" id=${att_id} placeholder="Attack/Save">` +
          `<input class="in add_text add_table" id=${eff_id} placeholder="Effect">` +
          `</div></div><div class="row"><div class="col wepfields title">` +
          `<button class="btn add_text sub_tab" id=${sub_id}>Submit</button></div></div>`);

          //register handler for newly created spell + button if an add on is submitted
          $('#' + sub_id).click(function() {
            // get all fields
            let field_arr = {};     //store all id to field maps for looping
            let name_id = this.id.replace('sub', 'name');
            let name_field = $('#' + name_id).val();
            item_name = name_field;
            field_arr[name_id] = name_field;
            let lev_id = this.id.replace('sub', 'level');
            let lev_field = $('#' + lev_id).val();
            field_arr[lev_id] = lev_field;
            let time_id = this.id.replace('sub', 'time');
            let time_field = $('#' + time_id).val();
            field_arr[time_id] = time_field;
            let ran_id = this.id.replace('sub', 'range');
            let ran_field = $('#' + ran_id).val();
            field_arr[ran_id] = ran_field;
            let comp_id = this.id.replace('sub', 'components');
            let comp_field = $('#' + comp_id).val();
            field_arr[comp_id] = comp_field;
            let dur_id = this.id.replace('sub', 'duration');
            let dur_field = $('#' + dur_id).val();
            field_arr[dur_id] = dur_field;
            let att_id = this.id.replace('sub', 'attack');
            let att_field = $('#' + att_id).val();
            field_arr[att_id] = att_field;
            let eff_id = this.id.replace('sub', 'damage');
            let eff_field = $('#' + eff_id).val();
            field_arr[eff_id] = eff_field;
            //ensure not empty
            var empty = false;
            Object.keys(field_arr).forEach((key) => {
              if (field_arr[key].length == 0) {
                empty = true;
                $('#' + key)[0].setCustomValidity("Field must not be empty");
                $('#' + key)[0].reportValidity();
                return;
              }
            });
            if (empty)      return;     //empty
            //now loop thru and clear fields
            Object.keys(field_arr).forEach((key) => {
              $('#' + key)[0].setCustomValidity("");
              $('#' + key).val(''); 
            });
            //now, go thru each, update HTML and JSON
            //closest col in hierarchy will be where to insert new spell attr
            //each corresponding col content will need to be updated
            var spell_obj = {}      //build spell object
            var comp_arr = new Array(2);      //use for components + attack
            var att_arr = new Array(2);
            Object.keys(field_arr).forEach((key) => {
              let parent = $('#' + key).closest('.col');
              // comp/duration + attack/damage special cases, need to be concatenated
              if (key == 'add_spell_components') {
                comp_arr[0] = field_arr[key];
              } else if (key == 'add_spell_attack') {
                att_arr[0] = field_arr[key]
              } else if (key == 'add_spell_duration') {
                comp_arr[1] = field_arr[key];
              } else if (key == 'add_spell_damage') {
                att_arr[1] = field_arr[key];
              } else {
                parent.html(field_arr[key]);   //add new text
              }
              let raw_key = key.replace('add_spell_', '');  //convert id to json key
              spell_obj[raw_key] = field_arr[key]; 
            });
            //add special cases
            let spec_html = comp_arr[0] + ';<br>' + comp_arr[1];
            let parent = $('#' + comp_id).closest('.col');
            parent.html(spec_html);
            spec_html = att_arr[0] + ';<br>' + att_arr[1];
            parent = $('#' + att_id).closest('.col');
            parent.html(spec_html);
            raw_sheet['spells'].push(spell_obj);        //save new spell
            console.log(raw_sheet);       //debug
            //remove submit button for now
            parent = this.closest('.row');   //start nearest row, remove all children + row
            $(parent).children().remove();
            $(parent).remove();
            //now just send message over socket
            item_type = "Spells";
            let msg = JSON.stringify({type: 'add_item', name: item_name, it_type: item_type});
            socket.send(msg);
          });
          break;
        case 'add_item':
          //adding an item
          //fields = name, weight notes
          let weight_id = but_id + "_weight";
          not_id = but_id + "_notes";
          //first check if an input has already been created, if so, output error
          //should submit that one first
          if ($('#' + name_id).length || $('#' + weight_id).length || $('#' + not_id).length) {
            let in_field = $('#' + name_id);
            in_field[0].setCustomValidity('Must submit before creating new');
            in_field[0].reportValidity();
            return;
          }
          //add text fields for item attrs, also submit button (wrap in new row + col)
          $('#item_but').before(`<div class="row"><div class="col itemfields">` +
          `<input class="in add_text add_table" id=${name_id}` +
          ` placeholder="Name"></div><div class="col itemfields">` +
          `<input class="in add_text add_table" id=${weight_id} placeholder="Weight"></div>` +
          `<div class="col itemfields"><input class="in add_text add_table" id=${not_id}` +
          ` placeholder="Notes"></div></div><div class="row"><div class="col itemfields title">` +
          `<button class="btn add_text sub_tab" id=${sub_id}>Submit</button></div></div>`);

          //register handler for newly created item + button if an add on is submitted
          $('#' + sub_id).click(function() {
            // get all fields
            let field_arr = {};     //store all id to field maps for looping
            let name_id = this.id.replace('sub', 'name');
            let name_field = $('#' + name_id).val();
            item_name = name_field;
            field_arr[name_id] = name_field;
            let weight_id = this.id.replace('sub', 'weight');
            let weight_field = $('#' + weight_id).val();
            field_arr[weight_id] = weight_field;
            let not_id = this.id.replace('sub', 'notes');
            let not_field = $('#' + not_id).val();
            field_arr[not_id] = not_field;
            //ensure not empty
            var empty = false;
            Object.keys(field_arr).forEach((key) => {
              if (field_arr[key].length == 0) {
                empty = true;
                $('#' + key)[0].setCustomValidity("Field must not be empty");
                $('#' + key)[0].reportValidity();
                return;
              }
            });
            if (empty)      return;     //empty
            //ensure weight non-negative integer
            if (!(/^\+?\d+$/.test(weight_field))) {
              $('#' + weight_id)[0].setCustomValidity('Value must be a non-negative integer');
              $('#' + weight_id)[0].reportValidity();
              return;
            }
            //now loop thru and clear fields
            Object.keys(field_arr).forEach((key) => {
              $('#' + key)[0].setCustomValidity("");
              $('#' + key).val(''); 
            });
            //now, go thru each, update HTML and JSON
            //closest col in hierarchy will be where to insert new item attr
            //each corresponding col content will need to be updated
            var item_obj = {}      //build wep object
            Object.keys(field_arr).forEach((key) => {
              let parent = $('#' + key).closest('.col');
              parent.html(field_arr[key]);   //add new text
              let raw_key = key.replace('add_item_', '');  //convert id to json key
              item_obj[raw_key] = field_arr[key]; 
            });
            //since item added, we must update current carry weight
            let curr_weight = Number($('#weight_total').html().match(/\d+/g));
            curr_weight += Number(weight_field);
            $('#weight_total').html(curr_weight);
            raw_sheet['items'].push(item_obj);
            console.log(raw_sheet);       //DEBUG
            //remove submit button for now
            let parent = this.closest('.row');   //start nearest row, remove all children
            $(parent).children().remove();
            $(parent).remove();
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
      //must be a non-negative number and not empty, output error otherwise
      if (!(/^\+?\d+$/.test(attr_num))) {
        attr_field[0].setCustomValidity('Value must be a non-negative integer');
        attr_field[0].reportValidity();
        return;
      }
      attr_field[0].setCustomValidity('');
      attr_field.val('');    //clear field
      let but_id = this.id; //which button (up_attr or down_attr)
      let attr_type = $('#change_attrs').val(); //which attr
      let rv = change_attr(but_id, attr_type, attr_num);
      //send message to notify room of change
      let msg = JSON.stringify({type: 'change_attr', attr: attr_type, dir: rv[1],
      amt: rv[0], change: attr_num, lvl: rv[2]});
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
          if (attr == 'str') {
            //max_weight based on strength, must be re-calculated
            let new_weight = curr * 15;
            $('#max_weight').html(new_weight);
          }
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

    //helper to get JSON key based on where text added (could've used hash/dict I guess but whatever)
    function get_key(field_id) {
      let key = '';
      switch(field_id) {
        case 'langs':
          key = 'languages';
          break;
        case 'condenhan':
          key = 'enhan';
          break;
        case 'resist':
          key = 'resist';
          break;
        case 'specs':
          key = 'special';
          break;
      }
      return key;
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
      let msg = JSON.stringify({type: 'leave', msg: raw_sheet});
      socket.send(msg);
      socket.close();
    });

});
