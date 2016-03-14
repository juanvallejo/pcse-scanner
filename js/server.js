/**
 * Creates an http server and serves a static 'index.html' file
 * back to the client. Listens for 'API calls' from the client and 
 * serves back database information accordingly.
 *
 * Listens at address: http://localhost:{SERVER_PORT}/
 **/

var fs 		= require('fs');
var http 	= require('http');
var routes 	= require('./routes.js');
var mimes 	= require('./mimes.js');
var consts 	= require('./constants.js');

var server = {

	_server: null,
	_callbacks: {},

	events: {
		EVT_ON_REGISTER: 'register',
		EVT_ON_NEWREGISTER: 'new_register',
		EVT_ON_COMMAND: 'command'
	},

	on: function(eventName, callback) {

		if(!server._callbacks[eventName]) {
			server._callbacks[eventName] = [];
		}

		server._callbacks[eventName].push(callback);
	},

	emit: function(eventName, params) {
		
		if(!server._callbacks[eventName]) {
			return;
		}

		if(!(params instanceof Array)) {
			params = [params];
		}

		server._callbacks[eventName].forEach(function(fn) {
			fn.apply(server, params);
		});
	},

	handle_register_req: function(db, res, value) {

		var id = value.split('id=')[1];
		var name = db.find({
			id: id
		});

		var response = {
			id: id
		};

		if(name.length == 0) {

			// if initial id is not found, attempt to
			// find id with two leading zeroes
			var name2 = db.find({
				id: '00' + id
			});

			if(name2.length > 0) {
				name = name2;
			}
			
		}

		if(name.length > 0) {
			var entry = db.get(name[0].index);

			// check to see if entry has already been registered for this event
			if(entry.registered) {
				response.alreadyRegistered = true;
			} else {
				entry.visits++;

				// register entry with the local database object indicating student has signed in to the event
				db.register(name[0]);
			}

			response.fname = name[0].fname;
			response.lname = name[0].lname;
			response.registered = true;

		} else {
			response.registered = false;
		}

		res.end(JSON.stringify(response));

	},

	handle_register_new_req: function(db, res, value) {

		var entry 	= {};									// create a new entry object with fields passed from client
		var values 	= decodeURIComponent(value).split('&');	// create array of key-value pairs of passed data

		// create response object
		var response = {};

		// format key-value pair and add to object 'entry'
		values.forEach(function(item, index) {
			// split value pair into key and value and save array
			var valuePair = item.split('=');

			// add key-value pair to entry object
			entry[valuePair[0]] = valuePair[1];
		});

		// todo change format of name in client side
		console.log('Registering \'' + entry.first + ' ' + entry.last + '\' with ID ' + entry.student_id);

		// add entry id to list of registered entries
		db.registerNew(entry);

		//return entry id in response object
		response.id = entry.student_id;

		if(entry.first) {
			response.fname = entry.first;
			response.lname = entry.last;
			response.registered = true;
		} else {
			response.registered = false;
			response.registerError = true;
		}

		res.end(JSON.stringify(response));

	},

	handle_command_req: function(scanner, api, output, mysql, db, res, value) {

		// split command string into sub-commands
		var command = value.split('/');					// [1] -> target / object to apply the command to
														// [2] -> action to apply to target
														// [3] -> data to use when applying action to target

		if(command[1] == 'export') {

			// activate spreadsheet export
			if(command[2] && command[2] == 'excel') {

				scanner.exportDatabase(scanner, db, mysql, api, output, 'excel', function(err) {

					if(err) {
						return res.end('ERR: There was an error exporting the data:', err);
					}

					console.log('EXPORT', 'EXCEL', 'Database exported through excel command');
					res.end('success');

				});


			} else {

				// override second command if mysql server is currently being used for data
				// by exporting database we are simply updating new entries and registered students
				scanner.exportDatabase(scanner, db, mysql, api, output, (mysql.isConnected ? 'mysql' : command[2]), function(err) {

					if(err) {
						// send error message back to client and exit
						return res.end('ERR: There was an error exporting the data: '+err);
					}

					console.log('EXPORT', 'MYSQL', 'database exported through mysql command');
					res.end('success');

					// if mysql db is available, also generate a spreadsheet file
					scanner.exportDatabase(scanner, db, mysql, api, output, 'excel', function(err) {
						if(!err) {
							console.log('EXPORT', 'EXCEL', 'Successfully generated excel spreadsheet for event.');
						}
					});

				});

			}

		} else if(command[1] == 'query') {
			res.end('I am not allowed to index the database yet.');
		} else if(command[1] == 'create') {
			res.end('ERR: Unimplemented command.');
		} else if(command[1] == 'event') {

			if(command[2] == 'name') {
				// set global event name,
				// add event with its new name to the 'events' table in the mysql database
				db.global_values[0] = decodeURIComponent(command[3] + ' (' + scanner.getEventId() + ')');
				scanner.updateEventName(scanner, mysql, api, decodeURIComponent(command[3]));

				// send success message back to client
				res.end('success');

			} else if(command[2] == 'delete') {
				// handles deletion of records				
				if(command[3] == 'top') {

					db.remove(scanner, mysql, db.getRegistered()[0]);
					res.end('success');

				} else if(command[3] == 'bottom') {
					// advertise command is not yet fully implemented
					console.log('Unimplemented command called.');
					return res.end('This command has not been implemented yet.');

					// initialize record to delete with last item on database
					var recordToDelete 			= db.getRegistered()[db.getRegistered().length - 1];
					var numberOfDeletedRecords 	= 0;

					// iterate through records from the bottom of the list until we find next one that hasn't been deleted
					while(!recordToDelete.deleted) {
						// increment tally of already deleted records
						numberOfDeletedRecords++;

						// assign next record from bottom as record to delete
						recordToDelete = db.getRegistered()[db.getRegistered().length - 1 - numberOfDeletedRecords];
					}

					// tell database to remove the last record on the list
					db.remove(scanner, mysql, db.getRegistered()[db.getRegistered().length - 1 - numberOfDeletedRecords], function(err) {

						if(err) {
							// advertise error
							console.log('An error occurred deleting a database record -> ' + err);

							// send back error response as JSON object to client and exit
							return res.end(JSON.stringify({
								error : err
							}));
						}

						console.log(db.getRegistered()[db.getRegistered().length-1].deleted);

						// if success, advertise
						console.log('successfully deleted entry with id ' + db.getRegistered()[db.getRegistered().length-1].id);

						// send back successful response as JSON object to client
						return res.end(JSON.stringify({
							data : {
								error : false,
								length : db.statistics.registeredCount,
								stats : db.statistics
							}
						}));
					});

				} else {
					res.end('ERR: Invalid event action.');
				}
			} else {
				res.end('ERR: Invalid event action.');
			}

		} else if(command[1] == 'request') {

			if(command[2] == 'stats') {

				res.writeHead(200, {'Content-type': 'application/json'});
				res.end(JSON.stringify({
					data : {
						stats : db.statistics,
						length : db.size('registered')
					}
				}));

			}
		} else {
			res.end('ERR: Invalid command [' + command[1] + ']');
		}
	},

	handle_req: function(req, res) {

		var path = routes[req.url] || req.url;

		if(path == '/register') {

			if(req.method == 'POST') {

				var value = '';
				req.on('data', function(chunk) {
					value += chunk;
				});

				req.on('end',function() {
					server.emit(server.events.EVT_ON_REGISTER, [res, value]);
				});

			} else {
				res.end('Invalid request.');
			}

		} else if(path == '/register/new') {

			if(req.method == 'POST') {

				var value = '';

				req.on('data',function(chunk) {
					value += chunk;
				});

				req.on('end',function() {
					server.emit(server.events.EVT_ON_NEWREGISTER, [res, value]);
				});

			} else {
				res.end('Invalid request.');
			}

		} else if(path == '/command') {
			
			// check the type of request being made is a post
			if(req.method != 'POST') {
				console.log('ERR: Invalid request.');
				return res.end('Invalid request.');
			}

			var value = '';

			req.on('data',function(chunk) {
				value += chunk;
			});

			req.on('end',function() {
				server.emit(server.events.EVT_ON_COMMAND, [res, value]);
			});

		} else {

			fs.readFile(__dirname + path, function(err, data) {

				if(err) {
					res.writeHead(404);
					return res.end('404. File not found.');
				}

				var ftype = path.split('.');
				ftype = ftype[ftype.length-1];

				res.writeHead(200, { 'Content-type':(mimes[ftype] || 'text/plain') });
				res.end(data);
			});
		}

	},

	init: function() {

		if(server._server) {
			return;
		}

		server._server = http.createServer(server.handle_req);
		server._server.listen(consts.SERVER_PORT, consts.SERVER_HOST);
	}
};

module.exports = server;