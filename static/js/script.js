
$(document).ready(function()
{
	$('#joindm').click(function(){
		console.log("That doesn't work goofball.");
	});

    $('.create_btn').click(function(){
	   let p_field1 = $('#password')
       let p_field2 = $('#confirmPassword')
       let p1 = p_field1.val();
       let p2 = p_field2.val();

        if (p1 != p2) {
            p_field1[0].setCustomValidity('Passwords do not match');
            p_field1[0].reportValidity();
            return;
        }else if(p1.length < 6){
            p_field1[0].setCustomValidity('Passwords must be 6 or more characters in length');
            p_field1[0].reportValidity();
            return;
        }

        p_field1[0].setCustomValidity('');
	});
});

// create handlers for error box
function load_error_handlers() {
    // someone clicks to exit, remove box
    $('.btn.errorbtn').click(function(){
        let parent = this.closest('.errorbox');   //start nearest error box, remove all children
        $(parent).children().remove();
        $(parent).remove();
    });

}