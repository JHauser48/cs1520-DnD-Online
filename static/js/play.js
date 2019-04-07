var socket;
var uname;
var roomname;
var isPlayer;
var dice_data = [0, 0, 0, 0, 0, 0]; // d4, d6, d10, d12, d20

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

    //DM variables
    var newMonsterEdit = { //new monster info that gets input into the html
      'size':'', 'type':'', 'alignment': '', 'ac': '', 'hp': '',
      'hit_dice': { 'number': '', 'value' : '', }, 'speed': '',
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
          $('#chatlog').append('<p style=\'color:' + data.color + ';' + 'font-weight:' + data.weight +'\'>&lt;' + data.msg + '&gt;</p>');
          $('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
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
                $('#' + curr_but).append(' (click to view)');
              }
            }
            if ($('.' + box_id).attr('id') == 'hidden') {
              //if not already shown, show the clicked box
              $('.' + box_id).attr('id', 'shown');
              let curr_html = $('#' + but_id).html();
              // active window, remove (click to view)
              curr_html = curr_html.replace(' (click to view)', '');
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
          all_sheets += '<div class="row"><div class="col title"><button class="btn but_sheet title" id = "create_sheet">' +
          'Create New DM Sheet</button></div></div>'; //add create sheet in case change mind
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
          var addInputChangeEvent = function(){//}
            $('input:not([name^="new"])').change(()=>{
              $('#div-' + $('input[name=name]').val() + '-btn').css('color', 'red');
            });
          }

          //ability score change event listener
          //automatically updates the ability scores' mod value
          //this doesn't work cause of adding the same listener multiple times
          //$('[id^="ability-scores-"]').filter(':even').each(()=>{$(this).find('input').change(()=>{
          //    $('input[name=' + $(this).attr('name') + '-mod]').val(getASModifier($(this).val()));
          //});});

          //if one of the add buttons is clicked then also say we need to save the monster
          $('div[id^="add"]').click(()=>{
            $('#div-' + $('input[name=name]').val() + '-btn').css('color', 'red');
          });

          //ability score change event listener
          //automatically updates the ability scores' mod value
          //this doesn't work cause of adding the same listener multiple times
          $('[id^="ability-scores-"]').filter(':even').each(()=>{$(this).find('input').change(()=>{
              $('input[name=' + $(this).attr('name') + '-mod]').val(getASModifier($(this).val()));
          });});

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
            $('input[name=speed]').val(currentMonsterEdit.speed);
            $('input[name=hp]').val(currentMonsterEdit.hp);
            $('input[name=hdnumber]').val(currentMonsterEdit.hit_dice.number);
            $('input[name=hdvalue]').val(currentMonsterEdit.hit_dice.value);
            $('input[name=alignment]').val(currentMonsterEdit.alignment);
            //console.log(currentMonsterEdit);
            //ability scores
            for(ability in currentMonsterEdit.ability_scores){
              $('input[name=' + ability + ']').val(currentMonsterEdit.ability_scores[ability]);
              $('input[name=' + ability + '-mod]').val(getASModifier(currentMonsterEdit.ability_scores[ability]));
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
                                  <div class="col col-md-6">
                                    Name: <input type="text" class="newMonsterTextField" name="skillName" value="` + currentMonsterEdit.skills[skill].skill + `">
                                  </div>
                                  <div class="col col-md-6">
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
                                    S: <input type="text" class="newMonsterTextField" name="langS" value="` + currentMonsterEdit.languages[lang].speak + `">
                                  </div>
                                  <div class="col col-md-2">
                                    U: <input type="text" class="newMonsterTextField" name="langU" value="` + currentMonsterEdit.languages[lang].understand + `">
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
            addInputChangeEvent();
          }
          //loads a new monster by default
          loadMonsterEdit('');
          $('#newmonsterbtn').click(()=>{loadMonsterEdit('');});

          $('#addSkill').click(function(){
            skName = $('input[name=newSkillName]').val();
            skValue = $('input[name=newSkillValue]').val();
            if(skName == '') return;
            currentMonsterEdit.skills.push({'skill': skName, 'value': skValue});
            //construct html
            var skillRow = $(`<div class="row">
                                <div class="col col-md-6">
                                  Name: <input type="text" class="newMonsterTextField" name="skillName" value="` + skName + `">
                                </div>
                                <div class="col col-md-6">
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
            langS = $('input[name=newLangS]').val();
            langU = $('input[name=newLangU]').val();
            if(langName == '') return;
            currentMonsterEdit.languages.push({'language': langName, 'speak': langS, 'understand': langU});
            //construct html
            var langRow = $(`<div class="row">
                                <div class="col col-md-8">
                                  Lang: <input type="text" class="newMonsterTextField" name="langName" value="` + langName + `">
                                </div>
                                <div class="col col-md-2">
                                  S: <input type="text" class="newMonsterTextField" name="langS" value="` + langS + `">
                                </div>
                                <div class="col col-md-2">
                                  U: <input type="text" class="newMonsterTextField" name="langU" value="` + langU + `">
                                </div>
                              </div>`);
            $('#langList').append(langRow);
            //clear the new lang row
            $('input[name=newLangName]').val('');
            $('input[name=newLangS]').val('');
            $('input[name=newLangU]').val('');
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

          $('#addmonsterbtn').click(function(){
            //the monster should at least have a name for it to be added.
            //maybe have a 'complete' flag that is false if any needed info is missing so we don't add an incomplete monster to the Encounter
            monsterName = $('input[name=name]').val();
            if(monsterName == ''){
              $('#monstername').css('color', 'red');
              return;
            }else{
              //set button css to default
              $('#div-' + monsterName + '-btn').css('color', '');
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
                    var lS = $(this).find('input[name=langS]').val();
                    var lU = $(this).find('input[name=langS]').val();
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
              newdiv.click(()=>{loadMonsterEdit(monsterName);});
              $('#mmonsterlist').append(newdiv);
            }
            //add new monster to the raw json
            raw_sheet['monsters'][monsterName] = monsterToSave;
            console.log(raw_sheet['monsters'][monsterName]);
          });
          //get monster divs from monster list in the edit monster div
          $('#mmonsterlist').children('div').each(function(){
            //the next div is the one with the json in it
            //var monsterjson = JSON.parse($(this).children().html());
            $(this).click(()=>{loadMonsterEdit($(this).html())});
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
      console.log(raw_sheet);
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
      let msg = JSON.stringify({type: 'dice_roll', dice_list: dice_data, modifier: mod, modifier_value: mod_val, adv: adv, disadv: disadv});
      socket.send(msg);
      dice_data = [0, 0, 0, 0, 0, 0]
    });

    $('#d4').click(function(){
        dice_data[0] += 1;
    });

    $('#d6').click(function(){
       dice_data[1] += 1;
    });

    $('#d8').click(function(){
        dice_data[2] += 1;
    });

    $('#d10').click(function(){
        dice_data[3] += 1;
    });

    $('#d12').click(function(){
        dice_data[4] += 1;
    });

    $('#d20').click(function(){
        dice_data[5] += 1;
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
