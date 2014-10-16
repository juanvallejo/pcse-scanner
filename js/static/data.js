(function(window) {
var App = {
	doc:null,
	events:{
		resize:[]
	},
	properties:{
		minDocumentHeight:500
	},
	addResizeListener:function(div,properties,ratio,main) {
		var self = this;
		ratio = ratio || 1;

		App.events.resize.push(function() {
			if(main) div.style[properties] = (window.innerHeight * ratio) >= self.properties.minDocumentHeight ? (window.innerHeight * ratio)+"px" : self.properties.minDocumentHeight+"px";
			else div.style[properties] = (window.innerHeight * ratio)+"px"
		});
	},

	/**
	 * Arrange and center elemens in the document relative to
	 * the current screen size.
	 * 
	 * @param doc = {Document} html native element containing the entire page
	 */
	resize:function(doc) {
		this.doc = doc;
		var mainPanel = doc.getElementById("main-panel");
		mainPanel.style.height = (window.innerHeight * 0.60)+"px";

		var editorPanel = doc.getElementById("editorPanel");
		editorPanel.style.height = (window.innerHeight * 0.15)+"px";

		var footer = doc.getElementById("footer");
		footer.style.height = (window.innerHeight * 0.25)+"px";

		this.addResizeListener(mainPanel,'height',0.60,true);
		this.addResizeListener(editorPanel,'height',0.15,false);
		this.addResizeListener(footer,'height',0.25,false);
	},
	init:function() {

	}
};

window.App = App;										// add object to global scope

})(window);

/**
 * Calls functions in the App.events.resize[] Array any time
 * the window.resize event is emitted
 * 
 * @event resize
 */
window.addEventListener('resize', function() {
	// iterate through and call functions added to resize array
	App.events.resize.forEach(function(e) {
		// add scope of App to each function
		e.call(this);
	});
});

/**
 * Initiates application when all window elements have loaded.
 * 
 * @event load
 */
