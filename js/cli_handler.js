
/**
 * Module for reading scanner input from the command line.
 * Does not interpret commands or export results.
**/

var value = '';												// buffer containing individual input entered into command line
var ready = false;											// Specifies whether value 'buffer' is ready to be parsed. Also
															// used by spreadsheet parser function to indicate contents of file
															// have been read and have been added to the database object

var handler = {

	_callbacks: {},

	events: {
		EVT_ONDATA: 'data'
	},

	on: function(eventName, callback) {

		if(!handler._callbacks[eventName]) {
			handler._callbacks[eventName] = [];
		}

		handler._callbacks[eventName].push(callback);
	},

	emit: function(eventName, params) {
		
		if(!handler._callbacks[eventName]) {
			return;
		}

		if(!(params instanceof Array)) {
			params = [params];
		}

		handler._callbacks[eventName].forEach(function(fn) {
			fn.apply(handler, params);
		});
	},

	handle_cli_input: function(db, data) {

		data = data.substring(2);
		var search = db.find({
			id: data
		});

		if(search.length) {
			console.log('INFO', 'Welcome back, ' + search[0].fname + ' '+search[0].lname+'!');
		} else {
			console.log('WARN', 'Student id does not exist. Please use gui client (http://localhost:8000/) to add new entries.');
		}

	},

	/**
	 * listens for data input from keyboard and
	 * parses it by checking input against database.
	 *
	 * @event data
	**/
	init: function() {

		// set stdinp to treat all keyboard input as 'raw' input
		process.stdin.setRawMode(true);

		// set character encoding for keyboard input
		process.stdin.setEncoding('utf8');

		process.stdin.on('data',function(key) {

			if(key =='\3') {
				process.exit();
			} else if(key == '\r') {
				if(ready) {
					var command = value.split('/');
					if(command[1] == 'export') {
						if(command[2] == 'excel') {
							console.log('Please use the graphical interface to interact with this command.');
						} else if(command[2] == 'csv') {
							console.log('Please use the graphical interface to interact with this command.');
						}
					} else {
						handler.emit(handler.events.EVT_ONDATA, [value]);
					}

					value = '';
				} else {
					console.log('The database must be loaded before any input can be processed.');
				}
			} else {
				value += key;
			}
		});
	}

};

module.exports = handler;