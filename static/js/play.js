var socket;
var uname;
var roomname;
var isPlayer;
var dice_data = [0, 0, 0, 0, 0, 0]; // d4, d6, d8, d10, d12, d20

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
    var raw_sheet = {}; //JSON version of sheet, use for updates during session, send back to server at end for updating in DB
    var l2x;      //used for players that need xp for next level, map level to needed XP
    var cond_list = ['Normal', 'Blinded', 'Charmed', 'Deafened', 'Fatigued', 'Frightened', 'Grappled',
    'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained',
    'Stunned', 'Unconscious'];  //list of all possible conditions, use for list
    var box_to_but = {'pinfo': 'show_info', 'pstats': 'show_stats', 'pws': 'show_ws',
    'pitems': 'show_items'};
    //all possible boxes to buts, use for tabs
    var but_to_box = {'show_info': 'pinfo', 'show_stats': 'pstats', 'show_ws': 'pws',
    'show_items': 'pitems'};      //map buttons to corresponding boxes

    var clients = {};

    //DM variables
    var newMonsterEdit = { //new monster info that gets input into the html
      'size':'', 'type':'', 'alignment': '', 'ac': '', 'hp': '',
      'hit_dice': { 'number': '', 'value' : '', },
      'speed': {'walking': '', 'burrow': '', 'climbing': '', 'flying': '', 'swimming': '', 'hover': ''},
      'ability_scores' : { 'str' : '', 'dex' : '', 'const' : '', 'intell': '', 'wis' : '', 'char' : '' },
      'saving_throws' : { 'str' : '', 'dex' : '', 'const' : '', 'intell': '', 'wis' : '', 'char' : '' },
      'c_rating' : '', 'skills' : [{'skill': '', 'value': ''}],
      'resistances' : [], 'vulnerabilities' : [], 'immunities' : [],
      'senses' : [{'sense': '', 'value': ''}],
      'languages' : [{ 'language':'', 'speak': '', 'understand': '' }],
      'special_traits' : [{ 'trait': '', 'notes': '' }],
      'actions' : [], 'reactions' : [], 'legendary_actions' : {'num_action' : '', 'actions' : [] }
    };
    var currentMonsterEdit; //the monster that is currently being edited
    var currentMonsterTurn; //the monster whose turn it is

    //we got some bugs with strings that had spaces in them so this function replaces spaces twith dashes
    var spaceToDash = function(string){
      return string.replace(/ /g, "-");
    }

    //resize stuff
    var sheetSize = 0.9; //this is a percent
    $('#chatbox').height($(window).height() / 2);
    $('#chatlog').css('max-height', $('#chatbox').height());
    sheet.height($(window).height() * sheetSize);
    $(window).resize(function(){
      $('#chatbox').height($(window).height() / 2);
      $('#chatlog').css('max-height', $('#chatbox').height());
      sheet.height($(window).height() * sheetSize);
    });
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
        case 'joined':
          //do nothing
          break;
        case 'status':
          $('#chatlog').append('<p style=\'color:' + data.color + ';' + 'font-weight:' + data.weight +'\'>&lt;' + data.msg + '&gt;</p>');
          $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
          if(data.hasOwnProperty('uname') && data.hasOwnProperty('cname')){//joining
            clients[data.uname] = data.cname;
          }
          else if(data.hasOwnProperty('uname') && !data.hasOwnProperty('cname')){//leaving
            delete clients[data.uname];
          }
          break;
        case 'chat':
          $('#chatlog').append('<p style=\'color:' + data.color + ';' + 'font-weight:' + data.weight +'\'>' + data.msg + '</p>');
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
          clients = data.clients; //store clients
          console.log(clients);
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

          //if user hovers over tab
          $('.showbox').hover(function() {
            $(this).css("background-color", "green");
          }, function() {
            $(this).css("background-color", "rgba(26, 26, 23, 0.96)");
          });

          //handle player wanting to switch tabs of psheet
          $('.showbox').click(function() {
            //set clicked to shown (if not already) and all others to hidden
            let but_id = this.id;      //which was clicked
            let box_id = but_to_box[but_id];   //get one to show
            // go thru and hide all other if not hidden
            for (let box of Object.keys(box_to_but)) {
              if (box === box_id) {
                continue; //one to show, don't hide
              }
              if ($('.' + box).attr('id') == 'shown') {
                //hide all other shown, mark as (click to view)
                $('.' + box).attr('id', 'hidden');
                let curr_but = box_to_but[box];
              }
            }
            if ($('.' + box_id).attr('id') == 'hidden') {
              //if not already shown, show the clicked box
              $('.' + box_id).attr('id', 'shown');
              let curr_html = $('#' + but_id).html();
              // active window, remove (click to view)
              $('#' + but_id).html(curr_html);
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

          //if user hovers over tab
          $('.showbox').hover(function() {
            $(this).css("background-color", "green");
          }, function() {
            $(this).css("background-color", "rgba(26, 26, 23, 0.96)");
          });

          //handle player wanting to switch tabs of psheet
          $('.showbox').click(function() {
            //set clicked to shown (if not already) and all others to hidden
            let but_id = this.id;      //which was clicked
            let box_id = but_to_box[but_id];   //get one to show
            // go thru and hide all other if not hidden
            for (let box of Object.keys(box_to_but)) {
              if (box === box_id) {
                continue; //one to show, don't hide
              }
              if ($('.' + box).attr('id') == 'shown') {
                //hide all other shown, mark as (click to view)
                $('.' + box).attr('id', 'hidden');
                let curr_but = box_to_but[box];
              }
            }
            if ($('.' + box_id).attr('id') == 'hidden') {
              //if not already shown, show the clicked box
              $('.' + box_id).attr('id', 'shown');
              let curr_html = $('#' + but_id).html();
              // active window, remove (click to view)
              $('#' + but_id).html(curr_html);
            }
          });

          //handle if user wants to add text in comma sep vals
          $('.btn.add_text.add_com').click(function() {
            let rv = add_comma_val(this.id, sheet_obj);
            if (typeof rv !== 'undefined') {
              sheet_obj = rv;
              console.log(sheet_obj); // DEBUG
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
          all_sheets += '<div class="row"><div class="col title"><button class="btn but_sheet title" id = "create_sheet">' +
          'Create New ' + (isPlayer ? 'Player' : 'DM') + ' Sheet</button></div></div>'; //add create sheet in case change mind
          sheet.html(all_sheets);       //display saved sheets for picking
          //handle if user wants to create a new psheet, get HTML of form from server
          $('#create_sheet').click(function() {
            //ask for blank html to fill out
            let msg = JSON.stringify({type: 'get_blank'});
            socket.send(msg);
          });
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
          sheet.css('display', 'inline-block');    //unhide sheet
          sheet.html(data.msg);   //add sheet to HTML
          raw_sheet = data.raw; //store JSON
          clients = data.clients; //store list of connected clients
          console.log(clients);
          //resizing STUFF
          $('#dmcontent').css('max-height', sheet.height() - $('#dm-title-row').height() - $('#dm-button-row').height());
          //adjust size of textarea
          $('#dmtextarea').css('min-height', $('#dmcontent').css('max-height'));
          //should override the original window.resize
          $(window).resize(function(){//doesnt override just does twice which doesn't really matter
            $('#chatbox').height($(window).height() / 2);
            $('#chatlog').css('max-height', $('#chatbox').height());
            sheet.height($(window).height() * sheetSize);
            $('#dmcontent').css('max-height', sheet.height() - $('#dm-title-row').height() - $('#dm-button-row').height());
            //adjust size of textarea
            $('#dmtextarea').css('min-height', $('#dmcontent').css('max-height'));// we want the text area to take up the full content window
          });

          //dm notes event listener
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
              $('#assBtn').html('+');
            }else{
              $('.assSec').css('display', 'inherit');
              $('#assBtn').html('-');
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
              $('#sltBtn').html('+');
            }else{
              $('.sltSec').css('display', 'inherit');
              $('#sltBtn').html('-');
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
              $('#arlBtn').html('+');
            }else{
              $('.arlSec').css('display', 'inherit');
              $('#arlBtn').html('-');
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
              $('#rivBtn').css('class', 'btn');
              $('#rivBtn').html('+');
            }else{
              $('.rivSec').css('display', 'inherit');
              $('#rivBtn').css('class', 'btn');
              $('#rivBtn').html('-');
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
            $('#resistbtn').html('Resist');
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
          var addInputChangeEvent = function(){//}
            $('input[class^="newMonster"]:not([name^="new"], [name^="as-"])').change(()=>{
              $('#div-' + spaceToDash($('input[name=name]').val()) + '-btn').css('color', 'red');
            });
            $('textarea[class^="newMonster"]:not([name^="new"])')
          }

          var addActionExpandEvent = function(){
            $('[id^="expand-"]').unbind('click');
            $('[id^="expand-"]').click(function(){
              //console.log('clicked');
              state = $(this).html();
              //console.log($(this));
              if(state === '+'){//expand
                $(this).html('-');
                aName = $(this).attr('id').split('expand-')[1];
                //console.log(aName);
                $('#info-' + aName).css('display', 'inline-block');
              }else if(state === '-'){//contract
                $(this).html('+');
                aName = $(this).attr('id').split('expand-')[1];
                //console.log(aName);
                $('#info-' + aName).css('display', 'none');
              }
            });
          }

          //ability score change event listener
          //automatically updates the ability scores' mod value
          //this doesn't work cause of adding the same listener multiple times
          $('input[name^="as-"]').change(function(){
            $('#div-' + spaceToDash($('input[name=name]').val()) + '-btn').css('color', 'red');
            $('input[name=' + $(this).attr('name') + '-mod]').val(getASModifier($(this).val()));
          });

          //if one of the add buttons is clicked then also say we need to save the monster
          $('div[id^="add"]').click(()=>{
            $('#div-' + spaceToDash($('input[name=name]').val()) + '-btn').css('color', 'red');
          });

          //action events stuffff
          //by default set everything to hidden
          $('#newWeaponAction').css('display', 'none');
          $('#newSpellAction').css('display', 'none');
          $('#newSavingAction').css('display', 'none');
          $('#newOtherAction').css('display', 'none');
          //save previous option
          var prevaction;
          $('#newActionType').on('focus', function(){
            prevaction = $(this).val() ? $(this).val() : "";
          }).change(function(){
            //console.log('prev: ' + prev);
            val = $(this).val();
            //console.log(val);
            //console.log('#new' + val.charAt(0).toUpperCase() + val.substring(1) + 'Action');
            $('#new' + val.charAt(0).toUpperCase() + val.substring(1) + 'Action').css('display', 'inline-block');
            if(prevaction != '') $('#new' + prevaction.charAt(0).toUpperCase() + prevaction.substring(1) + 'Action').css('display', 'none');
            prevaction = val;
          });

          //legendary action events stuff
          //by default set everything to hidden
          $('#newLWeaponAction').css('display', 'none');
          $('#newLSpellAction').css('display', 'none');
          $('#newLSavingAction').css('display', 'none');
          $('#newLOtherAction').css('display', 'none');
          //save previous option
          var prevlaction;
          $('#newLActionType').on('focus', function(){
            prevlaction = $(this).val() ? $(this).val() : "";
          }).change(function(){
            //console.log('prev: ' + prev);
            val = $(this).val();
            //console.log(val);
            //console.log('#new' + val.charAt(0).toUpperCase() + val.substring(1) + 'Action');
            $('#newL' + val.charAt(0).toUpperCase() + val.substring(1) + 'Action').css('display', 'inline-block');
            if(prevlaction != '') $('#newL' + prevlaction.charAt(0).toUpperCase() + prevlaction.substring(1) + 'Action').css('display', 'none');
            prevlaction = val;
          });

          //calculates the modifier for a given ability scores
          //this is probably a duplicate function but oh well
          var getASModifier = function(ability_score){
            var asInt = parseInt(ability_score);
            return (isNaN(asInt)) ? '' : Math.floor((asInt - 10) / 2).toString();
          }

          //this loads a monster given by the name
          //if the monster doesn't exist it will load a new monster
          var loadMonsterEdit = function(monsterName){
            $('#monstername').css('color', '');//clear css color just in case it got changed to red
            if(raw_sheet.monsters.hasOwnProperty(monsterName)){
              //console.log('loading ' + monsterName);
              currentMonsterEdit = raw_sheet.monsters[monsterName];
            }else{
              //console.log('loading new monster');
              //copy the newMonsterObject
              currentMonsterEdit = JSON.parse(JSON.stringify(newMonsterEdit));
            }
            $('input[name=name]').val(monsterName);
            $('input[name=c_rating]').val(currentMonsterEdit.c_rating);
            $('input[name=type]').val(currentMonsterEdit.type);
            $('input[name=size]').val(currentMonsterEdit.size);
            $('input[name=ac]').val(currentMonsterEdit.ac);
            //$('input[name=speed]').val(currentMonsterEdit.speed);
            $('input[name=hp]').val(currentMonsterEdit.hp);
            $('input[name=hdnumber]').val(currentMonsterEdit.hit_dice.number);
            $('input[name=hdvalue]').val(currentMonsterEdit.hit_dice.value);
            $('input[name=alignment]').val(currentMonsterEdit.alignment);
            //console.log(currentMonsterEdit);

            //load speeds
            $('input[name=wspeed]').val(currentMonsterEdit.speed['walking']);
            $('input[name=bspeed]').val(currentMonsterEdit.speed['burrow']);
            $('input[name=cspeed]').val(currentMonsterEdit.speed['climbing']);
            $('input[name=fspeed]').val(currentMonsterEdit.speed['flying']);
            $('input[name=sspeed]').val(currentMonsterEdit.speed['swimming']);
            $('input[name=hover]').prop('checked', (currentMonsterEdit.speed['hover'] === 'y'));

            //load legendary action num
            $('input[name=legendActions]').val(currentMonsterEdit.legendary_actions.num_actions);
            //ability scores
            for(ability in currentMonsterEdit.ability_scores){
              $('input[name=as-' + ability + ']').val(currentMonsterEdit.ability_scores[ability]);
              $('input[name=as-' + ability + '-mod]').val(getASModifier(currentMonsterEdit.ability_scores[ability]));
            }
            //saving Throws
            for(sthrow in currentMonsterEdit.saving_throws){
              $('input[name=throw-' + sthrow + ']').val(currentMonsterEdit.saving_throws[sthrow]);
            }

            //load in Skills
            $('#skillList').empty(); //makes sure the skill list gets cleared
            $('#skillList').html('Skill List: ');
            for(skill in currentMonsterEdit.skills){
              //if the skill doesn't have a name then don't add it
              if(currentMonsterEdit.skills[skill].skill == '') break;
              var skillRow = $(`<div class="row">
                                  <div class="col col-md-7">
                                    Name: <input type="text" class="newMonsterTextField" name="skillName" value="` + currentMonsterEdit.skills[skill].skill + `">
                                  </div>
                                  <div class="col col-md-5">
                                    Value: <input type="text" class="newMonsterTextField" name="skillValue" value="` + currentMonsterEdit.skills[skill].value + `">
                                  </div>
                                </div>`);
              $('#skillList').append(skillRow);
            }

            //load in senses
            $('#senseList').empty(); //makes sure the senselist gets cleared
            $('#senseList').html('Sense List:');
            for(sense in currentMonsterEdit.senses){
              //if the sense doesn't have a name don't add it
              if(currentMonsterEdit.senses[sense].sense == '') break;
              var senseRow = $(`<div class="row">
                                  <div class="col col-md-6">
                                    Name: <input type="text" class="newMonsterTextField" name="senseName" value="` + currentMonsterEdit.senses[sense].sense + `">
                                  </div>
                                  <div class="col col-md-6">
                                    Value: <input type="text" class="newMonsterTextField" name="senseValue" value="` + currentMonsterEdit.senses[sense].value + `">
                                  </div>
                                </div>`);
              $('#senseList').append(senseRow);
            }

            //load in Languages
            $('#langList').empty(); //clear the lang list
            $('#langList').html('Language List:');
            for(lang in currentMonsterEdit.languages){
              //if the language doesn't have a name don't add it
              if(currentMonsterEdit.languages[lang].language == '') break;
              var langRow = $(`<div class="row">
                                  <div class="col col-md-8">
                                    Lang: <input type="text" class="newMonsterTextField" name="langName" value="` + currentMonsterEdit.languages[lang].language + `">
                                  </div>
                                  <div class="col col-md-2">
                                    S: <input type="checkbox" class="newMonsterTextField" name="langS" ` + ((currentMonsterEdit.languages[lang].speak === 'y') ? `checked` : ``) + `>
                                  </div>
                                  <div class="col col-md-2">
                                    U: <input type="checkbox" class="newMonsterTextField" name="langU" ` + ((currentMonsterEdit.languages[lang].understand === 'y') ? `checked` : ``) + `>
                                  </div>
                                </div>`);
              $('#langList').append(langRow);
            }

            //load in Traits
            $('#traitList').empty(); //makes sure the traitlist gets cleared
            $('#traitList').html('Trait List:');
            for(trait in currentMonsterEdit.special_traits){
              //if the sense doesn't have a name don't add it
              if(currentMonsterEdit.special_traits[trait].trait == '') break;
              //construct html
              var traitRow = $(`<div class="row">
                                  <div class="col col-md-6">
                                    Trait: <input type="text" class="newMonsterTextField" name="traitName" value="` + currentMonsterEdit.special_traits[trait].trait + `">
                                  </div>
                                  <div class="col col-md-6">
                                    Desc: <textarea class="newMonsterTextArea" name="traitDesc" >` + currentMonsterEdit.special_traits[trait].notes + `</textarea>
                                  </div>
                                </div>`);
              $('#traitList').append(traitRow);
            }

            //load in Resistances
            $('#resistList').empty();//clear resist list
            $('#resistList').html('Resistances:');
            for(resist in currentMonsterEdit.resistances){
              if(currentMonsterEdit.resistances[resist] == '') break;
              //construct HTML
              var resistRow = $(`<div class="row">
                                  <div class="col col-md-12">
                                    <input type="text" class="newMonsterTextField" name="resistName" value="` + currentMonsterEdit.resistances[resist] + `">
                                  </div>
                                </div>`);
              $('#resistList').append(resistRow);
            }

            //load in Immunities
            $('#immuneList').empty();//clear resist list
            $('#immuneList').html('Immunities:');
            for(immune in currentMonsterEdit.immunities){
              if(currentMonsterEdit.immunities[immune] == '') break;
              //construct HTML
              var immuneRow = $(`<div class="row">
                                  <div class="col col-md-12">
                                    <input type="text" class="newMonsterTextField" name="immuneName" value="` + currentMonsterEdit.immunities[immune] + `">
                                  </div>
                                </div>`);
              $('#immuneList').append(immuneRow);
            }

            //load in vulnerabilities
            $('#vulnerList').empty();//clear resist list
            $('#vulnerList').html('Vulnerabilities:');
            for(vulner in currentMonsterEdit.vulnerabilities){
              if(currentMonsterEdit.vulnerabilities[vulner] == '') break;
              //construct HTML
              var vulnerRow = $(`<div class="row">
                                  <div class="col col-md-12">
                                    <input type="text" class="newMonsterTextField" name="vulnerName" value="` + currentMonsterEdit.vulnerabilities[vulner] + `">
                                  </div>
                                </div>`);
              $('#vulnerList').append(vulnerRow);
            }

            //load in actions
            $('#actionList').empty();
            $('#actionList').html('Actions:');
            for(action in currentMonsterEdit.actions){
              if(currentMonsterEdit.actions[action] == '') break;
              var actionType = currentMonsterEdit.actions[action]["action-type"];
              var actionRow;
              switch(actionType){
                case 'weapon':
                  actionRow = $(`<div class="row">
                                   <div class="col no-border">
                                     <div class="row">
                                       <div class="col col-md-6">
                                         <input type="text" name="actionName" class="newMonsterTextField" placeholder="Action Name" value="` + currentMonsterEdit.actions[action]['name'] + `">
                                       </div>
                                       <div class="col col-md-4">
                                         <select class='newMonsterTextField' id='actionType' disabled>
                                           <option value='weapon' selected>Weapon</option>
                                           <option value='spell'>Spell</option>
                                           <option value='saving'>Saving</option>
                                           <option value='other'>Other</option>
                                         </select>
                                       </div>
                                       <div class = "btn col-md-2" id="expand-weapon-` + spaceToDash(currentMonsterEdit.actions[action]['name']) + `">+</div>
                                     </div>
                                     <div class="row" id="info-weapon-` + spaceToDash(currentMonsterEdit.actions[action]['name']) + `" style="display: none">
                                       <div class="col no-border">
                                         <div class="row">
                                           <div class="col col-md-2">
                                             Mel: <input type="checkbox" name="weaponMelee" class="newMonsterTextField" ` + (currentMonsterEdit.actions[action]['melee'] === 'y' ? 'checked' : '') + `>
                                           </div>
                                           <div class="col col-md-2">
                                             Ran: <input type="checkbox" name="weaponRanged" class="newMonsterTextField" ` + (currentMonsterEdit.actions[action]['ranged'] === 'y' ? 'checked' : '') + `>
                                           </div>
                                           <div class="col col-md-3">
                                             To Hit <input type="text" name="weaponToHit" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['tohit'] + `">
                                           </div>
                                           <div class="col col-md-5">
                                             Target <input type="text" name="weaponTarget" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['target'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-4">
                                             Reach: <input type="text" name="weaponReach" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['reach'] + `">
                                           </div>
                                           <div class="col col-md-4">
                                             Range Min: <input type="text" name="weaponRangeMin" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['range']['min'] + `">
                                           </div>
                                           <div class="col col-md-4">
                                             Range Max: <input type="text" name="weaponRangeMax" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['range']['max'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-5">
                                             Damage: <input type="text" name="dDnumber" class="newMonsterHD" value="` + currentMonsterEdit.actions[action]['damage']['dnum'] + `">d<input type="text" name="dDvalue" class="newMonsterHD" value="` + currentMonsterEdit.actions[action]['damage']['dval'] + `">
                                           </div>
                                           <div class="col col-md-7">
                                             Damage Type: <input type="text" name="damageType" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['damage']['type'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col">
                                             <textarea class="newMonsterTextArea" id="weaponActionNotes" placeholder="Weapon Attack Notes Go Here">` + currentMonsterEdit.actions[action]['notes'] + `</textarea>
                                           </div>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>`);
                  break;
                case 'spell':
                  actionRow = $(`<div class="row">
                                   <div class="col no-border">
                                     <div class="row">
                                       <div class="col col-md-6">
                                         <input type="text" name="actionName" class="newMonsterTextField" placeholder="Action Name" value="` + currentMonsterEdit.actions[action]['name'] + `">
                                       </div>
                                       <div class="col col-md-4">
                                         <select class='newMonsterTextField' id='actionType' disabled>
                                           <option value='weapon'>Weapon</option>
                                           <option value='spell' selected>Spell</option>
                                           <option value='saving'>Saving</option>
                                           <option value='other'>Other</option>
                                         </select>
                                       </div>
                                       <div class = "btn col-md-2" id="expand-spell-` + spaceToDash(currentMonsterEdit.actions[action]['name']) + `">+</div>
                                     </div>
                                     <div class="row" id="info-spell-` + spaceToDash(currentMonsterEdit.actions[action]['name']) + `" style="display: none">
                                       <div class="col no-border">
                                         <div class="row">
                                           <div class="col col-md-2">
                                             Mel: <input type="checkbox" name="spellMelee" class="newMonsterTextField" ` + ((currentMonsterEdit.actions[action]['melee'] == 'y') ? 'checked' : '') + `>
                                           </div>
                                           <div class="col col-md-2">
                                             Ran: <input type="checkbox" name="spellRanged" class="newMonsterTextField" ` + ((currentMonsterEdit.actions[action]['ranged'] == 'y') ? 'checked' : '') + `>
                                           </div>
                                           <div class="col col-md-3">
                                             To Hit <input type="text" name="spellToHit" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['tohit'] + `">
                                           </div>
                                           <div class="col col-md-5">
                                             Target <input type="text" name="spellTarget" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['target'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-4">
                                             Reach: <input type="text" name="spellReach" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['reach'] + `">
                                           </div>
                                           <div class="col col-md-4">
                                             Range Min: <input type="text" name="spellRangeMin" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['range']['min'] + `">
                                           </div>
                                           <div class="col col-md-4">
                                             Range Max: <input type="text" name="spellRangeMax" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['range']['max'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-5">
                                             Damage: <input type="text" name="dDnumberS" class="newMonsterHD" value="` + currentMonsterEdit.actions[action]['damage']['dnum'] + `">d<input type="text" name="dDvalueS" class="newMonsterHD" value="` + currentMonsterEdit.actions[action]['damage']['dval'] + `">
                                           </div>
                                           <div class="col col-md-7">
                                             Damage Type: <input type="text" name="damageTypeS" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['damage']['type'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col">
                                             <textarea class="newMonsterTextArea" id="spellActionNotes" placeholder="Spell Attack Notes Go Here">` + currentMonsterEdit.actions[action]['notes'] + `</textarea>
                                           </div>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>`);
                  break;
                case 'saving':
                  actionRow = $(`<div class="row">
                                   <div class="col no-border">
                                     <div class="row">
                                       <div class="col col-md-6">
                                         <input type="text" name="actionName" class="newMonsterTextField" placeholder="Action Name" value="` + currentMonsterEdit.actions[action]['name'] + `">
                                       </div>
                                       <div class="col col-md-4">
                                         <select class='newMonsterTextField' id='actionType' disabled>
                                           <option value='weapon'>Weapon</option>
                                           <option value='spell'>Spell</option>
                                           <option value='saving' selected>Saving</option>
                                           <option value='other'>Other</option>
                                         </select>
                                       </div>
                                       <div class = "btn col-md-2" id="expand-saving-` + spaceToDash(currentMonsterEdit.actions[action]['name']) + `">+</div>
                                     </div>
                                     <div class="row" id="info-saving-` + spaceToDash(currentMonsterEdit.actions[action]['name']) + `" style="display: none">
                                       <div class="col no-border">
                                         <div class="row">
                                           <div class="col col-md-6">
                                             Throw Type: <input type="text" name="throwType" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['throw-type'] + `">
                                           </div>
                                           <div class="col col-md-6">
                                             Throw Value: <input type="text" name="throwValue" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['throw-value'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-6">
                                             Range: <input type="text" name="throwRange" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['range'] + `">
                                           </div>
                                           <div class="col col-md-6">
                                             Target: <input type="text" name="throwTarget" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['target'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-5">
                                             Damage: <input type="text" name="dDnumberT" class="newMonsterHD" value="` + currentMonsterEdit.actions[action]['damage']['dnum'] + `">d<input type="text" name="dDvalueT" class="newMonsterHD" value="` + currentMonsterEdit.actions[action]['damage']['dval'] + `">
                                           </div>
                                           <div class="col col-md-7">
                                             Damage Type: <input type="text" name="damageTypeT" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['damage']['type'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-6">
                                             Condition: <input type="text" name="throwCondition" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['condition']['name'] + `">
                                           </div>
                                           <div class="col col-md-6">
                                             Duration: <input type="text" name="throwDuration" class="newMonsterTextField" value="` + currentMonsterEdit.actions[action]['condition']['duration'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col">
                                             <textarea class="newMonsterTextArea" id="throwActionNotes" placeholder="Saving Throw Action Notes Go Here">` + currentMonsterEdit.actions[action]['notes'] + `</textarea>
                                           </div>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>`);
                  break;
                case 'other':
                  actionRow = $(`<div class="row">
                                   <div class="col no-border">
                                     <div class="row">
                                       <div class="col col-md-6">
                                         <input type="text" name="actionName" class="newMonsterTextField" placeholder="Action Name" value="` + currentMonsterEdit.actions[action]['name'] + `">
                                       </div>
                                       <div class="col col-md-4">
                                         <select class='newMonsterTextField' id='actionType' disabled>
                                           <option value='weapon'>Weapon</option>
                                           <option value='spell'>Spell</option>
                                           <option value='saving'>Saving</option>
                                           <option value='other' selected>Other</option>
                                         </select>
                                       </div>
                                       <div class = "btn col-md-2" id="expand-other-` + spaceToDash(currentMonsterEdit.actions[action]['name']) + `">+</div>
                                     </div>
                                     <div class="row" id="info-other-` + spaceToDash(currentMonsterEdit.actions[action]['name']) + `" style="display: none">
                                       <div class="col">
                                         <textarea class="newMonsterTextArea" id="otherActionNotes" placeholder="Action Notes Go Here">` + currentMonsterEdit.actions[action]['notes'] + `</textarea>
                                       </div>
                                     </div>
                                   </div>
                                 </div>`);
                  break;
              }
              $('#actionList').append(actionRow);
            }

            //load in Reactions
            $('#reactList').empty();
            $('#reactList').html('Reactions');
            for(react in currentMonsterEdit.reactions){
              if(currentMonsterEdit.reaction[react] == '') break;
              var reactRow = $(`<div class="row">
                                  <div class="col col-md-6">
                                    Reaction: <input type="text" class="newMonsterTextField" name="reactName" value="` + currentMonsterEdit.reaction[react].react + `">
                                  </div>
                                  <div class="col col-md-6">
                                    Desc: <textarea class="newMonsterTextArea" name="reactDesc" >` + currentMonsterEdit.reaction[react].notes + `</textarea>
                                  </div>
                                </div>`);
              $('#reactList').append(reactRow);
            }

            //load in legendary actions
            $('#legendActionList').empty();
            $('#legendActionList').html('Legendary Actions: <input type="text" name="legendActions" class="newMonsterHD" placeholder="Legendary Actions" value="' + (currentMonsterEdit.legendary_actions.num_action == '' ? '0' : currentMonsterEdit.legendary_actions.num_action) + '">');

            //load in how many legendary actions the monster can take
            for(action in currentMonsterEdit.legendary_actions.actions){
              if(currentMonsterEdit.legendary_actions.actions[action] == '') break;
              var actionType = currentMonsterEdit.legendary_actions.actions[action]["action-type"];
              var lactionRow;
              switch(actionType){
                case 'weapon':
                  lactionRow = $(`<div class="row">
                                   <div class="col no-border">
                                     <div class="row">
                                       <div class="col col-md-6">
                                         <input type="text" name="lactionName" class="newMonsterTextField" placeholder="Action Name" value="` + currentMonsterEdit.legendary_actions.actions[action]['name'] + `">
                                       </div>
                                       <div class="col col-md-4">
                                         <select class='newMonsterTextField' id='lactionType' disabled>
                                           <option value='weapon' selected>Weapon</option>
                                           <option value='spell'>Spell</option>
                                           <option value='saving'>Saving</option>
                                           <option value='other'>Other</option>
                                         </select>
                                       </div>
                                       <div class = "btn col-md-2" id="expand-weapon-` + spaceToDash(currentMonsterEdit.legendary_actions.actions[action]['name']) + `">+</div>
                                     </div>
                                     <div class="row" id="info-weapon-` + spaceToDash(currentMonsterEdit.legendary_actions.actions[action]['name']) + `" style="display: none">
                                       <div class="col no-border">
                                         <div class="row">
                                           <div class="col col-md-2">
                                             Mel: <input type="checkbox" name="lweaponMelee" class="newMonsterTextField" ` + (currentMonsterEdit.legendary_actions.actions[action]['melee'] === 'y' ? 'checked' : '') + `>
                                           </div>
                                           <div class="col col-md-2">
                                             Ran: <input type="checkbox" name="lweaponRanged" class="newMonsterTextField" ` + (currentMonsterEdit.legendary_actions.actions[action]['ranged'] === 'y' ? 'checked' : '') + `>
                                           </div>
                                           <div class="col col-md-3">
                                             To Hit <input type="text" name="lweaponToHit" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['tohit'] + `">
                                           </div>
                                           <div class="col col-md-5">
                                             Target <input type="text" name="lweaponTarget" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['target'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-3">
                                             Cost: <input type="text" name="lcost" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['cost'] + `">
                                           </div>
                                           <div class="col col-md-3">
                                             Reach: <input type="text" name="lweaponReach" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['reach'] + `">
                                           </div>
                                           <div class="col col-md-3">
                                             Range Min: <input type="text" name="lweaponRangeMin" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['range']['min'] + `">
                                           </div>
                                           <div class="col col-md-3">
                                             Range Max: <input type="text" name="lweaponRangeMax" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['range']['max'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-5">
                                             Damage: <input type="text" name="ldDnumber" class="newMonsterHD" value="` + currentMonsterEdit.legendary_actions.actions[action]['damage']['dnum'] + `">d<input type="text" name="dDvalue" class="newMonsterHD" value="` + currentMonsterEdit.legendary_actions.actions[action]['damage']['dval'] + `">
                                           </div>
                                           <div class="col col-md-7">
                                             Damage Type: <input type="text" name="ldamageType" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['damage']['type'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col">
                                             <textarea class="newMonsterTextArea" id="lweaponActionNotes" placeholder="Weapon Attack Notes Go Here">` + currentMonsterEdit.legendary_actions.actions[action]['notes'] + `</textarea>
                                           </div>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>`);
                  break;
                case 'spell':
                  lactionRow = $(`<div class="row">
                                   <div class="col no-border">
                                     <div class="row">
                                       <div class="col col-md-6">
                                         <input type="text" name="lactionName" class="newMonsterTextField" placeholder="Action Name" value="` + currentMonsterEdit.legendary_actions.actions[action]['name'] + `">
                                       </div>
                                       <div class="col col-md-4">
                                         <select class='newMonsterTextField' id='lactionType' disabled>
                                           <option value='weapon'>Weapon</option>
                                           <option value='spell' selected>Spell</option>
                                           <option value='saving'>Saving</option>
                                           <option value='other'>Other</option>
                                         </select>
                                       </div>
                                       <div class = "btn col-md-2" id="expand-spell-` + spaceToDash(currentMonsterEdit.legendary_actions.actions[action]['name']) + `">+</div>
                                     </div>
                                     <div class="row" id="info-spell-` + spaceToDash(currentMonsterEdit.legendary_actions.actions[action]['name']) + `" style="display: none">
                                       <div class="col no-border">
                                         <div class="row">
                                           <div class="col col-md-2">
                                             Mel: <input type="checkbox" name="lspellMelee" class="newMonsterTextField" ` + ((currentMonsterEdit.legendary_actions.actions[action]['melee'] == 'y') ? 'checked' : '') + `>
                                           </div>
                                           <div class="col col-md-2">
                                             Ran: <input type="checkbox" name="lspellRanged" class="newMonsterTextField" ` + ((currentMonsterEdit.legendary_actions.actions[action]['ranged'] == 'y') ? 'checked' : '') + `>
                                           </div>
                                           <div class="col col-md-3">
                                             To Hit <input type="text" name="lspellToHit" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['tohit'] + `">
                                           </div>
                                           <div class="col col-md-5">
                                             Target <input type="text" name="lspellTarget" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['target'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-3">
                                             Cost: <input type="text" name="lcost" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['cost'] + `">
                                           </div>
                                           <div class="col col-md-3">
                                             Reach: <input type="text" name="lspellReach" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['reach'] + `">
                                           </div>
                                           <div class="col col-md-3">
                                             Range Min: <input type="text" name="lspellRangeMin" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['range']['min'] + `">
                                           </div>
                                           <div class="col col-md-3">
                                             Range Max: <input type="text" name="lspellRangeMax" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['range']['max'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-5">
                                             Damage: <input type="text" name="ldDnumberS" class="newMonsterHD" value="` + currentMonsterEdit.legendary_actions.actions[action]['damage']['dnum'] + `">d<input type="text" name="dDvalueS" class="newMonsterHD" value="` + currentMonsterEdit.legendary_actions.actions[action]['damage']['dval'] + `">
                                           </div>
                                           <div class="col col-md-7">
                                             Damage Type: <input type="text" name="ldamageTypeS" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['damage']['type'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col">
                                             <textarea class="newMonsterTextArea" id="lspellActionNotes" placeholder="Spell Attack Notes Go Here">` + currentMonsterEdit.legendary_actions.actions[action]['notes'] + `</textarea>
                                           </div>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>`);
                  break;
                case 'saving':
                  lactionRow = $(`<div class="row">
                                   <div class="col no-border">
                                     <div class="row">
                                       <div class="col col-md-6">
                                         <input type="text" name="lactionName" class="newMonsterTextField" placeholder="Action Name" value="` + currentMonsterEdit.legendary_actions.actions[action]['name'] + `">
                                       </div>
                                       <div class="col col-md-4">
                                         <select class='newMonsterTextField' id='lactionType' disabled>
                                           <option value='weapon'>Weapon</option>
                                           <option value='spell'>Spell</option>
                                           <option value='saving' selected>Saving</option>
                                           <option value='other'>Other</option>
                                         </select>
                                       </div>
                                       <div class = "btn col-md-2" id="expand-saving-` + spaceToDash(currentMonsterEdit.legendary_actions.actions[action]['name']) + `">+</div>
                                     </div>
                                     <div class="row" id="info-saving-` + spaceToDash(currentMonsterEdit.legendary_actions.actions[action]['name']) + `" style="display: none">
                                       <div class="col no-border">
                                         <div class="row">
                                           <div class="col col-md-6">
                                             Throw Type: <input type="text" name="lthrowType" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['throw-type'] + `">
                                           </div>
                                           <div class="col col-md-6">
                                             Throw Value: <input type="text" name="lthrowValue" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['throw-value'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-4">
                                             Cost: <input type="text" name="lcost" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['cost'] + `">
                                           </div>
                                           <div class="col col-md-4">
                                             Range: <input type="text" name="lthrowRange" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['range'] + `">
                                           </div>
                                           <div class="col col-md-4">
                                             Target: <input type="text" name="lthrowTarget" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['target'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-5">
                                             Damage: <input type="text" name="ldDnumberT" class="newMonsterHD" value="` + currentMonsterEdit.legendary_actions.actions[action]['damage']['dnum'] + `">d<input type="text" name="dDvalueT" class="newMonsterHD" value="` + currentMonsterEdit.legendary_actions.actions[action]['damage']['dval'] + `">
                                           </div>
                                           <div class="col col-md-7">
                                             Damage Type: <input type="text" name="damageTypeT" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['damage']['type'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col col-md-6">
                                             Condition: <input type="text" name="lthrowCondition" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['condition']['name'] + `">
                                           </div>
                                           <div class="col col-md-6">
                                             Duration: <input type="text" name="lthrowDuration" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['condition']['duration'] + `">
                                           </div>
                                         </div>
                                         <div class="row">
                                           <div class="col">
                                             <textarea class="newMonsterTextArea" id="lthrowActionNotes" placeholder="Saving Throw Action Notes Go Here">` + currentMonsterEdit.legendary_actions.actions[action]['notes'] + `</textarea>
                                           </div>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>`);
                  break;
                case 'other':
                  lactionRow = $(`<div class="row">
                                   <div class="col no-border">
                                     <div class="row">
                                       <div class="col col-md-6">
                                         <input type="text" name="lactionName" class="newMonsterTextField" placeholder="Action Name" value="` + currentMonsterEdit.legendary_actions.actions[action]['name'] + `">
                                       </div>
                                       <div class="col col-md-4">
                                         <select class='newMonsterTextField' id='lactionType' disabled>
                                           <option value='weapon'>Weapon</option>
                                           <option value='spell'>Spell</option>
                                           <option value='saving'>Saving</option>
                                           <option value='other' selected>Other</option>
                                         </select>
                                       </div>
                                       <div class = "btn col-md-2" id="expand-other-` + spaceToDash(currentMonsterEdit.legendary_actions.actions[action]['name']) + `">+</div>
                                     </div>
                                     <div class="row" id="info-other-` + spaceToDash(currentMonsterEdit.legendary_actions.actions[action]['name']) + `" style="display: none">
                                       <div class="col col-md-3">
                                         Cost: <input type="text" name="lcost" class="newMonsterTextField" value="` + currentMonsterEdit.legendary_actions.actions[action]['cost'] + `">
                                       </div>
                                       <div class="col col-md-9">
                                         <textarea class="newMonsterTextArea" id="lotherActionNotes" placeholder="Action Notes Go Here">` + currentMonsterEdit.legendary_actions.actions[action]['notes'] + `</textarea>
                                       </div>
                                     </div>
                                   </div>
                                 </div>`);
                  break;
              }
              $('#legendActionList').append(lactionRow);
            }
            addActionExpandEvent();

            addInputChangeEvent();
          }
          //loads a new monster by default
          loadMonsterEdit('');
          $('#newmonsterbtn').click(()=>{
            //set button css to default
            monsterName = spaceToDash($('input[name=name]').val());
            $('#div-' + spaceToDash(monsterName) + '-btn').css('color', '');
            $('#monstername').css('color', '');
            loadMonsterEdit('');
          });

          $('#addSkill').click(function(){
            skName = $('input[name=newSkillName]').val();
            skValue = $('input[name=newSkillValue]').val();
            if(skName == '') return;
            currentMonsterEdit.skills.push({'skill': skName, 'value': skValue});
            //construct html
            var skillRow = $(`<div class="row">
                                <div class="col col-md-7">
                                  Name: <input type="text" class="newMonsterTextField" name="skillName" value="` + skName + `">
                                </div>
                                <div class="col col-md-5">
                                  Value: <input type="text" class="newMonsterTextField" name="skillValue" value="` + skValue + `">
                                </div>
                              </div>`);
            $('#skillList').append(skillRow);
            //clear the new skill row
            $('input[name=newSkillName]').val('');
            $('input[name=newSkillValue]').val('');
            addInputChangeEvent();
          });

          $('#addSense').click(function(){
            sName = $('input[name=newSenseName]').val();
            sValue = $('input[name=newSenseValue]').val();
            if(sName == '') return;
            currentMonsterEdit.skills.push({'sense': sName, 'value': sValue});
            //construct html
            var senseRow = $(`<div class="row">
                                <div class="col col-md-6">
                                  Name: <input type="text" class="newMonsterTextField" name="senseName" value="` + sName + `">
                                </div>
                                <div class="col col-md-6">
                                  Value: <input type="text" class="newMonsterTextField" name="senseValue" value="` + sValue + `">
                                </div>
                              </div>`);
            $('#senseList').append(senseRow);
            //clear the new sense row
            $('input[name=newSenseName]').val('');
            $('input[name=newSenseValue]').val('');
            addInputChangeEvent();
          });

          $('#addLang').click(function(){
            langName = $('input[name=newLangName]').val();
            langS = $('input[name=newLangS]').prop('checked');
            langU = $('input[name=newLangU]').prop('checked');
            if(langName == '') return;
            currentMonsterEdit.languages.push({'language': langName, 'speak': (langS ? 'y' : 'n'), 'understand': (langU  ? 'y' : 'n')});
            //construct html
            var langRow = $(`<div class="row">
                                <div class="col col-md-8">
                                  Lang: <input type="text" class="newMonsterTextField" name="langName" value="` + langName + `">
                                </div>
                                <div class="col col-md-2">
                                  S: <input type="checkbox" class="newMonsterTextField" name="langS" ` + (langS ? 'checked' : '') + `>
                                </div>
                                <div class="col col-md-2">
                                  U: <input type="checkbox" class="newMonsterTextField" name="langU" ` + (langU ? 'checked' : '') + `>
                                </div>
                              </div>`);
            $('#langList').append(langRow);
            //clear the new lang row
            $('input[name=newLangName]').val('');
            $('input[name=newLangS]').prop('checked', false);
            $('input[name=newLangU]').prop('checked', false);
            addInputChangeEvent();
          });

          $('#addTrait').click(function(){
            tName = $('input[name=newTraitName]').val();
            tDesc = $('textarea[name=newTraitDesc]').val();
            if(tName == '') return;
            currentMonsterEdit.special_traits.push({'traits': tName, 'desc': tDesc});
            //construct html
            var traitRow = $(`<div class="row">
                                <div class="col col-md-6">
                                  Trait: <input type="text" class="newMonsterTextField" name="traitName" value="` + tName + `">
                                </div>
                                <div class="col col-md-6">
                                  Desc: <textarea class="newMonsterTextArea" name="traitDesc" >` + tDesc + `</textarea>
                                </div>
                              </div>`);
            $('#traitList').append(traitRow);
            //clear the new skill row
            $('input[name=newTraitName]').val('');
            $('textarea[name=newTraitDesc]').val('');
            addInputChangeEvent();
          });

          $('#addResist').click(function(){
            rName = $('input[name=newResistName]').val();
            if(rName == '') return;
            currentMonsterEdit.resistances.push(rName);
            //construct html
            var resistRow = $(`<div class="row">
                                <div class="col col-md-12">
                                  <input type="text" class="newMonsterTextField" name="resistName" value="` + rName + `">
                                </div>
                              </div>`);
            $('#resistList').append(resistRow);
            //clear new resistance row
            $('input[name=newResistName]').val('');
            addInputChangeEvent();
          });

          $('#addImmune').click(function(){
            iName = $('input[name=newImmuneName]').val();
            if(iName == '') return;
            currentMonsterEdit.immunities.push(iName);
            //construct html
            var immuneRow = $(`<div class="row">
                                <div class="col col-md-12">
                                  <input type="text" class="newMonsterTextField" name="immuneName" value="` + iName + `">
                                </div>
                              </div>`);
            $('#immuneList').append(immuneRow);
            //clear new resistance row
            $('input[name=newImmuneName]').val('');
            addInputChangeEvent();
          });

          $('#addVulner').click(function(){
            vName = $('input[name=newVulnerName]').val();
            if(vName == '') return;
            currentMonsterEdit.vulnerabilities.push(vName);
            //construct html
            var vulnerRow = $(`<div class="row">
                                <div class="col col-md-12">
                                  <input type="text" class="newMonsterTextField" name="vulnerName" value="` + vName + `">
                                </div>
                              </div>`);
            $('#vulnerList').append(vulnerRow);
            //clear new resistance row
            $('input[name=newVulnerName]').val('');
            addInputChangeEvent();
          });

          $('#addAction').click(function(){
            aName = $('input[name=newActionName]').val();
            if(aName == '') return;
            aType = $('#newActionType').val();
            if(aType == '') return;
            var action = {};
            //console.log(aName);
            var actionRow;
            switch(aType){
              case 'weapon':
                action['name'] = aName;
                action['action-type'] = aType;
                action['melee'] = $('input[name=newWeaponMelee]').prop('checked') ? 'y' : 'n';
                action['ranged'] = $('input[name=newWeaponRanged]').prop('checked') ? 'y' : 'n';
                action['tohit'] = $('input[name=newWeaponToHit]').val();
                action['target'] = $('input[name=newWeaponTarget]').val();
                action['reach'] = $('input[name=newWeaponReach]').val();
                action['range'] = {};
                action['range']['min'] = $('input[name=newWeaponRangeMin]').val();
                action['range']['max'] = $('input[name=newWeaponRangeMax]').val();
                action['damage'] = {};
                action['damage']['dnum'] = $('input[name=newDDnumber]').val();
                action['damage']['dval'] = $('input[name=newDDvalue]').val();
                action['damage']['type'] = $('input[name=newDamageType]').val();
                action['notes'] = $('#newWActionNotes').val();
                actionRow = $(`<div class="row">
                                 <div class="col no-border">
                                   <div class="row">
                                     <div class="col col-md-6">
                                       <input type="text" name="actionName" class="newMonsterTextField" placeholder="Action Name" value="` + action['name'] + `">
                                     </div>
                                     <div class="col col-md-4">
                                       <select class='newMonsterTextField' id='actionType' disabled>
                                         <option value='weapon' selected>Weapon</option>
                                         <option value='spell'>Spell</option>
                                         <option value='saving'>Saving</option>
                                         <option value='other'>Other</option>
                                       </select>
                                     </div>
                                     <div class = "btn col-md-2" id="expand-weapon-` + spaceToDash(action['name']) + `">+</div>
                                   </div>
                                   <div class="row" id="info-weapon-` + spaceToDash(action['name']) + `" style="display: none">
                                     <div class="col no-border">
                                       <div class="row">
                                         <div class="col col-md-2">
                                           Mel: <input type="checkbox" name="weaponMelee" class="newMonsterTextField" ` + (action['melee'] === 'y' ? 'checked' : '') + `>
                                         </div>
                                         <div class="col col-md-2">
                                           Ran: <input type="checkbox" name="weaponRanged" class="newMonsterTextField" ` + (action['ranged'] === 'y' ? 'checked' : '') + `>
                                         </div>
                                         <div class="col col-md-3">
                                           To Hit <input type="text" name="weaponToHit" class="newMonsterTextField" value="` + action['tohit'] + `">
                                         </div>
                                         <div class="col col-md-5">
                                           Target <input type="text" name="weaponTarget" class="newMonsterTextField" value="` + action['target'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-4">
                                           Reach: <input type="text" name="weaponReach" class="newMonsterTextField" value="` + action['reach'] + `">
                                         </div>
                                         <div class="col col-md-4">
                                           Range Min: <input type="text" name="weaponRangeMin" class="newMonsterTextField" value="` + action['range']['min'] + `">
                                         </div>
                                         <div class="col col-md-4">
                                           Range Max: <input type="text" name="weaponRangeMax" class="newMonsterTextField" value="` + action['range']['max'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-5">
                                           Damage: <input type="text" name="dDnumber" class="newMonsterHD" value="` + action['damage']['dnum'] + `">d<input type="text" name="dDvalue" class="newMonsterHD" value="` + action['damage']['dval'] + `">
                                         </div>
                                         <div class="col col-md-7">
                                           Damage Type: <input type="text" name="damageType" class="newMonsterTextField" value="` + action['damage']['type'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col">
                                           <textarea class="newMonsterTextArea" id="weaponActionNotes" placeholder="Weapon Attack Notes Go Here">` + action['notes'] + `</textarea>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               </div>`);
                //clear stuff
                $('input[name=newWeaponMelee]').prop('checked', false);
                $('input[name=newWeaponRanged]').prop('checked', false);
                $('input[name=newWeaponToHit]').val('');
                $('input[name=newWeaponTarget]').val('');
                $('input[name=newWeaponReach]').val('');
                $('input[name=newWeaponRangeMin]').val('');
                $('input[name=newWeaponRangeMax]').val('');
                $('input[name=newDDnumber]').val('');
                $('input[name=newDDvalue]').val('');
                $('input[name=newDamageType]').val('');
                $('#newWActionNotes').val('');
                //hide weapon window
                $('#newWeaponAction').css('display', 'none');
                //clear name and selection box
                $('input[name=newActionName]').val('');
                $('#newActionType').val('');
                break;
              case 'spell':
                action['name'] = aName;
                action['action-type'] = aType;
                action['melee'] = $('input[name=newSpellMelee]').prop('checked') ? 'y' : 'n';
                action['ranged'] = $('input[name=newSpellRanged]').prop('checked') ? 'y' : 'n';
                action['tohit'] = $('input[name=newSpellToHit]').val();
                action['target'] = $('input[name=newSpellTarget]').val();
                action['reach'] = $('input[name=newSpellReach]').val();
                action['range'] = {};
                action['range']['min'] = $('input[name=newSpellRangeMin]').val();
                action['range']['max'] = $('input[name=newSpellRangeMax]').val();
                action['damage'] = {};
                action['damage']['dnum'] = $('input[name=newDDnumberS]').val();
                action['damage']['dval'] = $('input[name=newDDvalueS]').val();
                action['damage']['type'] = $('input[name=newDamageTypeS]').val();
                action['notes'] = $('#newSActionNotes').val();
                actionRow = $(`<div class="row">
                                 <div class="col no-border">
                                   <div class="row">
                                     <div class="col col-md-6">
                                       <input type="text" name="actionName" class="newMonsterTextField" placeholder="Action Name" value="` + action['name'] + `">
                                     </div>
                                     <div class="col col-md-4">
                                       <select class='newMonsterTextField' id='actionType' disabled>
                                         <option value='weapon'>Weapon</option>
                                         <option value='spell' selected>Spell</option>
                                         <option value='saving'>Saving</option>
                                         <option value='other'>Other</option>
                                       </select>
                                     </div>
                                     <div class = "btn col-md-2" id="expand-spell-` + spaceToDash(action['name']) + `">+</div>
                                   </div>
                                   <div class="row" id="info-spell-` + spaceToDash(action['name']) + `" style="display: none">
                                     <div class="col no-border">
                                       <div class="row">
                                         <div class="col col-md-2">
                                           Mel: <input type="checkbox" name="spellMelee" class="newMonsterTextField" ` + ((action['melee'] == 'y') ? 'checked' : '') + `>
                                         </div>
                                         <div class="col col-md-2">
                                           Ran: <input type="checkbox" name="spellRanged" class="newMonsterTextField" ` + ((action['ranged'] == 'y') ? 'checked' : '') + `>
                                         </div>
                                         <div class="col col-md-3">
                                           To Hit <input type="text" name="spellToHit" class="newMonsterTextField" value="` + action['tohit'] + `">
                                         </div>
                                         <div class="col col-md-5">
                                           Target <input type="text" name="spellTarget" class="newMonsterTextField" value="` + action['target'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-4">
                                           Reach: <input type="text" name="spellReach" class="newMonsterTextField" value="` + action['reach'] + `">
                                         </div>
                                         <div class="col col-md-4">
                                           Range Min: <input type="text" name="spellRangeMin" class="newMonsterTextField" value="` + action['range']['min'] + `">
                                         </div>
                                         <div class="col col-md-4">
                                           Range Max: <input type="text" name="spellRangeMax" class="newMonsterTextField" value="` + action['range']['max'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-5">
                                           Damage: <input type="text" name="dDnumberS" class="newMonsterHD" value="` + action['damage']['dnum'] + `">d<input type="text" name="dDvalueS" class="newMonsterHD" value="` + action['damage']['dval'] + `">
                                         </div>
                                         <div class="col col-md-7">
                                           Damage Type: <input type="text" name="damageTypeS" class="newMonsterTextField" value="` + action['damage']['type'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col">
                                           <textarea class="newMonsterTextArea" id="spellActionNotes" placeholder="Spell Attack Notes Go Here">` + action['notes'] + `</textarea>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               </div>`);
                //clear stuff
                $('input[name=newSpellMelee]').prop('checked', false);
                $('input[name=newSpellRanged]').prop('checked', false);
                $('input[name=newSpellToHit]').val('');
                $('input[name=newSpellTarget]').val('');
                $('input[name=newSpellReach]').val('');
                $('input[name=newSpellRangeMin]').val('');
                $('input[name=newSpellRangeMax]').val('');
                $('input[name=newDDnumberS]').val('');
                $('input[name=newDDvalueS]').val('');
                $('input[name=newDamageTypeS]').val('');
                $('#newSActionNotes').val('');
                //hide weapon window
                $('#newSpellAction').css('display', 'none');
                //clear name and selection box
                $('input[name=newActionName]').val('');
                $('#newActionType').val('');
                break;
              case 'saving':
                action['name'] = aName;
                action['action-type'] = aType;
                action['throw-type'] = $('input[name=newThrowType]').val();
                action['throw-value'] = $('input[name=newThrowValue]').val();
                action['range'] = $('input[name=newThrowRange]').val();
                action['target'] = $('input[name=newThrowTarget]').val();
                action['damage'] = {};
                action['damage']['dnum'] = $('input[name=newDDnumberT]').val();
                action['damage']['dval'] = $('input[name=newDDvalueT]').val();
                action['damage']['type'] = $('input[name=newDamageTypeT]').val();
                action['condition'] = {};
                action['condition']['name'] = $('input[name=newThrowCondition]').val();
                action['condition']['duration'] = $('input[name=newThrowDuration]').val();
                action['notes'] = $('#newTActionNotes').val();
                actionRow = $(`<div class="row">
                                 <div class="col no-border">
                                   <div class="row">
                                     <div class="col col-md-6">
                                       <input type="text" name="actionName" class="newMonsterTextField" placeholder="Action Name" value="` + action['name'] + `">
                                     </div>
                                     <div class="col col-md-4">
                                       <select class='newMonsterTextField' id='actionType' disabled>
                                         <option value='weapon'>Weapon</option>
                                         <option value='spell'>Spell</option>
                                         <option value='saving' selected>Saving</option>
                                         <option value='other'>Other</option>
                                       </select>
                                     </div>
                                     <div class = "btn col-md-2" id="expand-saving-` + spaceToDash(action['name']) + `">+</div>
                                   </div>
                                   <div class="row" id="info-saving-` + spaceToDash(action['name']) + `" style="display: none">
                                     <div class="col no-border">
                                       <div class="row">
                                         <div class="col col-md-6">
                                           Throw Type: <input type="text" name="throwType" class="newMonsterTextField" value="` + action['throw-type'] + `">
                                         </div>
                                         <div class="col col-md-6">
                                           Throw Value: <input type="text" name="throwValue" class="newMonsterTextField" value="` + action['throw-value'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-6">
                                           Range: <input type="text" name="throwRange" class="newMonsterTextField" value="` + action['range'] + `">
                                         </div>
                                         <div class="col col-md-6">
                                           Target: <input type="text" name="throwTarget" class="newMonsterTextField" value="` + action['target'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-5">
                                           Damage: <input type="text" name="dDnumberT" class="newMonsterHD" value="` + action['damage']['dnum'] + `">d<input type="text" name="dDvalueT" class="newMonsterHD" value="` + action['damage']['dval'] + `">
                                         </div>
                                         <div class="col col-md-7">
                                           Damage Type: <input type="text" name="damageTypeT" class="newMonsterTextField" value="` + action['damage']['type'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-6">
                                           Condition: <input type="text" name="throwCondition" class="newMonsterTextField" value="` + action['condition']['name'] + `">
                                         </div>
                                         <div class="col col-md-6">
                                           Duration: <input type="text" name="throwDuration" class="newMonsterTextField" value="` + action['condition']['duration'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col">
                                           <textarea class="newMonsterTextArea" id="throwActionNotes" placeholder="Saving Throw Action Notes Go Here">` + action['notes'] + `</textarea>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               </div>`);
                //clear stuff
                $('input[name=newThrowType]').val('');
                $('input[name=newThrowValue]').val('');
                $('input[name=newThrowRange]').val('');
                $('input[name=newThrowTarget]').val('');
                $('input[name=newDDnumberT]').val('');
                $('input[name=newDDvalueT]').val('');
                $('input[name=newDamageTypeT]').val('');
                $('input[name=newThrowCondition]').val('');
                $('input[name=newThrowDuration]').val('');
                $('#newTActionNotes').val('');
                //hide weapon window
                $('#newSavingAction').css('display', 'none');
                //clear name and selection box
                $('input[name=newActionName]').val('');
                $('#newActionType').val('');
                break;
              case 'other':
                action['name'] = aName;
                action['action-type'] = aType;
                action['notes'] = $('#newOActionNotes').val();
                actionRow = $(`<div class="row">
                                 <div class="col no-border">
                                   <div class="row">
                                     <div class="col col-md-6">
                                       <input type="text" name="actionName" class="newMonsterTextField" placeholder="Action Name" value="` + action['name'] + `">
                                     </div>
                                     <div class="col col-md-4">
                                       <select class='newMonsterTextField' id='actionType' disabled>
                                         <option value='weapon'>Weapon</option>
                                         <option value='spell'>Spell</option>
                                         <option value='saving'>Saving</option>
                                         <option value='other' selected>Other</option>
                                       </select>
                                     </div>
                                     <div class = "btn col-md-2" id="expand-other-` + spaceToDash(action['name']) + `">+</div>
                                   </div>
                                   <div class="row" id="info-other-` + spaceToDash(action['name']) + `" style="display: none">
                                     <div class="col">
                                       <textarea class="newMonsterTextArea" id="otherActionNotes" placeholder="Action Notes Go Here">` + action['notes'] + `</textarea>
                                     </div>
                                   </div>
                                 </div>
                               </div>`);
                $('#newOActionNotes').val('');
                //hide weapon window
                $('#newOtherAction').css('display', 'none');
                //clear name and selection box
                $('input[name=newActionName]').val('');
                $('#newActionType').val('');
                break;
            }
            currentMonsterEdit.actions.push(action);
            //console.log(currentMonsterEdit);
            $('#actionList').append(actionRow);
            addActionExpandEvent();
          });

          $('#addReact').click(function(){
            rName = $('input[name=newReactName]').val();
            rDesc = $('textarea[name=newReactDesc]').val();
            if(rName == '') return;
            currentMonsterEdit.reactions.push({'react': rName, 'notes': rDesc});
            //construct html
            var reactRow = $(`<div class="row">
                                <div class="col col-md-6">
                                  Reaction: <input type="text" class="newMonsterTextField" name="reactName" value="` + rName + `">
                                </div>
                                <div class="col col-md-6">
                                  Desc: <textarea class="newMonsterTextArea" name="reactDesc" >` + rDesc + `</textarea>
                                </div>
                              </div>`);
            $('#reactList').append(reactRow);
            //clear the new skill row
            $('input[name=newReactName]').val('');
            $('textarea[name=newReactDesc]').val('');
            addInputChangeEvent();
          });

          $('#addLAction').click(function(){
            aName = $('input[name=newLActionName]').val();
            if(aName == '') return;
            aType = $('#newLActionType').val();
            if(aType == '') return;
            aCost = $('input[name=newLActionCost]').val();
            var action = {};
            //console.log(aName);
            var actionRow;
            switch(aType){
              case 'weapon':
                action['name'] = aName;
                action['action-type'] = aType;
                action['cost'] = aCost;
                action['melee'] = $('input[name=newLWeaponMelee]').prop('checked') ? 'y' : 'n';
                action['ranged'] = $('input[name=newLWeaponRanged]').prop('checked') ? 'y' : 'n';
                action['tohit'] = $('input[name=newLWeaponToHit]').val();
                action['target'] = $('input[name=newLWeaponTarget]').val();
                action['reach'] = $('input[name=newLWeaponReach]').val();
                action['range'] = {};
                action['range']['min'] = $('input[name=newLWeaponRangeMin]').val();
                action['range']['max'] = $('input[name=newLWeaponRangeMax]').val();
                action['damage'] = {};
                action['damage']['dnum'] = $('input[name=newLDDnumber]').val();
                action['damage']['dval'] = $('input[name=newLDDvalue]').val();
                action['damage']['type'] = $('input[name=newLDamageType]').val();
                action['notes'] = $('#newLWActionNotes').val();
                actionRow = $(`<div class="row">
                                 <div class="col no-border">
                                   <div class="row">
                                     <div class="col col-md-6">
                                       <input type="text" name="lactionName" class="newMonsterTextField" placeholder="Action Name" value="` + action['name'] + `">
                                     </div>
                                     <div class="col col-md-4">
                                       <select class='newMonsterTextField' id='lactionType' disabled>
                                         <option value='weapon' selected>Weapon</option>
                                         <option value='spell'>Spell</option>
                                         <option value='saving'>Saving</option>
                                         <option value='other'>Other</option>
                                       </select>
                                     </div>
                                     <div class = "btn col-md-2" id="expand-weapon-` + spaceToDash(action['name']) + `">+</div>
                                   </div>
                                   <div class="row" id="info-weapon-` + spaceToDash(action['name']) + `" style="display: none">
                                     <div class="col no-border">
                                       <div class="row">
                                         <div class="col col-md-2">
                                           Mel: <input type="checkbox" name="lweaponMelee" class="newMonsterTextField" ` + (action['melee'] === 'y' ? 'checked' : '') + `>
                                         </div>
                                         <div class="col col-md-2">
                                           Ran: <input type="checkbox" name="lweaponRanged" class="newMonsterTextField" ` + (action['ranged'] === 'y' ? 'checked' : '') + `>
                                         </div>
                                         <div class="col col-md-3">
                                           To Hit <input type="text" name="lweaponToHit" class="newMonsterTextField" value="` + action['tohit'] + `">
                                         </div>
                                         <div class="col col-md-5">
                                           Target <input type="text" name="lweaponTarget" class="newMonsterTextField" value="` + action['target'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-3">
                                           Cost: <input type="text" name="lcost" class="newMonsterTextField" value="` + action['cost'] + `">
                                         </div>
                                         <div class="col col-md-3">
                                           Reach: <input type="text" name="lweaponReach" class="newMonsterTextField" value="` + action['reach'] + `">
                                         </div>
                                         <div class="col col-md-3">
                                           Range Min: <input type="text" name="lweaponRangeMin" class="newMonsterTextField" value="` + action['range']['min'] + `">
                                         </div>
                                         <div class="col col-md-3">
                                           Range Max: <input type="text" name="lweaponRangeMax" class="newMonsterTextField" value="` + action['range']['max'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-5">
                                           Damage: <input type="text" name="ldDnumber" class="newMonsterHD" value="` + action['damage']['dnum'] + `">d<input type="text" name="ldDvalue" class="newMonsterHD" value="` + action['damage']['dval'] + `">
                                         </div>
                                         <div class="col col-md-7">
                                           Damage Type: <input type="text" name="ldamageType" class="newMonsterTextField" value="` + action['damage']['type'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col">
                                           <textarea class="newMonsterTextArea" id="lweaponActionNotes" placeholder="Weapon Attack Notes Go Here">` + action['notes'] + `</textarea>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               </div>`);
                //clear stuff
                $('input[name=newLWeaponMelee]').prop('checked', false);
                $('input[name=newLWeaponRanged]').prop('checked', false);
                $('input[name=newLWeaponToHit]').val('');
                $('input[name=newLWeaponTarget]').val('');
                $('input[name=newLWeaponReach]').val('');
                $('input[name=newLWeaponRangeMin]').val('');
                $('input[name=newLWeaponRangeMax]').val('');
                $('input[name=newLDDnumber]').val('');
                $('input[name=newLDDvalue]').val('');
                $('input[name=newLDamageType]').val('');
                $('#newLWActionNotes').val('');
                //hide weapon window
                $('#newLWeaponAction').css('display', 'none');
                //clear name and selection box
                $('input[name=newLActionName]').val('');
                $('#newLActionType').val('');
                $('input[name=newLActionCost]').val('');
                break;
              case 'spell':
                action['name'] = aName;
                action['action-type'] = aType;
                action['cost'] = aCost;
                action['melee'] = $('input[name=newLSpellMelee]').prop('checked') ? 'y' : 'n';
                action['ranged'] = $('input[name=newLSpellRanged]').prop('checked') ? 'y' : 'n';
                action['tohit'] = $('input[name=newLSpellToHit]').val();
                action['target'] = $('input[name=newLSpellTarget]').val();
                action['reach'] = $('input[name=newLSpellReach]').val();
                action['range'] = {};
                action['range']['min'] = $('input[name=newLSpellRangeMin]').val();
                action['range']['max'] = $('input[name=newLSpellRangeMax]').val();
                action['damage'] = {};
                action['damage']['dnum'] = $('input[name=newLDDnumberS]').val();
                action['damage']['dval'] = $('input[name=newLDDvalueS]').val();
                action['damage']['type'] = $('input[name=newLDamageTypeS]').val();
                action['notes'] = $('#newLSActionNotes').val();
                actionRow = $(`<div class="row">
                                 <div class="col no-border">
                                   <div class="row">
                                     <div class="col col-md-6">
                                       <input type="text" name="lactionName" class="newMonsterTextField" placeholder="Action Name" value="` + action['name'] + `">
                                     </div>
                                     <div class="col col-md-4">
                                       <select class='newMonsterTextField' id='lactionType' disabled>
                                         <option value='weapon'>Weapon</option>
                                         <option value='spell' selected>Spell</option>
                                         <option value='saving'>Saving</option>
                                         <option value='other'>Other</option>
                                       </select>
                                     </div>
                                     <div class = "btn col-md-2" id="expand-spell-` + spaceToDash(action['name']) + `">+</div>
                                   </div>
                                   <div class="row" id="info-spell-` + spaceToDash(action['name']) + `" style="display: none">
                                     <div class="col no-border">
                                       <div class="row">
                                         <div class="col col-md-2">
                                           Mel: <input type="checkbox" name="lspellMelee" class="newMonsterTextField" ` + ((action['melee'] == 'y') ? 'checked' : '') + `>
                                         </div>
                                         <div class="col col-md-2">
                                           Ran: <input type="checkbox" name="lspellRanged" class="newMonsterTextField" ` + ((action['ranged'] == 'y') ? 'checked' : '') + `>
                                         </div>
                                         <div class="col col-md-3">
                                           To Hit <input type="text" name="lspellToHit" class="newMonsterTextField" value="` + action['tohit'] + `">
                                         </div>
                                         <div class="col col-md-5">
                                           Target <input type="text" name="lspellTarget" class="newMonsterTextField" value="` + action['target'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-3">
                                           Cost: <input type="text" name="lcost" class="newMonsterTextField" value="` + action['cost'] + `">
                                         </div>
                                         <div class="col col-md-3">
                                           Reach: <input type="text" name="lspellReach" class="newMonsterTextField" value="` + action['reach'] + `">
                                         </div>
                                         <div class="col col-md-3">
                                           Range Min: <input type="text" name="lspellRangeMin" class="newMonsterTextField" value="` + action['range']['min'] + `">
                                         </div>
                                         <div class="col col-md-3">
                                           Range Max: <input type="text" name="lspellRangeMax" class="newMonsterTextField" value="` + action['range']['max'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-5">
                                           Damage: <input type="text" name="ldDnumberS" class="newMonsterHD" value="` + action['damage']['dnum'] + `">d<input type="text" name="ldDvalueS" class="newMonsterHD" value="` + action['damage']['dval'] + `">
                                         </div>
                                         <div class="col col-md-7">
                                           Damage Type: <input type="text" name="ldamageTypeS" class="newMonsterTextField" value="` + action['damage']['type'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col">
                                           <textarea class="newMonsterTextArea" id="lspellActionNotes" placeholder="Spell Attack Notes Go Here">` + action['notes'] + `</textarea>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               </div>`);
                //clear stuff
                $('input[name=newLSpellMelee]').prop('checked', false);
                $('input[name=newLSpellRanged]').prop('checked', false);
                $('input[name=newLSpellToHit]').val('');
                $('input[name=newLSpellTarget]').val('');
                $('input[name=newLSpellReach]').val('');
                $('input[name=newLSpellRangeMin]').val('');
                $('input[name=newLSpellRangeMax]').val('');
                $('input[name=newLDDnumberS]').val('');
                $('input[name=newLDDvalueS]').val('');
                $('input[name=newLDamageTypeS]').val('');
                $('#newLSActionNotes').val('');
                //hide weapon window
                $('#newLSpellAction').css('display', 'none');
                //clear name and selection box
                $('input[name=newLActionName]').val('');
                $('#newLActionType').val('');
                $('input[name=newLActionCost]').val('');
                break;
              case 'saving':
                action['name'] = aName;
                action['action-type'] = aType;
                action['cost'] = aCost;
                action['throw-type'] = $('input[name=newLThrowType]').val();
                action['throw-value'] = $('input[name=newLThrowValue]').val();
                action['range'] = $('input[name=newLThrowRange]').val();
                action['target'] = $('input[name=newLThrowTarget]').val();
                action['damage'] = {};
                action['damage']['dnum'] = $('input[name=newLDDnumberT]').val();
                action['damage']['dval'] = $('input[name=newLDDvalueT]').val();
                action['damage']['type'] = $('input[name=newLDamageTypeT]').val();
                action['condition'] = {};
                action['condition']['name'] = $('input[name=newLThrowCondition]').val();
                action['condition']['duration'] = $('input[name=newLThrowDuration]').val();
                action['notes'] = $('#newLTActionNotes').val();
                actionRow = $(`<div class="row">
                                 <div class="col no-border">
                                   <div class="row">
                                     <div class="col col-md-6">
                                       <input type="text" name="lactionName" class="newMonsterTextField" placeholder="Action Name" value="` + action['name'] + `">
                                     </div>
                                     <div class="col col-md-4">
                                       <select class='newMonsterTextField' id='lactionType' disabled>
                                         <option value='weapon'>Weapon</option>
                                         <option value='spell'>Spell</option>
                                         <option value='saving' selected>Saving</option>
                                         <option value='other'>Other</option>
                                       </select>
                                     </div>
                                     <div class = "btn col-md-2" id="expand-saving-` + spaceToDash(action['name']) + `">+</div>
                                   </div>
                                   <div class="row" id="info-saving-` + spaceToDash(action['name']) + `" style="display: none">
                                     <div class="col no-border">
                                       <div class="row">
                                         <div class="col col-md-6">
                                           Throw Type: <input type="text" name="lthrowType" class="newMonsterTextField" value="` + action['throw-type'] + `">
                                         </div>
                                         <div class="col col-md-6">
                                           Throw Value: <input type="text" name="lthrowValue" class="newMonsterTextField" value="` + action['throw-value'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-4">
                                           Cost: <input type="text" name="lcost" class="newMonsterTextField" value="` + action['cost'] + `">
                                         </div>
                                         <div class="col col-md-4">
                                           Range: <input type="text" name="lthrowRange" class="newMonsterTextField" value="` + action['range'] + `">
                                         </div>
                                         <div class="col col-md-4">
                                           Target: <input type="text" name="lthrowTarget" class="newMonsterTextField" value="` + action['target'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-5">
                                           Damage: <input type="text" name="ldDnumberT" class="newMonsterHD" value="` + action['damage']['dnum'] + `">d<input type="text" name="ldDvalueT" class="newMonsterHD" value="` + action['damage']['dval'] + `">
                                         </div>
                                         <div class="col col-md-7">
                                           Damage Type: <input type="text" name="ldamageTypeT" class="newMonsterTextField" value="` + action['damage']['type'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-6">
                                           Condition: <input type="text" name="lthrowCondition" class="newMonsterTextField" value="` + action['condition']['name'] + `">
                                         </div>
                                         <div class="col col-md-6">
                                           Duration: <input type="text" name="lthrowDuration" class="newMonsterTextField" value="` + action['condition']['duration'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col">
                                           <textarea class="newMonsterTextArea" id="lthrowActionNotes" placeholder="Saving Throw Action Notes Go Here">` + action['notes'] + `</textarea>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               </div>`);
                //clear stuff
                $('input[name=newLThrowType]').val('');
                $('input[name=newLThrowValue]').val('');
                $('input[name=newLThrowRange]').val('');
                $('input[name=newLThrowTarget]').val('');
                $('input[name=newLDDnumberT]').val('');
                $('input[name=newLDDvalueT]').val('');
                $('input[name=newLDamageTypeT]').val('');
                $('input[name=newLThrowCondition]').val('');
                $('input[name=newLThrowDuration]').val('');
                $('#newLTActionNotes').val('');
                //hide weapon window
                $('#newLSavingAction').css('display', 'none');
                //clear name and selection box
                $('input[name=newLActionName]').val('');
                $('#newLActionType').val('');
                $('input[name=newLActionCost]').val('');
                break;
              case 'other':
                action['name'] = aName;
                action['action-type'] = aType;
                action['cost'] = aCost;
                action['notes'] = $('#newLOActionNotes').val();
                actionRow = $(`<div class="row">
                                 <div class="col no-border">
                                   <div class="row">
                                     <div class="col col-md-6">
                                       <input type="text" name="lactionName" class="newMonsterTextField" placeholder="Action Name" value="` + action['name'] + `">
                                     </div>
                                     <div class="col col-md-4">
                                       <select class='newMonsterTextField' id='lactionType' disabled>
                                         <option value='weapon'>Weapon</option>
                                         <option value='spell'>Spell</option>
                                         <option value='saving'>Saving</option>
                                         <option value='other' selected>Other</option>
                                       </select>
                                     </div>
                                     <div class = "btn col-md-2" id="expand-other-` + spaceToDash(action['name']) + `">+</div>
                                   </div>
                                   <div class="row" id="info-other-` + spaceToDash(action['name']) + `" style="display: none">
                                     <div class="col col-md-3">
                                       Cost: <input type="text" name="lcost" class="newMonsterTextField" value="` + action['cost'] + `">
                                     </div>
                                     <div class="col col-md-9">
                                       <textarea class="newMonsterTextArea" id="lotherActionNotes" placeholder="Action Notes Go Here">` + action['notes'] + `</textarea>
                                     </div>
                                   </div>
                                 </div>
                               </div>`);
                $('#newLOActionNotes').val('');
                //hide weapon window
                $('#newLOtherAction').css('display', 'none');
                //clear name and selection box
                $('input[name=newLActionName]').val('');
                $('#newLActionType').val('');
                $('input[name=newLActionCost]').val('');
                break;
            }
            currentMonsterEdit.actions.push(action);
            //console.log(currentMonsterEdit);
            $('#legendActionList').append(actionRow);
            addActionExpandEvent();
          });

          $('#addmonsterbtn').click(function(){
            //the monster should at least have a name for it to be added.
            //maybe have a 'complete' flag that is false if any needed info is missing so we don't add an incomplete monster to the Encounter
            monsterName = $('input[name=name]').val();
            if(monsterName == ''){
              $('#monstername').css('color', 'red');
              return;
            }else{
              //set button css to default
              $('#div-' + spaceToDash(monsterName) + '-btn').css('color', '');
              $('#monstername').css('color', '');
            }

            //copy the newMonsterObject
            monsterToSave = JSON.parse(JSON.stringify(newMonsterEdit));
            //update object with fields that have been entered
            for(attr in monsterToSave)
            {
              switch(attr){
                case 'speed':
                  monsterToSave[attr]['walking'] = $('input[name=wspeed]').val();
                  monsterToSave[attr]['burrow'] = $('input[name=bspeed]').val();
                  monsterToSave[attr]['climbing'] = $('input[name=cspeed]').val();
                  monsterToSave[attr]['flying'] = $('input[name=fspeed]').val();
                  monsterToSave[attr]['swimming'] = $('input[name=sspeed]').val();
                  monsterToSave[attr]['hover'] = ($('input[name=hover]').prop('checked') ? 'y' : 'n');
                  break;
                case 'hit_dice':
                  monsterToSave['hit_dice']['number'] = $('input[name=hdnumber]').val();
                  monsterToSave['hit_dice']['value'] = $('input[name=hdvalue]').val();
                  break;
                case 'ability_scores':
                  for(as in monsterToSave['ability_scores']){
                    //console.log(as + ' >> ' + $('input[name=' + as + ']').val());
                    monsterToSave['ability_scores'][as] = $('input[name=as-' + as + ']').val();
                  }
                  break;
                case 'saving_throws':
                  for(th in monsterToSave['saving_throws']){
                    //console.log(as + ' >> ' + $('input[name=' + as + ']').val());
                    monsterToSave['saving_throws'][th] = $('input[name="throw-' + th + '"]').val();
                  }
                  break;
                case 'skills':
                  //clear skills Array
                  monsterToSave[attr].splice(0, monsterToSave[attr].length);
                  //iterate over all of the children that are div elements
                  $('#skillList').children('div').each(function(){
                    var skName = $(this).find('input[name=skillName]').val();
                    var skValue = $(this).find('input[name=skillValue]').val();
                    monsterToSave[attr].push({'skill' : skName, 'value': skValue});
                  });
                  break;
                case 'resistances':
                  //clear resist Array
                  monsterToSave[attr].splice(0, monsterToSave[attr].length);
                  //iterate over all of the children that are div elements
                  $('#resistList').children('div').each(function(){
                    var rName = $(this).find('input[name=resistName]').val();
                    monsterToSave[attr].push(rName);
                  });
                  break;
                case 'vulnerabilities':
                  //clear vulnerabilities Array
                  monsterToSave[attr].splice(0, monsterToSave[attr].length);
                  //iterate over all of the children that are div elements
                  $('#vulnerList').children('div').each(function(){
                    var vName = $(this).find('input[name=vulnerName]').val();
                    monsterToSave[attr].push(vName);
                  });
                  break;
                case 'immunities':
                  //clear immunities Array
                  monsterToSave[attr].splice(0, monsterToSave[attr].length);
                  //iterate over all of the children that are div elements
                  $('#immuneList').children('div').each(function(){
                    var iName = $(this).find('input[name=immuneName]').val();
                    monsterToSave[attr].push(iName);
                  });
                  break;
                case 'senses':
                  //clear senses array
                  monsterToSave[attr].splice(0,monsterToSave[attr].length);
                  //iterate over all children of senseList that are div elements
                  $('#senseList').children('div').each(function(){
                    var sName = $(this).find('input[name=senseName]').val();
                    var sValue = $(this).find('input[name=senseValue]').val();
                    monsterToSave[attr].push({'sense' : sName, 'value': sValue});
                  });
                  break;
                case 'languages':
                  //clear lang array
                  monsterToSave[attr].splice(0,monsterToSave[attr].length);
                  //iterate over all children of langList that are div elements
                  $('#langList').children('div').each(function(){
                    var lName = $(this).find('input[name=langName]').val();
                    var lS = ($(this).find('input[name=langS]').prop('checked') == true) ? 'y' : 'n';
                    var lU = ($(this).find('input[name=langU]').prop('checked') == true) ? 'y' : 'n';
                    //console.log($(this).find('input[name=langS]'));
                    //console.log($(this).find('input[name=langS]').prop('checked'));
                    monsterToSave[attr].push({'language': lName, 'speak': lS, 'understand': lU});
                  });
                  break;
                //case 'telepathy':
                //  break;
                case 'special_traits':
                  //clear traits array
                  monsterToSave[attr].splice(0,monsterToSave[attr].length);
                  //iterate over all children of senseList that are div elements
                  $('#traitList').children('div').each(function(){
                    var tName = $(this).find('input[name=traitName]').val();
                    var tDesc = $(this).find('textarea[name=traitDesc]').val();
                    monsterToSave[attr].push({'trait' : tName, 'notes': tDesc});
                  });
                  break;
                case 'actions':
                  //clear actions array
                  monsterToSave[attr].splice(0, monsterToSave[attr].length);
                  $('#actionList').children('div').each(function(){
                    var action = {};
                    action['name'] = $(this).find('input[name=actionName]').val();
                    action['action-type'] = $(this).find('#actionType').val();
                    switch(action['action-type']){
                      case 'weapon':
                        action['melee'] = $(this).find('input[name=weaponMelee]').prop('checked') ? 'y' : 'n';
                        action['ranged'] = $(this).find('input[name=weaponRanged]').prop('checked') ? 'y' : 'n';
                        action['tohit'] = $(this).find('input[name=weaponToHit]').val();
                        action['target'] = $(this).find('input[name=weaponTarget]').val();
                        action['reach'] = $(this).find('input[name=weaponReach]').val();
                        action['range'] = {};
                        action['range']['min'] = $(this).find('input[name=weaponRangeMin]').val();
                        action['range']['max'] = $(this).find('input[name=weaponRangeMax]').val();
                        action['damage'] = {};
                        action['damage']['dnum'] = $(this).find('input[name=dDnumber]').val();
                        action['damage']['dval'] = $(this).find('input[name=dDvalue]').val();
                        action['damage']['type'] = $(this).find('input[name=damageType]').val();
                        action['notes'] = $(this).find('#weaponActionNotes').val();
                        break;
                      case 'spell':
                        action['melee'] = $(this).find('input[name=spellMelee]').prop('checked') ? 'y' : 'n';
                        action['ranged'] = $(this).find('input[name=spellRanged]').prop('checked') ? 'y' : 'n';
                        action['tohit'] = $(this).find('input[name=spellToHit]').val();
                        action['target'] = $(this).find('input[name=spellTarget]').val();
                        action['reach'] = $(this).find('input[name=spellReach]').val();
                        action['range'] = {};
                        action['range']['min'] = $(this).find('input[name=spellRangeMin]').val();
                        action['range']['max'] = $(this).find('input[name=spellRangeMax]').val();
                        action['damage'] = {};
                        action['damage']['dnum'] = $(this).find('input[name=dDnumberS]').val();
                        action['damage']['dval'] = $(this).find('input[name=dDvalueS]').val();
                        action['damage']['type'] = $(this).find('input[name=damageTypeS]').val();
                        action['notes'] = $(this).find('#spellActionNotes').val();
                        break;
                      case 'saving':
                        action['throw-type'] = $(this).find('input[name=throwType]').val();
                        action['throw-value'] = $(this).find('input[name=throwValue]').val();
                        action['range'] = $(this).find('input[name=throwRange]').val();
                        action['target'] = $(this).find('input[name=throwTarget]').val();
                        action['damage'] = {};
                        action['damage']['dnum'] = $(this).find('input[name=dDnumberT]').val();
                        action['damage']['dval'] = $(this).find('input[name=dDvalueT]').val();
                        action['damage']['type'] = $(this).find('input[name=damageTypeT]').val();
                        action['condition'] = {};
                        action['condition']['name'] = $(this).find('input[name=throwCondition]').val();
                        action['condition']['duration'] = $(this).find('input[name=throwDuration]').val();
                        action['notes'] = $(this).find('#throwActionNotes').val();
                        break;
                      case 'other':
                        action['notes'] = $(this).find('#otherActionNotes').val();
                        break;
                    }
                    //console.log(action);
                    monsterToSave[attr].push(action);
                  });
                  break;
                case 'reactions':
                  //clear traits array
                  monsterToSave[attr].splice(0,monsterToSave[attr].length);
                  //iterate over all children of senseList that are div elements
                  $('#reactList').children('div').each(function(){
                    var rName = $(this).find('input[name=reactName]').val();
                    var rDesc = $(this).find('textarea[name=reactDesc]').val();
                    monsterToSave[attr].push({'react' : rName, 'notes': rDesc});
                  });
                  break;
                case 'legendary_actions':
                  //save num_actions
                  monsterToSave.legendary_actions.num_action = $('input[name=legendActions]').val();
                  //clear actions array
                  monsterToSave.legendary_actions.actions.splice(0, monsterToSave.legendary_actions.actions.length);
                  $('#legendActionList').children('div').each(function(){
                    var laction = {};
                    laction['name'] = $(this).find('input[name=lactionName]').val();
                    laction['action-type'] = $(this).find('#lactionType').val();
                    laction['cost'] = $(this).find('input[name=lcost]').val();
                    switch(laction['action-type']){
                      case 'weapon':
                        laction['melee'] = $(this).find('input[name=lweaponMelee]').prop('checked') ? 'y' : 'n';
                        laction['ranged'] = $(this).find('input[name=lweaponRanged]').prop('checked') ? 'y' : 'n';
                        laction['tohit'] = $(this).find('input[name=lweaponToHit]').val();
                        laction['target'] = $(this).find('input[name=lweaponTarget]').val();
                        laction['reach'] = $(this).find('input[name=lweaponReach]').val();
                        laction['range'] = {};
                        laction['range']['min'] = $(this).find('input[name=lweaponRangeMin]').val();
                        laction['range']['max'] = $(this).find('input[name=lweaponRangeMax]').val();
                        laction['damage'] = {};
                        laction['damage']['dnum'] = $(this).find('input[name=ldDnumber]').val();
                        laction['damage']['dval'] = $(this).find('input[name=ldDvalue]').val();
                        laction['damage']['type'] = $(this).find('input[name=ldamageType]').val();
                        laction['notes'] = $(this).find('#lweaponActionNotes').val();
                        break;
                      case 'spell':
                        laction['melee'] = $(this).find('input[name=lspellMelee]').prop('checked') ? 'y' : 'n';
                        laction['ranged'] = $(this).find('input[name=lspellRanged]').prop('checked') ? 'y' : 'n';
                        laction['tohit'] = $(this).find('input[name=lspellToHit]').val();
                        laction['target'] = $(this).find('input[name=lspellTarget]').val();
                        laction['reach'] = $(this).find('input[name=lspellReach]').val();
                        laction['range'] = {};
                        laction['range']['min'] = $(this).find('input[name=lspellRangeMin]').val();
                        laction['range']['max'] = $(this).find('input[name=lspellRangeMax]').val();
                        laction['damage'] = {};
                        laction['damage']['dnum'] = $(this).find('input[name=ldDnumberS]').val();
                        laction['damage']['dval'] = $(this).find('input[name=ldDvalueS]').val();
                        laction['damage']['type'] = $(this).find('input[name=ldamageTypeS]').val();
                        laction['notes'] = $(this).find('#lspellActionNotes').val();
                        break;
                      case 'saving':
                        laction['throw-type'] = $(this).find('input[name=lthrowType]').val();
                        laction['throw-value'] = $(this).find('input[name=lthrowValue]').val();
                        laction['range'] = $(this).find('input[name=lthrowRange]').val();
                        laction['target'] = $(this).find('input[name=lthrowTarget]').val();
                        laction['damage'] = {};
                        laction['damage']['dnum'] = $(this).find('input[name=ldDnumberT]').val();
                        laction['damage']['dval'] = $(this).find('input[name=ldDvalueT]').val();
                        laction['damage']['type'] = $(this).find('input[name=ldamageTypeT]').val();
                        laction['condition'] = {};
                        laction['condition']['name'] = $(this).find('input[name=lthrowCondition]').val();
                        laction['condition']['duration'] = $(this).find('input[name=lthrowDuration]').val();
                        laction['notes'] = $(this).find('#lthrowActionNotes').val();
                        break;
                      case 'other':
                        laction['notes'] = $(this).find('#lotherActionNotes').val();
                        break;
                    }
                    //console.log(laction);
                    monsterToSave.legendary_actions.actions.push(laction);
                  });
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
              var newEditDiv = $('<div class=\'col\' id=\'div-'+ spaceToDash(monsterName) +'-btn\'>' + monsterName + '</div>');
              newEditDiv.click(()=>{loadMonsterEdit(monsterName);});
              $('#mmonsterlist').append(newEditDiv);
              var newEncDiv = $('<div class=\'col\' id=\'div-'+ spaceToDash(monsterName) +'-btn\'>' + monsterName + '</div>');
              newEncDiv.click(()=>{addMonsterToEncounter(monsterName);});
              $('#emonsterlist').append(newEncDiv);
            }
            //add new monster to the raw json
            raw_sheet['monsters'][monsterName] = monsterToSave;
            console.log(raw_sheet['monsters'][monsterName]);
          });
          //get monster divs from monster list in the edit monster div
          $('#mmonsterlist').children('div').each(function(){
            $(this).click(()=>{loadMonsterEdit($(this).html())});
            $(this).attr('id', 'div-' + spaceToDash($(this).html()) + '-btn');
          });
          //get monster divs from monster list in the encounter div
          $('#emonsterlist').children('div').each(function(){
            $(this).click(()=>{loadMonsterType($(this).html())});
            $(this).attr('id', 'div-' + spaceToDash($(this).html()) + '-btn');
          });

          //ENCOUNTER PAGE FUNCTIONS
          $('#startEncounterBtn').click(function(){
            $('.startEncounter').attr('id', 'hidden');
            $('.encounterstuff').attr('id', 'shown');
            //clear raw_sheet just in case
            raw_sheet.encounter['current_turn'] = 0;
            raw_sheet.encounter.monsters.splice(0, raw_sheet.encounter.monsters.length);
            raw_sheet.encounter.turnorder.splice(0, raw_sheet.encounter.turnorder.length);
          });

          $('#resumeEncounterBtn').click(function(){
            if(raw_sheet.encounter.turnorder.length == 0) return;//no previoud encounter to resume
            $('.startEncounter').attr('id', 'hidden');
            $('.encounterstuff').attr('id', 'shown');
            let msg = JSON.stringify({type: 'dmstatus', msg: 'Resuming Encounter'});
            socket.send(msg);
            $('.emonstermake').attr('id', 'hidden');
            //show cntrl btns
            $('.controlbtns').attr('id', 'shown');
            //clear encounter list
            $('#encounterList').html('');
            $('#encounterList').html('Turn Order: (Current Turn: <span id="currentTurnSpan"></span>)');
            $('#currentTurnSpan').html(raw_sheet.encounter.turnorder[raw_sheet.encounter['current_turn']]);
            //build html
            for(morp in raw_sheet.encounter.turnorder){
              console.log(morp);
              if(raw_sheet.encounter.turnorder[morp].hasOwnProperty('uname')){
                //build player row
                var row = $(`<div class="row">
                               <div class="col col-md-12">
                                 ` + raw_sheet.encounter.turnorder[morp]['uname'] + `(` + raw_sheet.encounter.turnorder[morp]['alias'] + `)
                               </div>
                             </div>`);
                //add row
                $('#encounterList').append(row);
              }else{
                //build monster row
                var row = $(`<div class="row">
                               <div class="col no-border">
                                 <div class="row">
                                   <div class="col col-md-8">
                                     ` + raw_sheet.encounter.turnorder[morp]['name'] + `
                                   </div>
                                   <div class="col col-md-4">
                                     <div class="btn" id="eexpand-` + morp + `">+</div>
                                   </div>
                                 </div>
                                 <div class="row" id="eexpand-` + morp + `-info">
                                   <div class="col col-md-12 no-border">
                                     <div class="row">
                                       <div class="col col-md-8">
                                         Type: <input class="newMonsterTextField" value="` + raw_sheet.encounter.turnorder[morp]['type'] + `" readonly>
                                       </div>
                                       <div class="col col-md-4">
                                         Health: <input name="eChangeHealth" class="newMonsterTextField" value="` + raw_sheet.encounter.turnorder[morp]['health'] + `" placeholder="` + raw_sheet.encounter.turnorder[morp]['max-health'] + `">
                                       </div>
                                     </div>
                                     <div class="row">
                                       <div class="col col-md-12">
                                         Inventory:</br>
                                         <textarea name="eChangeInven" class="newMonsterTextArea">` + raw_sheet.encounter.turnorder[morp]['inven'] + `</textarea>
                                       </div>
                                     </div>
                                     <div class="row">
                                       <div class="col col-md-8">
                                         Notes:</br>
                                         <textarea name="eChangeNotes" class="newMonsterTextArea">` + raw_sheet.encounter.turnorder[morp]['notes'] + `</textarea>
                                       </div>
                                       <div class="col col-md-4">
                                         Info:</br>
                                         <div class="btn" id="getInfoBtn-` + morp + `">?</div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               </div>
                             </div>`);
                $('#encounterList').append(row);
              }
            }
            addGeneratedButtons();
          });

          $('#randEMName').click(function(){
            console.log('random name');
            var name = '';
            var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            for(var i = 0; i < 13; i++)
              name += possible.charAt(Math.floor(Math.random() * possible.length));
            $('#eMName').val(name);
            console.log(name);
          });

          $('#avgHealthBtn').click(function(){
            console.log('avg health');
            var type = $('#eMType').val();
            if(type == '') return;
            $('#eMHealth').val(raw_sheet.monsters[type].hp);
          });

          $('#randHealthBtn').click(function(){
            console.log('random health');
            var type = $('#eMType').val();
            if(type == '') return;
            var randhp = rollHealth(parseInt(raw_sheet.monsters[type].hit_dice.value, 10),
                                    parseInt(raw_sheet.monsters[type].hit_dice.number, 10),
                                    getASModifier(raw_sheet.monsters[type].ability_scores.const));
            $('#eMHealth').val(randhp);
          });

          var loadMonsterType = function(monsterName){
            $('#eMType').val(monsterName);
          }

          $('#nextTurnBtn').click(function(){
            raw_sheet.encounter['current_turn'] += 1;
            if(raw_sheet.encounter['current_turn'] >= raw_sheet.encounter['turnorder'].length)
              raw_sheet.encounter['current_turn'] = 0;
            console.log(raw_sheet.encounter.turnorder[parseInt(raw_sheet.encounter['current_turn'])]);
            $('#currentTurnSpan').html(raw_sheet.encounter.turnorder[parseInt(raw_sheet.encounter['current_turn'])]['name']);
          });

          $('#endEncBtn').focusout(function(){
            $(this).html("End Encounter");
          });

          $('#endEncBtn').click(function(){
            var flag = $(this).html();
            if(flag === "End Encounter"){
              $(this).html('Click Again...');
            }else{
              //clear everything and reset hidden tabs
              raw_sheet.encounter['current_turn'] = 0;
              raw_sheet.encounter['monsters'] = [];
              raw_sheet.encounter['turnorder'] = [];
              $('#encounterList').html('');
              $('.startEncounter').attr('id', 'shown');
              $('.encounterstuff').attr('id', 'hidden');
              $('.emonstermake').attr('id', 'shown');
              $('.controlbtns').attr('id', 'hidden');
            }
          });

          $('#add2Encounter').click(function(){
            var monster = {};
            monster['name'] = $('#eMName').val();
            monster['type'] = $('#eMType').val();
            monster['health'] = $('#eMHealth').val();
            monster['max-health'] = $('#eMHealth').val();
            monster['notes'] = '';
            if(monster['name'] == '' || monster['type'] == '' || monster['health'] == '') return;
            monster['inven'] = $('#eMInven').val();
            //console.log("MOD>>>" + getASModifier(raw_sheet.monsters[monster['type']].ability_scores.dex));
            monster['init'] = rollInit(parseInt(getASModifier(raw_sheet.monsters[monster['type']].ability_scores.dex), 10));
            //add to monsters array in raw sheet
            console.log(monster);
            raw_sheet.encounter.monsters.push(monster);
            //add monster to encounterList
            var row = $(`<div class="row">
                           <div class="col">
                           ` + monster['name'] + ` (` + monster['type'] + `)
                           </div>
                         </div>`);
            $('#encounterList').append(row);
            //clear the add monster stuff
            $('#eMName').val('');
            $('#eMType').val('');
            $('#eMHealth').val('');
            $('#eMInven').val('');
          });

          $('#rollInit').focusout(function(){
            $(this).html("Roll Initiative");
          });

          var ePlayerList = [];
          $('#rollInit').click(function(){
            var flag = $(this).html();
            if(flag === "Roll Initiative"){
              $(this).html('Click Again...');
            }
            else{
              //add all the players to the encounter
              for(client in clients){
                console.log(clients[client]);
                if(client == uname) continue;
                var eplayer = {};
                eplayer['uname'] = client;
                eplayer['alias'] = clients[client];
                eplayer['init'] = '';
                ePlayerList.push(eplayer);
              }
              //clear encounterList
              $('#encounterList').html('');
              //get player's initiative rolls
              for(ep in ePlayerList){
                var pinitrow = $(`<div class="row">
                                    <div class="col col-md-12" id="pinit-`+ ep +`-`+ spaceToDash(ePlayerList[ep]['uname']) + `">
                                      `+ ePlayerList[ep]['uname'] +`(` + ePlayerList[ep]['alias'] + `)
                                      <input class="newMonsterTextField" id="pinit-`+ ep +`-`+ spaceToDash(ePlayerList[ep]['uname']) + `-roll">
                                    </div>
                                  </div>`);
                $('#encounterList').append(pinitrow);
              }
              $('#encounterList').append($('<div class="row"><div class="col col-md-12"><div class="btn" id="finishInitBtn">Finish Initiative Rolls</div></div></div>'));
              addFinishInitBtn();
              //sort monsters in decreasing initiative order
              raw_sheet.encounter.monsters.sort((a, b) => {(parseInt(a.init) > parseInt(b.init)) ? -1 : ((parseInt(b.init) > parseInt(a.init)) ? 1 : 0)});
              //hide emonstermake
              $('.emonstermake').attr('id', 'hidden');
              //also broadcast that we are rolling for initiative
              let msg = JSON.stringify({type: 'dmstatus', msg: 'Roll For Initiative!!!'});
              socket.send(msg);
            }
          });

          var addFinishInitBtn = function(){
            $('#finishInitBtn').click(function(){
              //show control btns
              $('.controlbtns').attr('id', 'shown');
              let msg = JSON.stringify({type: 'dmstatus', msg: 'Done Taking Initiative Rolls'});
              socket.send(msg);
              //set initiatives for everyone
              for(ep in ePlayerList){
                ePLayerList[ep]['init'] = parseInt($('input[id^="pinit-' + ep + '-"]').val()) != NaN ? parseInt($('input[id^="pinit-' + ep + '-"]').val()) : 0;
              }
              //merge arrays
              raw_sheet.encounter.turnorder = raw_sheet.encounter.monsters.concat(ePlayerList);
              //sort array
              raw_sheet.encounter.turnorder.sort((a, b) => {return -1 * (parseInt(a.init) - parseInt(b.init))});
              console.log(raw_sheet.encounter.turnorder);
              //clear encounter list
              $('#encounterList').html('');
              $('#encounterList').html('Turn Order: (Current Turn: <span id="currentTurnSpan"></span>)');
              $('#currentTurnSpan').html(raw_sheet.encounter.turnorder[parseInt(raw_sheet.encounter['current_turn'])]['name']);
              //build html
              for(morp in raw_sheet.encounter.turnorder){
                console.log(morp);
                if(raw_sheet.encounter.turnorder[morp].hasOwnProperty('uname')){
                  //build player row
                  var row = $(`<div class="row">
                                 <div class="col col-md-12">
                                   ` + raw_sheet.encounter.turnorder[morp]['uname'] + `(` + raw_sheet.encounter.turnorder[morp]['alias'] + `)
                                 </div>
                               </div>`);
                  //add row
                  $('#encounterList').append(row);
                }else{
                  //build monster row
                  var row = $(`<div class="row">
                                 <div class="col no-border">
                                   <div class="row">
                                     <div class="col col-md-8">
                                       ` + raw_sheet.encounter.turnorder[morp]['name'] + `
                                     </div>
                                     <div class="col col-md-4">
                                       <div class="btn" id="eexpand-` + morp + `">+</div>
                                     </div>
                                   </div>
                                   <div class="row" id="eexpand-` + morp + `-info">
                                     <div class="col col-md-12 no-border">
                                       <div class="row">
                                         <div class="col col-md-8">
                                           Type: <input class="newMonsterTextField" value="` + raw_sheet.encounter.turnorder[morp]['type'] + `" readonly>
                                         </div>
                                         <div class="col col-md-4">
                                           Health: <input name="eChangehealth" class="newMonsterTextField" value="` + raw_sheet.encounter.turnorder[morp]['health'] + `" placeholder="` + raw_sheet.encounter.turnorder[morp]['max-health'] + `">
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-12">
                                           Inventory:</br>
                                           <textarea name="eChangeinven" class="newMonsterTextArea">` + raw_sheet.encounter.turnorder[morp]['inven'] + `</textarea>
                                         </div>
                                       </div>
                                       <div class="row">
                                         <div class="col col-md-8">
                                           Notes:</br>
                                           <textarea name="eChangenotes" class="newMonsterTextArea">` + raw_sheet.encounter.turnorder[morp]['notes'] + `</textarea>
                                         </div>
                                         <div class="col col-md-4">
                                           Info:</br>
                                           <div class="btn" id="getInfoBtn-` + morp + `">?</div>
                                         </div>
                                       </div>
                                     </div>
                                   </div>
                                 </div>
                               </div>`);
                  $('#encounterList').append(row);
                }
              }
              addGeneratedButtons();
            });
          }

          var addGeneratedButtons = function()
          {
            //set expand-morp-info to Hidden
            $('div[id^="eexpand-"]:not([class="btn"])').css('display', 'none');
            $('div.btn[id^="eexpand-"]').click(function(){
              //console.log(this);
              var inner = $(this).html();
              var id = $(this).attr('id');
              if(inner == '+'){
                $('#' + id + '-info').css('display', 'inline-block');
                $(this).html('-');
              }else{
                $('#' + id + '-info').css('display', 'none');
                $(this).html('+');
              }
            });
            $('[id^="getInfoBtn-"').click(function(){
              var index = parseInt($(this).attr('id').split('-')[1]);
              //load monster into edit screen
              loadMonsterEdit(raw_sheet.encounter.turnorder[index]['type']);
              //reset
              $('#eexpand-' + index + '-info').css('display', 'none');
              $('#eexpand-' + index).html('+');
              //swap view to edit screen
              $('.dmencounter').attr('id', 'hidden');
              $('.dmmonster').attr('id', 'shown');
            });
            //need to add a change event that saves to the sheet
            $('input[name^="eChange"], textarea[name^="eChange"]').change(function(){
              //console.log("changed!!");
              var list = $(this).parentsUntil('[id^="eexpand-"]');
              var len = list.length;
              var index = parseInt($(list[len-1]).parent().attr('id').split('-')[1]);
              var prop = $(this).attr('name').split('eChange')[1];
              //console.log(prop);
              raw_sheet.encounter.turnorder[index][prop] = $(this).val();
            });
          }

          break;
      }
    }

    // HEY BUSTER BROWN WHOEVER DID THIS BETTER FIX IT.
    // WE HAVE JQUERY FOR A REASON
    //document.getElementById("stat_change").style.display ="none";
//
    //function openStatChange() {
    //    if(document.getElementById("stat_change").style.display == "block"){ //<<ALSO WHAT IS THIS INDENTING????
    //         document.getElementById("stat_change").style.display = "none"; //<<IT"S ALL OVER THE PLACE
    //    }else{
    //      document.getElementById("stat_change").style.display = "block";
    //    }
    //}

    //document.getElementById('stat_btn').addEventListener('click', openStatChange);//smh
    //^^^^^^^^^^^^^^^^^^^^^^^^^ MAKES ME SICK

    //i had to convert it to jquery cause if the object doesnt exist jquery
    //will let it slide but document.getElementById breaks everythign
    $('#stat_change').css('display', 'none');
    $('#stat_btn').click(()=>{
      if($('#stat_change').attr('id') == 'block')
        $('#stat_change').attr('id', 'none');
      else {
        $('#stat_change').attr('id', 'block');
      }
    });

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

    //secret dm health roll
    var rollHealth = function(dice_val, dice_num, const_mod){
      var roll = 0;
      for(var i = 0; i < dice_num; i++)
        roll += Math.floor((Math.random() * dice_val) + 1);
      roll += (const_mod * dice_num);
      return roll;
    }

    //secret dm initiative roll
    var rollInit = function(dex_mod){
      var roll = Math.floor((Math.random() * 20) + 1) + dex_mod;
      //console.log('roll >>> ' + roll);
      return roll;
    }

    //handle if user asks for dice roll
    $('#dice_roll').click(function(){
      var adv, disadv, mod, mod_val, hide, show;
      // 1, 0 used to represent true, false respectively for advantage and disadvantage
      adv = $('#adv:checked').val() == "on" ? 1 : 0;
      disadv = $('#disadv:checked').val() == "on" ? 1 : 0;
      mod = $('#modifier').val();
      hide = $('#hide_rolls:checked').val()  == "on" ? 1 : 0;
      show= $('#show_rolls:checked').val()  == "on" ? 1 : 0;
      //console.log(raw_sheet);
      if(raw_sheet == null || mod == "none"){
          mod_val = 0;
      }else{
          if(raw_sheet.hasOwnProperty('ability-scores')){
            mod_val = raw_sheet['ability-scores'][mod];
          }else{
            mod_val = 0;
          }
      }
     // mod_val = mod != "none" ? raw_sheet['ability-scores'][mod] : 0;
      // create string from type appended with dice info
      let msg = JSON.stringify({type: 'dice_roll', dice_list: dice_data, modifier: mod, modifier_value: mod_val, adv: adv, disadv: disadv, hide: hide, show: show});
      socket.send(msg);
      dice_data = [0, 0, 0, 0, 0, 0];
      $('#nd4').html(0);
      $('#nd6').html(0);
      $('#nd8').html(0);
      $('#nd10').html(0);
      $('#nd12').html(0);
      $('#nd20').html(0);
    });

    $('#clear_roll').click(function(){
      dice_data = [0, 0, 0, 0, 0, 0];
      $('#nd4').html(0);
      $('#nd6').html(0);
      $('#nd8').html(0);
      $('#nd10').html(0);
      $('#nd12').html(0);
      $('#nd20').html(0);
    });

    $('#d4').click(function(){
        dice_data[0] += 1;
        $('#nd4').html(dice_data[0]);
    });

    $('#d6').click(function(){
       dice_data[1] += 1;
       $('#nd6').html(dice_data[1]);
    });

    $('#d8').click(function(){
        dice_data[2] += 1;
        $('#nd8').html(dice_data[2]);
    });

    $('#d10').click(function(){
        dice_data[3] += 1;
        $('#nd10').html(dice_data[3]);
    });

    $('#d12').click(function(){
        dice_data[4] += 1;
        $('#nd12').html(dice_data[4]);
    });

    $('#d20').click(function(){
        dice_data[5] += 1;
        $('#nd20').html(dice_data[5]);
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
            let more_level = true;
            //handle possibility of multiple level ups
            while(more_level) {
              next_xp = l2x[curr_level + 1];
              if (curr >= next_xp) {
                more_level = true;
                curr_level += 1;
              } else {
                more_level = false;
              }
            }
            let lev_html = $('#level').html();
            lev_html = lev_html.replace(/\d+/g, curr_level);
            $('#level').html(lev_html);
            raw_sheet['level'] = curr_level;
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
      return Math.floor((Number(stat_val)-10) / 2);
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

    //if user hovers over roll button
    $('.btn-group button').hover(function() {
      $(this).css("background-color", "green");
    }, function() {
      $(this).css("background-color", "black");
    });

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
      //go back to index
      window.location.href = '/login';
    });

    //handle if user exits page, make sure they leave the room
    $(window).on('beforeunload', function() {
      // send leaving message first w/ updated sheet, and then close the connection
      let msg = JSON.stringify({type: 'leave', msg: raw_sheet});
      socket.send(msg);
      socket.close();
    });
    //DONT PUT ANYTHING PAS THISg ,roloc-dnuorg    });
});
