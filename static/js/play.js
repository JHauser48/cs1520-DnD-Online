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
    var cond_list = ['Normal', 'Blinded', 'Charmed', 'Deafened', 'Fatigued', 'Frightened', 'Grappled',
    'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained',
    'Stunned', 'Unconscious'];  //list of all possible conditions, use for list

    //DM variables
    var newMonsterEdit = { //new monster info that gets input into the html
      'size':'<input type=\'text\' name=\'size\' class=\'newMonsterTextField\' placeholder=\'Size\' value=\'\'>',
      'type':'<input type=\'text\' name=\'type\' class=\'newMonsterTextField\' placeholder=\'Monster Type\' value=\'\'>',
      'alignment': '<input type=\'text\' name=\'alignment\' class=\'newMonsterTextField\' placeholder=\'Alignment\' value=\'\'>',
      'ac': '<input type=\'text\' name=\'ac\' class=\'newMonsterTextField\' placeholder=\'AC\' value=\'\'>',
      'hp': '<input type=\'text\' name=\'hp\' class=\'newMonsterTextField\' placeholder=\'Avg. HP\' value=\'\'>',
      'hit_dice': {
      'number': '<input type=\'text\' name=\'hdnumber\' class=\'newMonsterHD\' value=\'\'>',
      'value' : '<input type=\'text\' name=\'hdvalue\' class=\'newMonsterHD\' value=\'\'>',
      },
      'speed': '<input type=\'text\' name=\'speed\' class=\'newMonsterTextField\' placeholder=\'Speed\' value=\'\'>',
      'ability_scores' : {
        'str' : '<input type=\'text\' name=\'str\' class=\'newMonsterTextField\' placeholder=\'Strength Stat\' value=\'\'>',
        'dex' : '<input type=\'text\' name=\'dex\' class=\'newMonsterTextField\' placeholder=\'Dexterity Stat\' value=\'\'>',
        'const' : '<input type=\'text\' name=\'const\' class=\'newMonsterTextField\' placeholder=\'Constitution Stat\' value=\'\'>',
        'intell': '<input type=\'text\' name=\'intell\' class=\'newMonsterTextField\' placeholder=\'Intelligence Stat\' value=\'\'>',
        'wis' : '<input type=\'text\' name=\'wis\' class=\'newMonsterTextField\' placeholder=\'Wisdom Stat\' value=\'\'>',
        'char' : '<input type=\'text\' name=\'char\' class=\'newMonsterTextField\' placeholder=\'Charisma Stat\' value=\'\'>'
      },
      'saving_throws' : {
        'str' : '<input type=\'text\' name=\'throw-str\' class=\'newMonsterTextField\' value=\'\'>',
        'dex' : '<input type=\'text\' name=\'throw-dex\' class=\'newMonsterTextField\' value=\'\'>',
        'const' : '<input type=\'text\' name=\'throw-const\' class=\'newMonsterTextField\' value=\'\'>',
        'intell': '<input type=\'text\' name=\'throw-intell\' class=\'newMonsterTextField\' value=\'\'>',
        'wis' : '<input type=\'text\' name=\'throw-wis\' class=\'newMonsterTextField\' value=\'\'>',
        'char' : '<input type=\'text\' name=\'throw-char\' class=\'newMonsterTextField\' value=\'\'>'
      },
      'c_rating' : '<input type=\'text\' name=\'c_rating\' class=\'newMonsterTextField\' value=\'\'>',
      'skills' : [], //{'skill-name': '', 'ability': '', 'mod': ''}
      'resistances' : [],
      'vulnerabilities' : [],
      'immunities' : [],
      'senses' : [{
        'sense': '<input type=\'text\' name=\'sense\' class=\'newMonsterTextField\' placeholder=\'Sense\' value=\'\'>',
        'value': '<input type=\'text\' name=\'value\' class=\'newMonsterTextField\' placeholder=\'Value\' value=\'\'>'
      }],//{'sense': '', 'value': ''} <--need to modify this cause of passive perception
      'languages' : [{
        'language':'<input type=\'text\' name=\'language\' class=\'newMonsterTextField\' placeholder=\'Language\' value=\'\'>',
        'speak': '<input type=\'text\' name=\'speak\' class=\'newMonsterTextField\' placeholder=\'Yes/No\' value=\'\'>',
        'understand': '<input type=\'text\' name=\'understand\' class=\'newMonsterTextField\' placeholder=\'Yes/No\' value=\'\'>'
      }],//{'language': '', 'speak': '', 'understand': ''}
      //'telepathy' : {'radius' : ''},
      'special_traits' : [{
        'trait': '<input type=\'text\' name=\'trait\' class=\'newMonsterTextField\' placeholder=\'Trait\' value=\'\'>',
        'notes': '<textarea name=\'notes\' class=\'newMonsterTextArea\' placeholder=\'Description of trait...\'></textarea>'
      }],//{'trait': '', 'notes' : ''}
      'actions' : [],
      'reactions' : [],
      'legendary_actions' : {
        'num_action' : '<input type=\'text\' name=\'num_action\' class=\'newMonsterTextField\' placeholder=\'Actions\' value=\'\'>',
        'actions' : []
      }
    };
    var currentMonsterEdit; //the monster that is currently being edited
    var currentMonsterTurn; //the monster whose turn it is

    // begin event handlers for socket
    //when new connection opened, should send type: enter
    socket.onopen = function(){
	    console.log("opened socket");
      // first send request for entry, then psheet or DM info
      let msg = JSON.stringify({type: 'enter'});
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
          $('.btn.but_sheet').remove();       //remove load/create buttons on sheet load (if there)
          sheet.css('display', 'inline-block');    //unhide sheet
          //server has sent the psheet or DM info for this player
          sheet.html(data.msg);   // add sheet to HTML
          raw_sheet = data.raw;   //store JSON
          l2x = data.l2x; //save level xp info
          //add current gems into options for changing
          let gem_html = "";
          if (raw_sheet.treasures.hasOwnProperty('gems')) {
          raw_sheet.treasures.gems.forEach((gem) => {
              let gem_name = gem.name
              gem_html += `<option value="${gem_name}">${gem_name}</option>`
            });
            $('#change_attrs').append(gem_html);
          }

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
            let rv = add_comma_val(this.id, raw_sheet);
            if (typeof rv !== 'undefined') {
              //returns undefined if there is an error in input, must check
              //store updated sheet otherwise
              raw_sheet = rv;
            }
          });

          //handle if user wants to add gem
          $('#add_gem').click(function() {
            let rv = add_gem(this.id, raw_sheet, true);     //use helper
            if (typeof rv !== 'undefined') {
              raw_sheet = rv;
            }
          });

           //handle if user wants to add table entry (i.e. weapons, spells, items)
          $('.btn.add_text.add_table').click(function() {
            let rv = add_item(this.id, raw_sheet, true);      //employ helper to deal with html
            if (typeof rv !== 'undefined') {
              raw_sheet = rv;
            }
          });

           //handle if user wants to change condition
          $('#change_cond').click(function() {
            console.log("clicked change_cond");     //DEBUG
            let but_id = this;    //where are we adding?
            let sel_id = this.id + '_sel';
            let sub_id = this.id + '_sub';
            //first check if an input has already been created, if so, output error
            //should submit that one first
            if ($('#' + sel_id).length) {
              let sel_field = $('#' + sel_id);
              sel_field[0].setCustomValidity('Must submit before creating new');
              sel_field[0].reportValidity();
              return;
            }
            //add select fields for condition also submit button
            //build string of condition options
            var cond_string = "";
            cond_list.forEach((cond) => {
              cond_string += `<option value="${cond}">${cond}</option>`
            });
            $(but_id).before(`<select class="attr_amt" id=${sel_id}>` +
            `${cond_string}</select>` +
            `<button class="btn add_text sub_com" id=${sub_id}>Submit</button>`);
            //register handler for newly created field + button if an add on is submitted
            $('#' + sub_id).click(function() {
              let sel_id = this.id.replace('sub', 'sel');
              $('#' + sel_id)[0].setCustomValidity('');
              let sel_field = $('#' + sel_id).val();
              $('#' + sub_id).remove();
              $('#' + sel_id).remove();
              //must add to HTML and JSON
              $('#cond_text').html(`Current Condition: ${sel_field}`);
              let last_cond = raw_sheet['condition']
              raw_sheet['condition'] = sel_field;
              console.log(raw_sheet);     //DEBUG
              let msg = JSON.stringify({type: 'change_cond', change: sel_field, last: last_cond});
              socket.send(msg);
            });
          });

          break;
        case 'create_psheet':
          //server has sent psheet form for sheet creation
          $('.btn.but_sheet').remove();       //remove load/create buttons on sheet load
          sheet.css('display', 'inline-block');    //unhide sheet]
          sheet.html(data.msg);       //display form
          var sheet_obj = {};         //save all newly added attributes for sending back to the server
          // ---BEGIN HANDLERS---
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
            let rv = add_comma_val(this.id, sheet_obj);
            if (typeof rv !== 'undefined') {
              sheet_obj = rv;
            }
          });
          //handle if user wants to add gem
          $('#add_gem').click(function() {
            let rv = add_gem(this.id, sheet_obj, false);
            if (typeof rv !== 'undefined') {
              sheet_obj = rv;
            }
           });
          //handle if user wants to add table entry (i.e. weapons, spells, items)
          $('.btn.add_text.add_table').click(function() {
            let rv = add_item(this.id, sheet_obj, false);      //employ helper to deal with html
            if (typeof rv !== 'undefined') {
              sheet_obj = rv;
            }
          });
          //now when user submits sheet, must validate input, form JSON, send to server
          $('#sub_sheet').click(function() {
            var req_fields = {};      //dict of all required fields use for checking
            let req_list = ['ptitle', 'pname', 'pclass', 'prace', 'pstr', 'pdex', 'pconst', 'pintell', 'pwis',
            'pchar', 'php', 'ppp', 'pgp', 'pep', 'psp', 'pcp', 'pbase', 'pcurr'];
            req_list.forEach((req) => {
              req_fields[req] = $('#' + req).val();
            });
            //ensure not empty
            var empty = false;
            Object.keys(req_fields).forEach((key) => {
              if (req_fields[key].length == 0) {
                empty = true;
                $('#' + key)[0].setCustomValidity("Field must not be empty");
                $('#' + key)[0].reportValidity();
                return;
              }
            });
            if (empty)      return;     //empty
            //now ensure fields that must be non-negative numbers are (i.e. all except name,
            //class, racespeeds, title)
            Object.keys(req_fields).forEach((key) => {
              if (key != 'pname' && key != 'pbase' && key != 'pcurr' && key != 'ptitle' &&
                  key != 'pclass' && key != 'prace') {
                if (!(/^\+?\d+$/.test(req_fields[key]))) {
                  empty = true;
                  $('#' + key)[0].setCustomValidity("Field must a non-negative Integer");
                  $('#' + key)[0].reportValidity();
                  return;
                }
              }
            });
            if (empty)      return;     //empty
            //now loop thru and clear fields
            Object.keys(req_fields).forEach((key) => {
              $('#' + key)[0].setCustomValidity("");
              $('#' + key).val('');
            });
            //now that input validation is done, we can start storing attrs in JSON
            sheet_obj['sheet_title'] = req_fields['ptitle'];
            sheet_obj['name'] = req_fields['pname'];
            sheet_obj['class'] = req_fields['pclass'];
            sheet_obj['race'] = req_fields['prace'];
            sheet_obj['align'] = $('#palign').val();
            sheet_obj['ability-scores'] = {};
            sheet_obj['ability-scores']['str'] = req_fields['pstr'];
            sheet_obj['ability-scores']['dex'] = req_fields['pdex'];
            sheet_obj['ability-scores']['const'] = req_fields['pconst'];
            sheet_obj['ability-scores']['intell'] = req_fields['pintell'];
            sheet_obj['ability-scores']['wis'] = req_fields['pwis'];
            sheet_obj['ability-scores']['char'] = req_fields['pchar'];
            sheet_obj['level'] = '1';           //everybody starts at level 1
            sheet_obj['xp'] = '0';          //everyone starts w 0 xp
            sheet_obj['hp'] = req_fields['php'];
            sheet_obj['condition'] = 'Normal';      //everyone starts out normal
            sheet_obj['base_speed'] = req_fields['pbase'];
            sheet_obj['curr_speed'] = req_fields['pcurr'];
            if (!sheet_obj.hasOwnProperty('treasures')) {
              sheet_obj['treasures'] = {};
            }
            sheet_obj['treasures']['gp'] = req_fields['pgp'];
            sheet_obj['treasures']['cp'] = req_fields['pcp'];
            sheet_obj['treasures']['pp'] = req_fields['ppp'];
            sheet_obj['treasures']['ep'] = req_fields['pep'];
            sheet_obj['treasures']['sp'] = req_fields['psp'];
            //now send to server to build
            let msg = JSON.stringify({type: 'get_sheet', msg: sheet_obj});
            socket.send(msg);
          });
          break;
        case 'sheet_list':
          //server has sent us list of our saved sheets, must display
          $('.btn.but_sheet').remove();       //remove load/create buttons on sheet load
          sheet.css('display', 'inline-block');    //unhide sheet
          //form html row for each psheet, displaying title, character name, and choose button
          var all_sheets = '';
          let curr_msg = JSON.parse(data.msg);
          console.log(curr_msg);     //DEBUG
          console.log(typeof(curr_msg));
          curr_msg.forEach((save_sheet) => {
            console.log(save_sheet);
            all_sheets += `<div class="row"><div class="col title">`+
            `Sheet: <span class="highlight">${save_sheet.sheet_title}</span>` +
            ((isPlayer == true) ? `Character Name: <span class="highlight">${save_sheet.name}</span>` : ``) +
            `<button class="btn choose_sheet" id="${save_sheet.sheet_title}">Choose</button>`+
            `</div></div>`;
          });
          sheet.html(all_sheets);       //display saved sheets for picking
          //register handler for user choosing a sheet
          $('.btn.choose_sheet').click(function() {
            let chosen_sheet = this.id;       //sheet title == id of button
            //send message to server asking for sheet
            let msg = JSON.stringify({type: 'get_sheet', title: chosen_sheet});
            socket.send(msg);
          });
          break;
        case 'create_dmsheet':
          $('.btn.but_sheet').remove();       //remove load/create buttons on sheet load
          sheet.css('display', 'inline-block');    //unhide sheet]
          sheet.html(data.msg);
          var raw = data.raw;
          $('#tbtn').click(function(){
            var title = $('#dmtitle').val();
            if(title == ''){
              var em = $('<div class="col"></div>');
              em.html('Please enter a title for your dm sheet.');
              $('#err').html(em);
              return;
            }
            raw['sheet_title'] = title;
            let msg = JSON.stringify({type: 'get_sheet', msg: raw});
            socket.send(msg);
          });
          $('#dmtitle').change(function(){
            $('#err').html('');
          });
          break;
        case 'dmstuff':
          //server has sent the dm sheet
          $('.btn.but_sheet').remove();       //remove load/create buttons on sheet load
          sheet.css('display', 'inline-block');    //unhide sheet]
          sheet.html(data.msg);   //add sheet to HTML
          raw_sheet = data.raw; //store JSON
          $('#dmtextarea').change(function(){
            raw_sheet['notes'] = $('#dmtextarea').val();
          });
          //get all the content divs for easy access later
          arrDmContentDiv = [$('.dmnotes'), $('.dmmonster'), $('.dmencounter')];//dm sheet div button
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

          $('#assBtn').click(function(){
            //console.log('clicked');
            if($('.assSec').css('display') != 'none'){
              $('.assSec').css('display', 'none');
              $('#assBtn').html('show');
            }else{
              $('.assSec').css('display', 'inherit');
              $('#assBtn').html('hide');
            }
          });

          $('#asbtn').click(function(){
            $('#asbtn').html('Ability Scores~');
            $('#tsbtn').html('Throws/Skills');
            $('.aswin').attr('id', 'shown');
            $('.tswin').attr('id', 'hidden');
          });

          $('#tsbtn').click(function(){
            $('#asbtn').html('Ability Scores');
            $('#tsbtn').html('Throws/Skills~');
            $('.aswin').attr('id', 'hidden');
            $('.tswin').attr('id', 'shown');
          });

          $('#sltBtn').click(function(){
            //console.log('clicked');
            if($('.sltSec').css('display') != 'none'){
              $('.sltSec').css('display', 'none');
              $('#sltBtn').html('show');
            }else{
              $('.sltSec').css('display', 'inherit');
              $('#sltBtn').html('hide');
            }
          });

          $('#sensebtn').click(function(){
            $('#sensebtn').html('Senses~');
            $('#langbtn').html('Lang');
            $('#traitbtn').html('Traits');
            $('.senseswin').attr('id', 'shown');
            $('.langwin').attr('id', 'hidden');
            $('.traitwin').attr('id', 'hidden');
          });

          $('#langbtn').click(function(){
            $('#sensebtn').html('Senses');
            $('#langbtn').html('Lang~');
            $('#traitbtn').html('Traits');
            $('.senseswin').attr('id', 'hidden');
            $('.langwin').attr('id', 'shown');
            $('.traitwin').attr('id', 'hidden');
          });

          $('#traitbtn').click(function(){
            $('#sensebtn').html('Senses');
            $('#langbtn').html('Lang');
            $('#traitbtn').html('Traits~');
            $('.senseswin').attr('id', 'hidden');
            $('.langwin').attr('id', 'hidden');
            $('.traitwin').attr('id', 'shown');
          });

          $('#arlBtn').click(function(){
            //console.log('clicked');
            if($('.arlSec').css('display') != 'none'){
              $('.arlSec').css('display', 'none');
              $('#arlBtn').html('show');
            }else{
              $('.arlSec').css('display', 'inherit');
              $('#arlBtn').html('hide');
            }
          });

          $('#actionbtn').click(function(){
            $('#actionbtn').html('Actions~');
            $('#reactionbtn').html('Reactions');
            $('#legendbtn').html('Legend');
            $('.actionswin').attr('id', 'shown');
            $('.reactionwin').attr('id', 'hidden');
            $('.legendwin').attr('id', 'hidden');
          });

          $('#reactionbtn').click(function(){
            $('#actionbtn').html('Actions');
            $('#reactionbtn').html('Reactions~');
            $('#legendbtn').html('Legend');
            $('.actionswin').attr('id', 'hidden');
            $('.reactionwin').attr('id', 'shown');
            $('.legendwin').attr('id', 'hidden');
          });

          $('#legendbtn').click(function(){
            $('#actionbtn').html('Actions');
            $('#reactionbtn').html('Reactions');
            $('#legendbtn').html('Legend~');
            $('.actionswin').attr('id', 'hidden');
            $('.reactionwin').attr('id', 'hidden');
            $('.legendwin').attr('id', 'shown');
          });

          $('#rivBtn').click(function(){
            //console.log('clicked');
            if($('.rivSec').css('display') != 'none'){
              $('.rivSec').css('display', 'none');
              $('#rivBtn').html('show');
            }else{
              $('.rivSec').css('display', 'inherit');
              $('#rivBtn').html('hide');
            }
          });

          $('#resistbtn').click(function(){
            $('#resistbtn').html('Resist~');
            $('#immunebtn').html('Immune');
            $('#vulnerbtn').html('Vulner');
            $('.resistwin').attr('id', 'shown');
            $('.immunewin').attr('id', 'hidden');
            $('.vulnerwin').attr('id', 'hidden');
          });

          $('#immunebtn').click(function(){
            $('#resistbtn').html('Resists');
            $('#immunebtn').html('Immune~');
            $('#vulnerbtn').html('Vulner');
            $('.resistwin').attr('id', 'hidden');
            $('.immunewin').attr('id', 'shown');
            $('.vulnerwin').attr('id', 'hidden');
          });

          $('#vulnerbtn').click(function(){
            $('#resistbtn').html('Resist');
            $('#immunebtn').html('Immune');
            $('#vulnerbtn').html('Vulner~');
            $('.resistwin').attr('id', 'hidden');
            $('.immunewin').attr('id', 'hidden');
            $('.vulnerwin').attr('id', 'shown');
          });

          //attaches a change event to all new monster text fields so we can tell when a monster needs to be Saved
          //and when it gets saved
          //this may need some modification so it gets set off when a sense, language, trait, or etc gets added
          var attachChangeEvent = function(){
            $('.newMonsterTextField').change(function(){
              monsterName = $('input[name=name]').val();
              //console.log($('#div-' + monsterName + '-btn').html() + ' has changed');
              $('#div-' + monsterName + '-btn').html(monsterName + '***');
            });
            $('.newMonsterTextArea').change(function(){
              monsterName = $('input[name=name]').val();
              //console.log($('#div-' + monsterName + '-btn').html() + ' has changed');
              $('#div-' + monsterName + '-btn').html(monsterName + '***');
            });
            $('.newMonsterHD').change(function(){
              monsterName = $('input[name=name]').val();
              //console.log($('#div-' + monsterName + '-btn').html() + ' has changed');
              $('#div-' + monsterName + '-btn').html(monsterName + '***');
            });
          }

          var loadNewMonsterEdit = function(){
            $('#monstername').css('color', '');//clear css color just in case it got changed to red
            currentMonsterEdit = newMonsterEdit;
            $('#monstername').html('Name: <input type=\'text\' name=\'name\' class=\'newMonsterTextField\' placeholder=\'Monster Name\' value=\'\'>');
            $('#rating').html('Rating: ' + currentMonsterEdit.c_rating);
            $('#type').html('Type: ' + currentMonsterEdit.type);
            $('#size').html('Size: ' + currentMonsterEdit.size);
            $('#ac').html('AC: ' + currentMonsterEdit.ac);
            $('#speed').html('Speed: ' + currentMonsterEdit.speed);
            $('#health').html('Health: ' + currentMonsterEdit.hp);
            $('#hit_dice').html('Hit Dice: ' + currentMonsterEdit.hit_dice.number + 'd' + currentMonsterEdit.hit_dice.value);
            $('#alignment').html('Alignment: ' + currentMonsterEdit.alignment);
            //console.log(currentMonsterEdit);
            //ability scores
            for(ability in currentMonsterEdit.ability_scores){
              $('#ability-scores-' + ability + '-mod').css('display', 'none');
              //console.log(currentMonsterEdit.ability_scores[ability]);
              $('#ability-scores-' + ability).html(ability.charAt(0).toUpperCase() + ability.slice(1,3) + ': ' + currentMonsterEdit.ability_scores[ability]);
            }
            //saving Throws
            for(sthrow in currentMonsterEdit.saving_throws){
              $('#throws-' + sthrow).html(sthrow.charAt(0).toUpperCase() + sthrow.slice(1,3) + ': ' + currentMonsterEdit.saving_throws[sthrow]);
            }

            //load in senses
            //clear sense list
            $('#senseList').html('Sense List:');

            for(sense in currentMonsterEdit.senses){
              var newRow = $('<div class=\'row\'></div>');
              var newSenseName = $('<div class=\'col col-md-6\' id=\'senseName\'></div>');
              var newSenseValue = $('<div class=\'col col-md-6\' id=\'senseValue\'></div>');
              //console.log(currentMonsterEdit.senses[sense].sense + '>>' + currentMonsterEdit.senses[sense].value);
              newSenseName.html('Name: ' + currentMonsterEdit.senses[sense].sense);
              newSenseValue.html('Value: ' + currentMonsterEdit.senses[sense].value);
              newRow.append(newSenseName);
              newRow.append(newSenseValue);
              $('#senseList').append(newRow);
            }

            //load in Languages
            $('#langList').html('Language List:');
            for(lang in currentMonsterEdit.languages){
              var newRowl = $('<div class=\'row\'></div>');
              var newLangNamel = $('<div class=\'col col-md-6\' id=\'langName\'></div>');
              var newLangSl = $('<div class=\'col col-md-3\' id=\'langSpeak\'></div>');
              var newLangUl = $('<div class=\'col col-md-3\' id=\'langUnstd\'></div>');
              //console.log(currentMonsterEdit.senses[sense].sense + '>>' + currentMonsterEdit.senses[sense].value);
              newLangNamel.html('Language: ' + currentMonsterEdit.languages[lang].language);
              newLangSl.html('Speak: ' + currentMonsterEdit.languages[lang].speak);
              newLangUl.html('Understand: ' + currentMonsterEdit.languages[lang].understand);
              newRowl.append(newLangNamel);
              newRowl.append(newLangSl);
              newRowl.append(newLangUl);
              $('#langList').append(newRowl);
            }

            //load in Traits
            //clear trait list
            $('#traitList').html('Trait List:');
            console.log(currentMonsterEdit.special_traits);
            for(trait in currentMonsterEdit.special_traits){
              var newRow = $('<div class=\'row\'></div>');
              var newTraitName = $('<div class=\'col col-md-5\' id=\'traitName\'></div>');
              var newTraitNote = $('<div class=\'col col-md-7\' id=\'traitNote\'></div>');
              //console.log(currentMonsterEdit.senses[sense].sense + '>>' + currentMonsterEdit.senses[sense].value);
              newTraitName.html('Trait: ' + currentMonsterEdit.special_traits[trait].trait);
              newTraitNote.html('Description: ' + currentMonsterEdit.special_traits[trait].notes);
              newRow.append(newTraitName);
              newRow.append(newTraitNote);
              $('#traitList').append(newRow);
            }
            attachChangeEvent();
          }
          //loads the monster editing html by default
          loadNewMonsterEdit();
          $('#newmonsterbtn').click(loadNewMonsterEdit);

          //loads the monster to edit based on what div button was pressed
          var loadMonsterEdit = function(){
            //console.log($(this).html());
            $('#monstername').css('color', '');//clear css color just in case it got changed to red
            currentMonsterEdit = raw_sheet.monsters[$(this).html()];
            //console.log(currentMonsterEdit);
            $('#monstername').html('Name: <input type=\'text\' name=\'name\' class=\'newMonsterTextField\' placeholder=\'Monster Name\' value=' + $(this).html() + '>');
            //console.log(currentMonsterEdit.type);
            $('#type').html('Type:  <input type=\'text\' name=\'type\' class=\'newMonsterTextField\' placeholder=\'Monster Type\' value=\'' + currentMonsterEdit.type + '\'>');
            $('#size').html('Size: <input type=\'text\' name=\'size\' class=\'newMonsterTextField\' placeholder=\'Size\' value=' + currentMonsterEdit.size + '>');
            $('#ac').html('AC: <input type=\'text\' name=\'ac\' class=\'newMonsterTextField\' placeholder=\'AC\' value=' + currentMonsterEdit.ac + '>');
            $('#speed').html('Speed: <input type=\'text\' name=\'speed\' class=\'newMonsterTextField\' placeholder=\'Speed\' value=' + currentMonsterEdit.speed + '>');
            $('#health').html('Health: <input type=\'text\' name=\'hp\' class=\'newMonsterTextField\' placeholder=\'Hp\' value=' + currentMonsterEdit.hp + '>');
            $('#hit_dice').html('Hit Dice: <input type=\'text\' name=\'hdnumber\' class=\'newMonsterHD\' value=' +  currentMonsterEdit.hit_dice.number + '>d<input type=\'text\' name=\'hdvalue\' class=\'newMonsterHD\' value=' + currentMonsterEdit.hit_dice.value + '>');
            $('#rating').html('Rating: <input type=\'text\' name=\'c_rating\' class=\'newMonsterTextField\' placeholder=\'Rating\' value=' + currentMonsterEdit.c_rating + '>');
            $('#alignment').html('Alignment: <input type=\'text\' name=\'alignment\' class=\'newMonsterTextField\' placeholder=\'Moral Alignment\' value=\'' + currentMonsterEdit.alignment + '\'>');
            //console.log(currentMonsterEdit);
            for(ability in currentMonsterEdit.ability_scores){
              //console.log(currentMonsterEdit.ability_scores[ability]);
              $('#ability-scores-' + ability).html(ability.charAt(0).toUpperCase() + ability.slice(1,3) + ': <input type=\'text\' name=' + ability + ' class=\'newMonsterTextField\' value=' + currentMonsterEdit.ability_scores[ability] + '>');
              var stat = currentMonsterEdit.ability_scores[ability];
              $('#ability-scores-' + ability + '-mod').html('Mod: ' + Math.floor((parseInt((stat == '') ? '0' : stat) - 10) / 2).toString());
              $('#ability-scores-' + ability + '-mod').css('display', 'inline-block');
            }
            //load in saving Throws
            for(sthrow in currentMonsterEdit.saving_throws){
              $('#throws-' + sthrow).html(sthrow.charAt(0).toUpperCase() + sthrow.slice(1,3) + ': <input type=\'text\' name=throw-' + sthrow + ' class=\'newMonsterTextField\' value=' + currentMonsterEdit.saving_throws[sthrow] + '>');
            }

            //load in senses
            //clear sense list
            $('#senseList').html('Sense List:');
            console.log(currentMonsterEdit.senses);
            for(sense in currentMonsterEdit.senses){
              var newRow = $('<div class=\'row\'></div>');
              var newSenseName = $('<div class=\'col col-md-6\' id=\'senseName\'></div>');
              var newSenseValue = $('<div class=\'col col-md-6\' id=\'senseValue\'></div>');
              //console.log(currentMonsterEdit.senses[sense].sense + '>>' + currentMonsterEdit.senses[sense].value);
              newSenseName.html('Name: <input type=\'text\' name=\'sense\' class=\'newMonsterTextField\' placeholder=\'Sense\' value=\'' + currentMonsterEdit.senses[sense].sense + '\'>');
              newSenseValue.html('Value: <input type=\'text\' name=\'value\' class=\'newMonsterTextField\' placeholder=\'Value\' value=\'' + currentMonsterEdit.senses[sense].value + '\'>');
              newRow.append(newSenseName);
              newRow.append(newSenseValue);
              $('#senseList').append(newRow);
            }
            //add in empty sense row
            var newRow = $('<div class=\'row\'></div>');
            var newSenseName = $('<div class=\'col col-md-6\' id=\'senseName\'></div>');
            var newSenseValue = $('<div class=\'col col-md-6\' id=\'senseValue\'></div>');
            //console.log(newMonsterEdit.senses[sense].sense + '>>' + currentMonsterEdit.senses[sense].value);
            newSenseName.html('Name: ' + newMonsterEdit.senses[0].sense);
            newSenseValue.html('Value: ' + newMonsterEdit.senses[0].value);
            newRow.append(newSenseName);
            newRow.append(newSenseValue);
            $('#senseList').append(newRow);

            //console.log(currentMonsterEdit.languages);
            //load in languages
            $('#langList').html('Language List:');
            for(lang in currentMonsterEdit.languages){
              var newRowf = $('<div class=\'row\'></div>');
              var newLangNamef = $('<div class=\'col col-md-6\' id=\'langName\'></div>');
              var newLangSf = $('<div class=\'col col-md-3\' id=\'langSpeak\'></div>');
              var newLangUf = $('<div class=\'col col-md-3\' id=\'langUnstd\'></div>');
              console.log(currentMonsterEdit.languages[lang].language);
              newLangNamef.html('Language: <input type=\'text\' name=\'language\' class=\'newMonsterTextField\' placeholder=\'Language\' value=\'' + currentMonsterEdit.languages[lang].language + '\'>');
              newLangSf.html('Speak: <input type=\'text\' name=\'speak\' class=\'newMonsterTextField\' placeholder=\'Yes/No\' value=\'' + currentMonsterEdit.languages[lang].speak + '\'>');
              newLangUf.html('Undstnd: <input type=\'text\' name=\'understand\' class=\'newMonsterTextField\' placeholder=\'Yes/No\' value=\'' + currentMonsterEdit.languages[lang].understand + '\'>');
              newRowf.append(newLangNamef);
              newRowf.append(newLangSf);
              newRowf.append(newLangUf);
              $('#langList').append(newRowf);
            }
            //add in empty language row
            var newRowe = $('<div class=\'row\'></div>');
            var newLangNamee = $('<div class=\'col col-md-6\' id=\'langName\'></div>');
            var newLangSe = $('<div class=\'col col-md-3\' id=\'langSpeak\'></div>');
            var newLangUe = $('<div class=\'col col-md-3\' id=\'langUnstd\'></div>');
            //console.log(currentMonsterEdit.senses[sense].sense + '>>' + currentMonsterEdit.senses[sense].value);
            newLangNamee.html('Language: ' + newMonsterEdit.languages[0].language);
            newLangSe.html('Speak: ' + newMonsterEdit.languages[0].speak);
            newLangUe.html('Undstnd: ' + newMonsterEdit.languages[0].understand);
            newRowe.append(newLangNamee);
            newRowe.append(newLangSe);
            newRowe.append(newLangUe);
            $('#langList').append(newRowe);

            //load in Traits
            //clear trait list
            $('#traitList').html('Trait List:');
            console.log(currentMonsterEdit.special_traits);
            for(trait in currentMonsterEdit.special_traits){
              var newRow = $('<div class=\'row\'></div>');
              var newTraitName = $('<div class=\'col col-md-5\' id=\'traitName\'></div>');
              var newTraitNote = $('<div class=\'col col-md-7\' id=\'traitNote\'></div>');
              //console.log(currentMonsterEdit.senses[sense].sense + '>>' + currentMonsterEdit.senses[sense].value);
              newTraitName.html('Trait: <input type=\'text\' name=\'trait\' class=\'newMonsterTextField\' placeholder=\'Sense\' value=\'' + currentMonsterEdit.special_traits[trait].trait + '\'>');
              newTraitNote.html('Description: <textarea name=\'notes\' class=\'newMonsterTextArea\' placeholder=\'Description of trait...\'>' + currentMonsterEdit.special_traits[trait].notes + '</textarea>');
              newRow.append(newTraitName);
              newRow.append(newTraitNote);
              $('#traitList').append(newRow);
            }
            //add in empty sense row
            var newRow = $('<div class=\'row\'></div>');
            var newTraitName = $('<div class=\'col col-md-5\' id=\'traitName\'></div>');
            var newTraitNote = $('<div class=\'col col-md-7\' id=\'traitNote\'></div>');
            //console.log(newMonsterEdit.senses[sense].sense + '>>' + currentMonsterEdit.senses[sense].value);
            newTraitName.html('Name: ' + newMonsterEdit.special_traits[0].trait);
            newTraitNote.html('Value: ' + newMonsterEdit.special_traits[0].notes);
            newRow.append(newTraitName);
            newRow.append(newTraitNote);
            $('#traitList').append(newRow);

            attachChangeEvent();
          }

          $('#addSense').click(function(){
            //console.log('clicked addSense');
            //save previously added row
            sName = $('#senseList').last().find('#senseName').children().val();
            sValue = $('#senseList').last().find('#senseName').children().val();
            if(sName == '') return;
            currentMonsterEdit.senses.push({'sense' : sName, 'value': sValue});
            //make new row
            var newRow = $('<div class=\'row\'></div>');
            var newSenseName = $('<div class=\'col col-md-6\' id=\'senseName\'></div>');
            var newSenseValue = $('<div class=\'col col-md-6\' id=\'senseValue\'></div>');
            //console.log(newMonsterEdit.senses[sense].sense + '>>' + currentMonsterEdit.senses[sense].value);
            newSenseName.html('Name: ' + newMonsterEdit.senses[0].sense);
            newSenseValue.html('Value: ' + newMonsterEdit.senses[0].value);
            newRow.append(newSenseName);
            newRow.append(newSenseValue);
            $('#senseList').append(newRow);

            attachChangeEvent();
          });

          $('#addLang').click(function(){
            //console.log()
            //save previously added row
            var lName1 = $('#langList').last().find('#langName').children().val();
            var lSpeak1 = $('#langList').last().find('#langSpeak').children().val();
            var lUnstd1 = $('#langList').last().find('#langUnstd').children().val();
            console.log('>' + lName1);
            if(lName1 == '') return;
            currentMonsterEdit.languages.push({'language' : lName1, 'speak': lSpeak1, 'understand': lUnstd1});

            //add in empty language row
            var newRow1 = $('<div class=\'row\'></div>');
            var newLangName1 = $('<div class=\'col col-md-6\' id=\'langName\'></div>');
            var newLangS1 = $('<div class=\'col col-md-3\' id=\'langSpeak\'></div>');
            var newLangU1 = $('<div class=\'col col-md-3\' id=\'langUnstd\'></div>');
            //console.log(currentMonsterEdit.senses[sense].sense + '>>' + currentMonsterEdit.senses[sense].value);
            newLangName1.html('Language: ' + newMonsterEdit.languages[0].language);
            newLangS1.html('Speak: ' + newMonsterEdit.languages[0].speak);
            newLangU1.html('Undstnd: ' + newMonsterEdit.languages[0].understand);
            newRow1.append(newLangName1);
            newRow1.append(newLangS1);
            newRow1.append(newLangU1);
            $('#langList').append(newRow1);

            attachChangeEvent();
          });

          $('#addTrait').click(function(){
            //console.log('clicked addSense');
            //save previously added row
            tName = $('#traitList').last().find('#traitName').children().val();
            tNote = $('#traitList').last().find('#traitNote').children().val();
            if(tName == '') return;
            currentMonsterEdit.special_traits.push({'trait' : tName, 'notes': tNote});
            //add in empty trait row
            var newRow = $('<div class=\'row\'></div>');
            var newTraitName = $('<div class=\'col col-md-5\' id=\'traitName\'></div>');
            var newTraitNote = $('<div class=\'col col-md-7\' id=\'traitNote\'></div>');
            //console.log(newMonsterEdit.senses[sense].sense + '>>' + currentMonsterEdit.senses[sense].value);
            newTraitName.html('Name: ' + newMonsterEdit.special_traits[0].trait);
            newTraitNote.html('Value: ' + newMonsterEdit.special_traits[0].notes);
            newRow.append(newTraitName);
            newRow.append(newTraitNote);
            $('#traitList').append(newRow);

            attachChangeEvent();
          });

          $('#addmonsterbtn').click(function(){
            //the monster should at least have a name for it to be added.
            //maybe have a 'complete' flag that is false if any needed info is missing so we don't add an incomplete monster to the Encounter
            monsterName = $('input[name=name]').val();
            if(monsterName == ''){
              $('#monstername').css('color', 'red');
              return;
            }else{
              $('#monstername').css('color', '');
            }

            //copy the newMonsterObject
            monsterToSave = JSON.parse(JSON.stringify(newMonsterEdit));
            //update object with fields that have been entered
            for(attr in monsterToSave)
            {
              switch(attr){
                case 'hit_dice':
                  monsterToSave['hit_dice']['number'] = $('input[name=hdnumber]').val();
                  monsterToSave['hit_dice']['value'] = $('input[name=hdvalue]').val();
                  break;
                case 'ability_scores':
                  for(as in monsterToSave['ability_scores']){
                    //console.log(as + ' >> ' + $('input[name=' + as + ']').val());
                    monsterToSave['ability_scores'][as] = $('input[name=' + as + ']').val();
                  }
                  break;
                case 'saving_throws':
                  for(th in monsterToSave['saving_throws']){
                    //console.log(as + ' >> ' + $('input[name=' + as + ']').val());
                    monsterToSave['saving_throws'][th] = $('input[name="throw-' + th + '"]').val();
                  }
                  break;
                case 'skills':
                  break;
                case 'resistances':
                  break;
                case 'vulnerabilities':
                  break;
                case 'immunities':
                  break;
                case 'senses':
                  //clear senses array
                  monsterToSave['senses'].splice(0,monsterToSave['senses'].length);
                  $('#senseList').children().each(function(){
                    var sName = $(this).find('#senseName').children().val();
                    var sVal = $(this).find('#senseValue').children().val();
                    console.log(sName + ">>" + sVal);
                    if(sName == '') return;
                    monsterToSave['senses'].push({'sense': sName, 'value': sVal});
                  });
                  break;
                case 'languages':
                  monsterToSave['languages'].splice(0,monsterToSave['languages'].length);
                  $('#langList').children().each(function(){
                    let lName = $(this).find('#langName').children().val();
                    let lSpk = $(this).find('#langSpeak').children().val();
                    let lUnd = $(this).find('#langUnstd').children().val();
                    console.log(lName);
                    if(lName == '') return;
                    monsterToSave['languages'].push({'language': lName, 'speak': lSpk, 'understand': lUnd});
                  });
                  break;
                case 'telepathy':
                  break;
                case 'special_traits':
                  //clear senses array
                  monsterToSave['special_traits'].splice(0,monsterToSave['special_traits'].length);
                  $('#traitList').children().each(function(){
                    var tName = $(this).find('#traitName').children().val();
                    var tNote = $(this).find('#traitNote').children().val();
                    //console.log(sName + ">>" + sVal);
                    if(tName == '') return;
                    monsterToSave['special_traits'].push({'trait': tName, 'notes': tNote});
                  });
                  break;
                case 'actions':
                  break;
                case 'reactions':
                  break;
                case 'legendary_actions':
                  break;
                default:
                  //console.log(attr + ' >> ' + $('input[name=' + attr + ']').val());
                  monsterToSave[attr] = $('input[name=' + attr + ']').val();
                  break;
              }
            }
            //did monster exist
            if(!raw_sheet['monsters'].hasOwnProperty(monsterName)){//if monster already exists we were just updating it so don't add a new div
              //add new div button for the monster to each monster list element
              var newdiv = $('<div class=\'col\' id=\'div-'+monsterName+'-btn\'>' + monsterName + '</div>');
              newdiv.click(loadMonsterEdit);
              $('#mmonsterlist').append(newdiv);
            }else{
              var str = $('#div-' + monsterName + '-btn').html();
              if(str.slice(-1) === '*'){
                str = str.slice(0, -3);
                console.log(str);
                $('#div-' + monsterName + '-btn').html(str);
              }
            }
            //add new monster to the raw json
            raw_sheet['monsters'][monsterName] = monsterToSave;
            console.log(raw_sheet['monsters'][monsterName]);
          });
          //get monster divs from monster list in the edit monster div
          $('#mmonsterlist').children('div').each(function(){
            //the next div is the one with the json in it
            //var monsterjson = JSON.parse($(this).children().html());
            $(this).click(loadMonsterEdit);
            $(this).attr('id', 'div-' + $(this).html() + '-btn');
          });
          //get monster divs from monster list in the encounter div
          $('#emonsterlist').children('div').each(function(){
            //the next div is the one with the json in it
            //var monsterjson = JSON.parse($(this).children().html());
            $(this).click(function(){
              //console.log($(this).html());
              $('#dmmonsterinfo').html($(this).html());
            });
          });
          break;
      }
    }

    //function to deal with player adding in csv item (e.g. languages)
    function add_comma_val(but_id, sheet_json) {
      //insert text box for entering in new value
      //form new ids for input based on button clicked
      let in_id = this.id + "_input";
      let sub_id = this.id + "_sub";
      var j_key = "";
      var in_field = "";
      var sheet_json = sheet_json;
      //first check if an input has already been created, if so, output error
      //should submit that one first
      if ($('#' + in_id).length) {
        in_field = $('#' + in_id);
        in_field[0].setCustomValidity('Must submit before creating new');
        in_field[0].reportValidity();
        return;
      }
      $('#' + but_id).before(`<input class="in add_text add_com" id=${in_id}` +
      ` placeholder="Enter new element..."><button class = "btn add_text sub_com"
      id=${sub_id}>Submit</button>`);
      //register handler for newly created field + button if a add on is submitted
      $('#' + sub_id).click(function() {
        let in_id = this.id.replace('sub', 'input');
        in_field = $('#' + in_id).val();
        //must be non empty
        if (in_field.length == 0) {
          $('#' + in_id)[0].setCustomValidity("Input must not be empty");
          $('#' + in_id)[0].reportValidity();
          return;
        }
        $('#' + in_id)[0].setCustomValidity("");
        $('#' + in_id).val(''); //clear
        submit = true;
        //closest div up in hierarchy will be where to add text
        let parent = $('#' + in_id).closest('div');
        //remove unneeded fields
        $('#' + sub_id).remove();
        $('#' + in_id).remove();
        //find button in div to where to add text before
        let but_child = parent.children('button');
        //must add to HTML and JSON
        let first = false;
        j_key = get_key(parent[0].id);
        if (!sheet_json.hasOwnProperty(j_key)) {
          // if no props added yet, add array, also output is different
          first = true;
          sheet_json[j_key] = [];
        }
        if (first) {
          $(but_child).before(in_field);
        } else {
          $(but_child).before(', ' + in_field);
        }
        sheet_json[j_key].push(in_field);
        let msg = JSON.stringify({type: 'change_text', attr: j_key, change: in_field});
        socket.send(msg);         //send update to server
      });
      return sheet_json;
    }

    //helper to deal with player adding a gem
    function add_gem(but_id, sheet_json, full_sheet) {
      //form new ids for input based on button clicked
      let in_id = but_id + "_input";
      let num_id = but_id + "_num";
      let sub_id = but_id + "_sub";
      var in_field = "";
      var num_field = "";
      var sheet_json = sheet_json;
      //first check if an input has already been created, if so, output error
      //should submit that one first
      if ($('#' + in_id).length || $('#' + num_id).length) {
        in_field = $('#' + in_id);
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
        in_field = $('#' + in_id).val();
        num_field = $('#' + num_id).val();
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
        if (!sheet_json.hasOwnProperty('treasures')) {
          //create if not already there
          sheet_json['treasures'] = {};
        }
        if (!sheet_json['treasures'].hasOwnProperty('gems')) {
          //create if not already there
          sheet_json['treasures']['gems'] = [];
        }
        sheet_json['treasures']['gems'].push(gem_obj);
        if (full_sheet) {
          //now add to options for increase/decrease IF it's not just sheet creation
          let gem_html = `<option value="${in_field}">${in_field}</option>`;
          $('#change_attrs').append(gem_html);
        }
        let msg = JSON.stringify({type: 'add_gem', attr: in_field, change: num_field});
        socket.send(msg);
      });
      return sheet_json;
    }

    //helper to deal with a player adding a table item (i.e. weapon, spell, item)
    function add_item(but_id, sheet_json, full_sheet) {
      let sub_id = but_id + "_sub";  //id of submit button, all types have one
      let name_id = but_id + "_name"; //same w name
      let ran_id = "";
      let not_id = "";
      var sheet_json = sheet_json;
      var item_type = "";       //weapon, item, spell
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
            if (!sheet_json.hasOwnProperty('weps')) {
              sheet_json['weps'] = [];
            }
            sheet_json['weps'].push(wep_obj);      //save newly created weapon object
            //remove submit button for now
            let parent = this.closest('.row');   //start nearest row, remove all children
            $(parent).children().remove();
            $(parent).remove();
            item_type = "Weapons";
            let msg = JSON.stringify({type: 'add_item', name: name_field, it_type: item_type});
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
            if (!sheet_json.hasOwnProperty('spells')) {
              sheet_json['spells'] = [];
            }
            sheet_json['spells'].push(spell_obj);        //save new spell
            //remove submit button for now
            parent = this.closest('.row');   //start nearest row, remove all children + row
            $(parent).children().remove();
            $(parent).remove();
            item_type = "Spells";
            let msg = JSON.stringify({type: 'add_item', name: name_field, it_type: item_type});
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
            submit = true;
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
            if (full_sheet) {
              //since item added, we must update current carry weight ONLY IF NOT CREATION
              let curr_weight = Number($('#weight_total').html().match(/\d+/g));
              curr_weight += Number(weight_field);
              $('#weight_total').html(curr_weight);
            }
            if (!sheet_json.hasOwnProperty('items')) {
              sheet_json['items'] = [];
            }
            sheet_json['items'].push(item_obj);
            //remove submit button for now
            let parent = this.closest('.row');   //start nearest row, remove all children
            $(parent).children().remove();
            $(parent).remove();
            item_type = "Items";
            let msg = JSON.stringify({type: 'add_item', name: name_field, it_type: item_type});
            socket.send(msg);
          });
          break;
      }
      //return attrs in array for easy socket messages
      return sheet_json;
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
      mod_val = mod != "none" ? raw_sheet['ability-scores'][mod] : 0;
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
          if(attr == 'dex') {
            //armor class based on dex modifier + 10, update
            let curr_ac = $('#armor').html();
            let new_ac = new_mod + 10;
            curr_ac = curr_ac.replace(/\d+/g, new_ac);
            $('#armor').html(curr_ac);
          }
          let curr_mod = $('#' + attr + '_mod').html();
          curr_mod = curr_mod.replace(/\d+/g, new_mod);
          $('#' + attr + '_mod').html(curr_mod);
          break;
        case 'hp':
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
      let mod_try = Math.floor((Number(stat_val)-10) / 2);
      //don't return negative
      return (mod_try >= 0) ? mod_try : 0;
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

    //handle if user wants to create a new psheet, get HTML of form from server
    $('#create_sheet').click(function() {
      //ask for blank html to fill out
      let msg = JSON.stringify({type: 'get_blank'});
      socket.send(msg);
    });

    //handle if user wants to load a saved psheet, must ask server to load list of all
    $('#load_sheet').click(function() {
      //ask for list of all sheets owned by user
      let msg = JSON.stringify({type: 'load_sheets'});
      socket.send(msg);
    });

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