window.addEventListener('load', function() {
	// resize app to fit current window dimensions
	App.resize(document);

	// define local data stats and counters
	var stats = {
		total:0,
		registered:0
	};

	var out = document.getElementById('out');			// define interface 'console' output for errors and alerts
	var sid = document.getElementById('sid-input');		// define variable to hold main scanner input element

	//focus the main input element
	sid.focus();

	sid.state = 1;

	/**
	 * Writes passed 'error message' to 'out' html element, or default
	 * error message if parameter is blank
	 * 
	 * @param err = {String} message containing error message to output to interface console
	 */
	sid.error = function(err) {
		sid.write(err || 'I couldn\'t understand that.');
	};

	/**
	 * Writes passed string to 'out' html element and resizes the 'out' element's
	 * top margin according to its new size containing the body of text passed.
	 * 
	 * @param text = {String} message containing text to output to interface console
	 */
	sid.write = function(text) {
		out.innerHTML = text || '';
		out.style.marginTop = ((-out.clientHeight / 2) + (out.clientHeight * 0.15))+'px';
	};

	/**
	 * Sends passed string to server as a command
	 * 
	 * @param command = 	{String} 	message containing text to output to interface console
	 * @param callback = 	{Function} 	to call once response from Node.js server is received
	 */
	sid.command = function(command, callback) {
		var xhr = new XMLHttpRequest();
		xhr.open('POST','/command',true);
		xhr.send(command);
		xhr.addEventListener('readystatechange',function() {
			if(this.readyState == 4 && this.status == 200) {
				if(this.responseText == 'success') {
					callback.call(this);	
				} else {
					callback.call(this,responseText);
				}
			}
		});
	};

	/**
	 * Detects when a key is pressed while main input field
	 * is focused and calls anonymous function.
	 * 
	 * @event keydown
	 */
	sid.addEventListener('keydown', function(e) {
		if(e.keyCode == 13) {
			sid.write('');

			if(sid.value == "") {
				sid.write((sid.state > 2 ? 'Please enter your name.' : 'Please enter your student ID.'));
			} else if(sid.state == 1 && sid.value.match(/^[a-z\ ]+/gi) && !sid.reg) {
				if(sid.value.match(/^(export|update|give|make|save|create)/gi) && !sid.value.match(/(["']+)/gi)) {
					if(sid.value.match(/(\ )+(csv)/gi)) {
						if(sid.temp = sid.value.match(/(emails|first names|ids|last names|fname(s|)|lname(s|))/gi)) {
							sid.write(sid.temp);
							// sid.command('/create/csv/'+sid.temp,function(err) {
							// 	if(err) {
							// 		return sid.write('There was an error creating a csv file from the requested data.');
							// 	}

							// 	sid.value = '';
							// 	sid.write('A comma-separated values file has been created from the requested data.');
							// });
						} else {
							sid.command('/export/csv',function(err) {
								if(err) {
									return sid.write('There was an error creating a CSV file from the data: '+err);
								}

								sid.value = '';
								sid.write('A CSV file has been created from the data.');
							});
						}
					} else if(sid.value.match(/(\ )+(db|mysql|sql|database)/gi)) {
						sid.command('/export/mysql',function(err) {
							if(err) {
								return sid.write('There was an error updating the Excel spreadsheet.');
							}

							sid.value = '';
							sid.write('The data has been successfully exported.');
						});
					} else {
						sid.command('/export/excel',function(err) {
							if(err) {
								return sid.write('There was an error updating the Excel spreadsheet.');
							}

							sid.value = '';
							sid.write('The data has been successfully exported.');
						});
					}
				} else if(sid.value.match(/^(how)([a-z\ ]+)(people|students|persons)/gi)) {
					if(sid.value.match(/(new)/gi)) {
						sid.write(stats.registered+' new people have signed up so far.');
					} else if(sid.value.match(/(((are)([\ ]?)(there|here|present)|((have))([\ ]?)(come|arrived|shown up|shown|signed (up|in)|registered))|(\?|()))/gi)) {
						sid.write('There are currently '+stats.total+' people signed in.');
					} else {
						sid.error();
					}
					sid.value = '';
				} else if(sid.value.match(/^(I|())(\ )+([a-z\'\.\ ]+)(id)$/gi)) {
					sid.write('If you know your student ID, please type that in.');
				} else if(sid.value.match(/^(delete|remove|erase|undo)(\ )+(the|())([a-z0-9\ ]+)(people|entr(y|ies)|row(s|)|person(s|())|name(s|)|student(s|))/)) {
					if(sid.value.match(/(last|first|latest)([\ ]+)(two|three|four|five|six|seven|eight|nine|ten)?(\ )*(new)?(\ )*(person|student|name|entry|row)/gi)) {
						if(sid.value.match(/(latest)/gi) || sid.value.match(/(last)([\ ]+)(new)?(\ )*(person|student|name|entry|row)/gi)) {
							//remove the last person signed in
							if(sid.value.match(/(new)/gi)) {
								sid.command('/event/delete/bottom/1/new',function(err) {
									if(err) {
										return sid.error('The event requested could not be removed: '+err);
									}

									sid.write('The last new person signed in has been removed.');
								});
							} else {
								sid.command('/event/delete/bottom/1',function(err) {
									if(err) {
										return sid.error('The event requested could not be removed: '+err);
									}

									sid.write('The last person signed in has been removed.');
								});
							}
						} else if(sid.value.match(/(first (person|student|name|entry|row))/gi)) {
							//remove the first student signed in
							if(sid.value.match(/(new)/gi)) {
								sid.command('/event/delete/top/1/new',function(err) {
									if(err) {
										return sid.error('The event requested could not be removed: '+err);
									}

									sid.write('The first new person signed in has been removed.');
								});
							} else {
								//'event/delete/(top|bottom|id)/(amount|amount|id)/flag
								sid.command('/event/delete/top/1',function(err) {
									if(err) {
										return sid.error('The event requested could not be removed: '+err);
									}

									sid.write('The first person signed in has been removed.');
								});
							}
						} else if(sid.value.match(/(people|persons|names|students|rows)/gi)) {
							//remove x amount of people
							sid.error('I can\'t do that yet.');
						} else {
							sid.error();
						}
					} else if(sid.temp = sid.value.match(/(last|first|latest)(\ )+([0-9]+)(\ )+(new)?(\ )*(people|students|names|rows|entries)/gi)) {
						if(sid.value.match(/(new)/gi)) {
							sid.write('The last '+sid.temp[0].split(' ')[1]+' new people have been deleted.');
						} else {
							sid.write('The last '+sid.temp[0].split(' ')[1]+' people have been deleted.');
						}
					} else {
						sid.error();
					}
				} else if(sid.value.match(/(set|event|name|speaker|company|talk|speech|presentation)/gi)) {
					if(sid.temp = sid.value.match(/(["']{1})([a-z\ 0-9\.\,\-\_\+\=\(\)\:\;\/\%\$\#\@\!\*]+)(["']{1})/gi)) {
						sid.command('/event/name/'+encodeURIComponent(sid.temp[0].substring(1,sid.temp[0].length-1)),function(err) {
							if(err) {
								return sid.error('The event\'s name could not be set: '+err);
							}

							sid.value = '';
							sid.write('This event\'t name has been set to '+sid.temp[0]);
						});
					} else {
						sid.error();
					}
				} else {
					var xhr = new XMLHttpRequest();
					xhr.open('GET','http://navigator-fixed.rhcloud.com/apis/http://www.ask.com/web?q='+encodeURIComponent(sid.value.split('?')[0])+'&qsrc=0&o=0&l=dir',true);
					xhr.send();
					xhr.addEventListener('readystatechange',function() {
						if(this.readyState == 4 && this.status == 200) {
							var wrapper = document.createElement('div');
							wrapper.innerHTML = this.responseText;

							if(wrapper.getElementsByClassName('qna-txt').length) {
								var result = wrapper.getElementsByClassName('qna-txt').item(1).innerHTML.trim().split('.');
								var answer = result[0];
								var temp;

								if(result[0].trim().length < 30) {
									answer = result[1];

									if(result[1].trim().length < 30) {
										answer = result.join('.');

										if(temp = answer.match(/(\.\.\.)/gi) && answer.match(/(Read More)/gi)) {
											result.pop();
											result.pop();

											answer = result.join('.');
										}
									}
								}

								sid.write(answer);
							} else {
								sid.error();
							}
						} else {
							sid.error();
						}
					});
				}
			} else {
				if((!sid.reg && sid.value.match(/[0-9]{8}/gi)) || (sid.reg && sid.value.match(/^[a-z]+(\ )[a-z]+/gi))) {
					var data = "sid="+sid.value.substring(2);
					var uri = '/register';

					if(sid.reg) {
						data = "sid="+sid.sid+"&name="+sid.value;
						uri = '/register/new';

						sid.reg = false;
						sid.sid = null;
						sid.placeholder = 'Type your ID to continue...';

						stats.registered++;
					}

					var xhr = new XMLHttpRequest();
					xhr.open('POST',uri,true);
					xhr.send(data);
					xhr.addEventListener('readystatechange',function() {
						if(this.readyState == 4 && this.status == 200) {
							var student = JSON.parse(this.responseText);
							
							sid.state = 2;

							if(student.registered) {
								if(student.alreadyRegistered) {
									sid.value = 'Welc... oh, you again?';
									sid.error('You cannot register more than once per event.');
								} else {
									stats.total++;
									sid.value = 'Welcome, '+student.fname+' '+student.lname;

									sid.write('There are now a total of '+stats.total+' people at this event.');
								}
							} else {
								sid.write('"You must be new here..." --Gene Wilder');

								sid.value = '';
								sid.placeholder = 'Enter your name to continue...';
								sid.state = 3;
								sid.reg = true;
								sid.sid = student.id;
							}
						}
					});
				} else {
					if(!sid.reg) {
						sid.write('Please enter a valid student ID.');
					} else {	
						sid.write('Please enter your full name.');
					}
				}
			}
		} else if(e.keyCode == 27) {
			if(sid.reg) {
				sid.state = 1;
				sid.reg = false;
				sid.value = '';
				sid.placeholder = 'Type your ID to continue...';

				sid.write('');
			}
		} else {
			if(sid.state == 2) {
				sid.state = 1;
				sid.value = '';
			} else if(sid.state == 3) {
				sid.state = 1;
				sid.value = '';
			}			
		}
	});
});