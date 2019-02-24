var socket;
console.log("before doc");
$(document).ready(function(){
    console.log("doc loaded");
	socket = io.connect('http://' + document.domain + ':' + location.port + '/play');
	socket.on('connect', function(){
		console.log("socket connected");
		socket.emit('joined', {});
	});
	
	socket.on('status', function(data){
		console.log(data);
		$('#chatlog').append('<p style=\'color:' + data.color + '\'>' + data.msg + '</p>');
		$('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
	});
	
	socket.on('message', function(data){
		console.log(data);
		$('#chatlog').append('<p style=\'color:' + data.color + '\'>' + data.msg + '</p>');
		$('#chatlog').scrollTop($('#chatlog')[0].scrollHeight);
	});
	
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
			socket.emit('text', {msg: t});
		}
    });
});
function leave_room(){
    socket.emit('left', {}, function(){
        socket.disconnect();
        window.location.href = "/static/index.html";
    });
}