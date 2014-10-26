/**
* Provided under the MIT License (c) 2014
* See LICENSE @file for details.
*
* @file scanner.js
*
* @author juanvallejo
* @date 10/15/14
*
* Scanner application 'server'. Handles all data processing and i/o.
* Reads data from a local mysql database, builds an internal structure
* with it, and allows for easy manipulation of it. Outputs to .xlsx file.
*
* Note: @callback_params are parameters passed to a callback function
*
* Important: Requires the following dependencies / node.js packages:
*
*		- csv 	-> npm install fast-csv
* 		- excel -> npm install excel
* 		- mysql	-> npm install mysql
* 		- xlsx 	-> npm install xlsx-writer
*/

// define server constants
var SERVER_PORT 		= 8000;								// port at which to have server listen for connections

// define excel output and input filenames
var EXCEL_OUTPUT_FILE 	= 'db.xlsx';						// define name of output spreadsheet file (will be replaced) if it exists
var EXCEL_AUTOSAVE_FILE	= 'db_autosave.xlsx';				// defines filename used to export autosaved backups of database entries

// define default mysql constants
var MYSQL_DEFAULT_HOST 	= 'localhost';						// define address of mysql server
var MYSQL_DEFAULT_PASS	= '';								// define password for mysql server
var MYSQL_DEFAULT_DB 	= 'pizza_my_mind';					// define default mysql database name
var MYSQL_DEFAULT_USER	= 'root';							// define username for mysql server

/**
 * define node.js libraries and dependencies
**/
var fs 		= require('fs');
var http 	= require('http');
var excel 	= require('excel');
var xlsx 	= require('xlsx-writer');
var csv 	= require('fast-csv');

/**
 * define stdin variables and settings used in the command line
 * interface part of the program, as well as global flags and 
 * varying settings used in the general application.
**/
var global_date = '0_0_0000';								// holds global date property for program
var stdin = process.stdin;									// grabs all keyboard input
var value = '';												// buffer containing individual input entered into command line
var ready = false;											// Specifies whether value 'buffer' is ready to be parsed. Also
															// used by spreadsheet parser function to indicate contents of file
															// have been read and have been added to the database object

// set stdinp to treat all keyboard input as 'raw' input
stdin.setRawMode(true);

// set character encoding for keyboard input
process.stdin.setEncoding('utf8');

/**
 * listens for data input from keyboard and
 * parses it by checking input against database.
 *
 * @event data
**/
stdin.on('data',function(key) {
	if(key =='\3') {
		process.exit();
	} else if(key == '\r') {
		if(ready) {
			var command = value.split('/');
			if(command[1] == 'export') {
				if(command[2] == 'excel') {
					exportDatabase();
				} else if(command[2] == 'csv') {
					console.log('Please use the graphical interface to interact with this command.');
				}
			} else {
				parseBarcode(value);
			}
			value = '';
		} else {
			console.log('The database must be loaded before any input can be processed.');
		}
	} else {
		value += key;
	}
});

/**
 * Matches passed string of numbers against ids in
 * database and emits a console response accordingly
 *
 * @param code = {String} of numbers containing a student id
**/
function parseBarcode(code) {
	code = code.substring(2);
	var search = database.find({
		id:code
	});

	if(search.length) {
		console.log('Welcome back, '+search[0].fname+' '+search[0].lname+'!');
	} else {
		console.log('You must be new here... ('+code+')');
	}
};

/**
 * define main app settings and methods
**/
var scanner = {
	// define fields, properties, and flags
	events : {}, 														// holds created event keys and associated callback functions in array values

	/**
	 * 'emits' an app 'event' by calling all queued callback functions
	 * under that specific event's value array, using its name as key
	 *
	 * @param eventName = {String} containing name-key of event
	**/
	emit : function(eventName) {
		// check if event key has been initialized
		if(scanner.events.eventName && scanner.events.eventName.length) {
			// if event key has been created under events, and it contains functions, call them
			scanner.events.eventName.forEach(function(action) {
				action.call(scanner);
			});
		}
	},

	/**
	 * 'emits' an app 'event' by calling all queued callback functions
	 * under that specific event's value array, using its name as key
	 *
	 * @param eventName = {String} containing name-key of event
	 * @param callback = {Function} containing action to perform when event is emitted
	**/
	on : function(eventName, callback) {
		// check to see if event has been created before
		if(!scanner.events.eventName) {
			// allocate new entry for eventName, and initialize its array value to hold functions
			scanner.events.eventName = [];
		}

		// add callback function to list of functions to be called when event is emitted.
		scanner.events.eventName.push(callback);
	}
};

/**
 * define mysql connection object
**/
var mysql = {
	// define mysql object properties
	connection 			: 	null,				// holds the connection object to the mysql server or null if not connected
	eventTableCreated	: 	false,				// flag indicating whether a mysql table has been created for current event
	hasData				:	false,				// flag indicating whether mysql database table contains any data
	isBusy 				: 	false, 				// flag indicating whether a mysql query is currently ongoing
	isConnected			: 	false,				// flag indicating whether a connection to mysql server has been established
	library				: 	require('mysql'),	// define and import node.js package

	// define name of mysql table to hold data for current event
	eventTableName		: 	global_date,

	/**
	 * creates and establishes a connection to
	 * the mysql server
	 *
	 * @param host 		= {String} specifying mysql server address
	 * @param user		= {String} specifying database account username
	 * @param password	= {String} specifying database account password
	 * @param database 	= {String} specifying the name of database to connect to
	**/
	connect : function(host, user, password, database) {
		// check to see if previous connection exists, or @params for new connection are passed
		if(!mysql.isConnected || (host && user && password)) {
			// create connection blueprint
			mysql.connection = mysql.library.createConnection({
				host: 			host || MYSQL_DEFAULT_HOST,
				user: 			user || MYSQL_DEFAULT_USER,
				pass: 		password || MYSQL_DEFAULT_PASS,
				database: 	database || MYSQL_DEFAULT_DB
			});

			// create connection to server
			mysql.connection.connect(function(err) {
				// check to see if connection was successful
				if(err) {
					console.log('Error establishing a connection to the mysql server -> '+err);

					return;
				}

				console.log('successfully connected to mysql server');
			});

			// tell connection flag that connection was successful
			mysql.isConnected = true;

			// if new connection @params are given, or there is no previous connection,
			// create one and return it
			return mysql.connection;
		} else {
			// return existing connection to the database
			return mysql.connection;
		}
	},

	/**
	 * safely closes the mysql connection
	**/
	end : function() {
		if(mysql.isConnected) {
			// reset our flag to indicate no connection exists
			mysql.isConnected = false;

			// send close packet to server
			mysql.connection.end();
		}
	},

	/**
	 * inserts new entry to mysql database
	 *
	 * @param mysqlTableName  	= {Object}		entry object from local 'database' object
	 * @param databaseColumns 	= {Array} 		containing names of mysql table columns to insert values into
	 * @param valuesToAdd		= {Array} 		containing entry values to add
	 * @param callback 			= {Function} 	to call after operation has completed successfully
	**/
	insertInto : function(mysqlTableName, databaseColumns, valuesToAdd, callback) {
		// our values to add have to be in quotes. Add them to each value on the list
		valuesToAdd.forEach(function(value, index) {
			valuesToAdd[index] = '"' + value + '"';
		});

		// join arrays of column names and values to add by commas and add them to our query string
		mysql.connect()
			.query('INSERT INTO ' + mysqlTableName + '(' + (databaseColumns.join(',')) + ') VALUES (' + valuesToAdd.join(',') + ')', 
				// call user's callback function
				function(err) {
					// get err param if any and pass it to callback before calling
					callback.call(mysql, err);
				});
	},

	/**
	 * selects entries from table, using passed logic
	 *
	 * @param mysqlTableName  	= {Object}		entry object from local 'database' object
	 * @param databaseColumns 	= {Array} 		containing names of mysql table columns to select
	 * @param whereLogic 		= {String} 		containing equality to use to target the selection of a specific row
	 * @param callback 			= {Function} 	to call after operation has completed successfully
	 *
	 * if @param whereLogic is 'null', all rows are selected and returned
	**/
	selectFrom : function(mysqlTableName, databaseColumns, whereLogic, callback) {
		// perform query
		mysql.connect()
			.query('SELECT ' + databaseColumns.join(',') + ' FROM ' + mysqlTableName + ' WHERE ' + (whereLogic || '1 = 1'), callback);
	},

	/**
	 * updates entry in database table, using passed logic
	 *
	 * @param mysqlTableName  	= {Object}		entry object from local 'database' object
	 * @param databaseColumns 	= {Array} 		containing names of mysql table columns to update values
	 * @param updatedValues		= {Array} 		containing updated entry values
	 * @param whereLogic 		= {String} 		containing equality to use to target the update of a specific row
	 * @param callback 			= {Function} 	to call after operation has completed successfully
	**/
	update : function(mysqlTableName, databaseColumns, updatedValues, whereLogic, callback) {
		// variable containing key value pairs to update from arrays passed
		var keyValuePairs = '';

		// generate and store key-value pairs from our two arrays
		databaseColumns.forEach(function(column, index) {
			// add to our string of pairs
			keyValuePairs += ',' + column + ' = ' + '"' + updatedValues[index] + '"';
		});

		// strip comma from key value pairs string
		keyValuePairs = keyValuePairs.substring(1);

		// join arrays of column names and values to add by commas and add them to our query string
		mysql.connect()
			.query('UPDATE ' + mysqlTableName + ' SET ' + keyValuePairs + ' WHERE ' + (whereLogic || '1 = 1'), 
				// call user's callback function
				function(err) {
					// get err param if any and pass it to callback before calling and exit
					return callback.call(mysql, err);
				});
	}
};

/**
 * define main database object used to hold, add, and handle data
 * entries from spreadsheet
**/
var database = {
	// define fields and flags
	populated 		: false,												// indicates whether database has been populated by external bank of data (through mysql or excel)
	entries 		: [],
	raw_data 		: [],
	last_reg 		: [],
	last_new_reg 	: [],
	global_values 	: [], 													// global_values[0] holds company name data

	// define statistics object, holds data analysis information
	statistics		: {
		average 	: 0, 													// holds value for average amount of visitors per event
		averageNew 	: 0 													// holds value for average amount of new visitors per event
	},

	add:function(entry) {
		// if we are passed an array of arrays, assume data came from parsing an excel spreadsheet
		if(entry instanceof Array) {
			database.raw_data.push(entry);
			database.entries.push({
				index:database.entries.length,
				id:entry[0],
				fname:entry[2],
				lname:entry[1],
				year:entry[3],
				major:entry[4],
				email:entry[5],
				visits:entry[6] == ' ' ? 0 : parseInt(entry[6]),
				events:(!entry[7]) ? '' : entry[7],
				registered:false,
				deleted:false
			});

		} else {
			// assume mysql data (in form of JSON objects) otherwise
			database.entries.push({
				index 							: 	database.entries.length,
				id 								: 	entry.student_id,
				fname 							: 	entry.first,
				lname 							: 	entry.last,
				year 							: 	entry.year,
				major 							: 	entry.major,
				email 							: 	entry.email,
				visits 							: 	0,									// 1 or 0 depending on whether entry has already been registered
				events 							: 	'',									// contains string with current event's name
				isNew 							: 	entry.isNew 	 || false, 			// flag indicating whether entry is new to the database
				registered 						: 	entry.registered || false,			// flag indicating whether entry has been registered by the client
				deleted 						: 	false,								// flag indicating whether entry has been issued a request for removal by client
				existsInMysqlDatabase			: 	false, 								// flag indicating whether entry exists in main 'students' table in mysql server
				addedToCurrentMysqlEventTable	: 	false 								// flag indicating whether entry exists  in  current event's mysql table
			});
		}

		return database.entries[database.entries.length-1];
	},

	/**
	 * Loops through each 'new' entry for this event added to the database and calls parameter function,
	 * passing current entry and its index as parameters
	 *
	 * @param callback = {Function} to call on every iteration
	**/
	forEachNewEntry:function(callback) {
		for(var i = 0; i < database.last_new_reg.length; i++) {
			// call the passed function for every item in 'database' where 'database'
			// is the scope, 'database.last_new_reg[i]' is the entry and 'i' is the current index
			callback.call(database, database.last_new_reg[i], i);
		}
	},

	/**
	 * Loops through each database 'entry' and calls parameter function,
	 * passing current entry and its index as parameters
	 *
	 * @param callback = {Function} to call on every iteration
	**/
	forEach:function(callback) {
		for(var i=0;i<database.size();i++) {
			// call the passed function for every item in 'database' where 'database'
			// is the scope, 'database.get(i)' is the entry and 'i' is the current index
			callback.call(database, database.get(i), i);
		}
	},
	get:function(index) {
		return database.entries[index];
	},
	getRawData:function() {
		return database.raw_data;
	},
	getRegistered:function() {
		return database.last_reg;
	},
	getRegisteredNew:function() {
		return database.last_new_reg;
	},
	find:function(term) {
		var results = [];
		if(typeof term == 'object') {
			var found = true;
			for(var i=0;i<database.entries.length;i++) {
				found = true;
				for(var x in term) {
					if(database.entries[i][x] != term[x]) {
						found = false;
					}
				}
				if(found) {
					results.push(database.entries[i]);
				}
			}
		} else {
			for(var i=0;i<database.entries.length;i++) {
				if(database.entries[i].id == term || database.entries[i].fname == term || database.entries[i].lname == term || database.entries[i].year == term || database.entries[i].major == term || database.entries[i].email == term) {
					results.push(database.entries[i]);
				}
			}
		}
		return results;
	},
	has:function(id) {
		var found = false;
		for(var i=0;i<database.entries.length;i++) {
			if(database.entries[i].id == id) {
				found = true;
				break;
			}
		}
		return found;
	},
	hasRegistered:function(entry) {
		var response = false;

		if(typeof entry == 'object') {
			for(var i=0;i<database.last_reg.length;i++) {
				if(database.last_reg[i] == entry) {
					response = true;
				}
			}
		}

		return response;
	},
	register:function(entry) {
		if(typeof entry == 'object') {
			// tell program entry is now registered
			entry.registered = true;

			// push entry to last_reg array of recently registered entries
			database.last_reg.push(entry);

		} else {
			// if entry is a string, we assume we are given its id. Find object from id and store it
			database.last_reg.push(database.find({
				id:entry
			})[0]);

			//tell program entry is now	registered
			entry.registered = true;
		}
	},
	registerNew:function(entry) {
		// tell program entry is now registered
		entry.registered = true;

		// tell program whether entry is new
		entry.isNew = true;

		// add entry to the main database
		database.add(entry);

		// store entry in the last_new_reg array of recently stored 'new' entries as well as normal last_reg list
		database.last_new_reg.push(entry);
		database.last_reg.push(entry);
	},
	remove:function(entry) {
		if(entry) {
			entry.deleted = true;
		}
	},
	setRawData:function(data) {
		raw_data = data;
	},
	size:function() {
		return database.entries.length;
	}
};

/**
 * define file extensions and their associated 'content' mime type
 * to be served back to the client
**/
var mimes = {
	'js':'application/javascript',
	'html':'text/html',
	'png':'image/png',
	'jpg':'image/jpeg',
	'jpeg':'image/jpeg',
	'css':'text/css',
	'ico':'image/x-ico',
	'txt':'text/plain',
	'gif':'image/gif'
};

/**
 * reroutes defined keys to their assigned destination
**/
var routes = {
	'/':'/index.html'
};

/**
 * Creates an http server and serves a static 'index.html' file
 * back to the client. Listens for 'API calls' from the client and 
 * serves back database information accordingly.
 *
 * Listens at address: http://localhost:{SERVER_PORT}/
 **/
http.createServer(function(req, res) {
	var path = routes[req.url] || req.url;

	if(path == '/register') {
		if(req.method == 'POST') {
			var value = '';
			req.on('data',function(chunk) {
				value += chunk;
			});
			req.on('end',function() {
				var id = value.split('id=')[1];
				
				var name = database.find({
					id:id
				});

				var response = {
					id:id
				};

				if(name.length == 0) {
					var name2 = database.find({
						id:'00'+id
					});

					if(name2.length > 0) {
						name = name2;
					}
				}

				if(name.length > 0) {
					var entry = database.get(name[0].index);

					// check to see if entry has already been registered for this event
					if(entry.registered) {
						response.alreadyRegistered = true;
					} else {
						entry.visits++;
						entry.events += (database.global_values[0] || global_date) + ',';

						// register entry with the local database object indicating student has signed in to the event
						database.register(name[0]);
					}

					response.fname = name[0].fname;
					response.lname = name[0].lname;
					response.registered = true;
				} else {
					response.registered = false;
				}

				res.end(JSON.stringify(response));
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
				var entry 	= {};									// create a new entry object with fields passed from client
				var values 	= value.split('&');						// create array of key-value pairs of passed data

				// create response object
				var response = {};

				// format key-value pair and add to object 'entry'
				values.forEach(function(item, index) {
					// split value pair into key and value and save array
					var valuePair = item.split('=');

					// add key-value pair to entry object
					entry[valuePair[0]] = valuePair[1];
				});

				// format the entry id to include two 0's in front of number to match database format
				entry.student_id = '00' + entry.student_id;

				// #todo change format of name in client side
				console.log('Registering \'' + entry.first + ' ' + entry.last + '\' with ID ' + entry.student_id);

				// add entry id to list of registered entries
				database.registerNew(entry);

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
			});
		}
	} else if(path == '/command') {
		if(req.method == 'POST') {
			var value = '';

			req.on('data',function(chunk) {
				value += chunk;
			});
			req.on('end',function() {
				// split command string into sub-commands
				var command = value.split('/');					// [1] -> target / object to apply the command to
																// [2] -> action to apply to target
																// [3] -> data to use when applying action to target

				if(command[1] == 'export') {
					// override second command if mysql server is currently being used for data
					// by exporting database we are simply updating new entries and registered students
					exportDatabase((mysql.isConnected ? 'mysql' : command[2]), function(err) {
						// check for errors
						if(err) {
							// send error message back to client and exit
							return res.end('ERR: There was an error exporting the data: '+err);
						}

						// advertise method of database export
						console.log('database exported through command');

						// send success message back to client
						res.end('success');
					});

					// generate a mysql table with all student information to easily add to spreadsheet
					generateOutputMysqlTable();

					// update mysql 'events' table with current entry counts
					addToMysqlEventsTableUsingName(mysql.eventTableName);

				} else if(command[1] == 'query') {
					// send error back to client
					res.end('I am not allowed to index the database yet.');
				} else if(command[1] == 'create') {
					res.end('ERR: Unimplemented command.');
				} else if(command[1] == 'event') {
					if(command[2] == 'name') {
						database.global_values[0] = decodeURIComponent(command[3]+' ('+global_date+')');

						// add event with its new name to the 'events' table in the mysql database
						addToMysqlEventsTableUsingName(decodeURIComponent(command[3]));

						// send success message back to client
						res.end('success');
					} else if(command[2] == 'delete') {						
						if(command[3] == 'top') {
							database.remove(database.getRegistered()[0]);
							res.end('success');
						} else if(command[3] == 'bottom') {
							database.remove(database.getRegistered()[database.getRegistered().length-1]);
							res.end('success');
						} else {
							res.end('ERR: Invalid event action.');
						}
					} else {
						res.end('ERR: Invalid event action.');
					}
				} else {
					res.end('ERR: Invalid command.');
				}
			});
		} else {
			console.log('ERR: Invalid request.');
		}
	} else {
		fs.readFile(__dirname+path,function(err,data) {
			if(err) {
				res.writeHead(404);
				return res.end('404. File not found.');
			}

			var ftype = path.split('.');
			ftype = ftype[ftype.length-1];

			res.writeHead(200,{'Content-type':(mimes[ftype] || 'text/plain')});
			res.end(data);
		});
	}
}).listen(SERVER_PORT);

/**
 * Takes the event's official name assigned by the user through the client, and 
 * adds it to the mysql 'events' table, pairing it with the table's name (created using the global_date
 * for such event.
 *
 * @param eventName	= {String} containing current event's name assigned through the client by user
**/
function addToMysqlEventsTableUsingName(eventName) {
	// now that a name for this event has been passed, assign in to our mysql object, if eventName is null or
	// undefined, use default name of global_date.
	mysql.eventTableName = eventName || global_date;
	// check to see if database has already been added to events table in mysql server
	mysql.connect()
		.query('SELECT * FROM events WHERE table_name = \'' + global_date + '\'', function(err, rows, fields) {
			// check for errors
			if(err) {
				// log error
				return console.log('An error occurred checking if a table name has previously been assigned to the mysql events table -> ' + err);
			}

			// if success, determine whether table has indeed been added to events table before
			if(rows.length) {
				// ensuring an event name was already assigned in a previous server session throughout the same event, restore
				// that name...
				if(!eventName) {
					mysql.eventTableName = rows[0].event_name;
				}

				// ...else if an eventName @param is passed, assume intent is to actually update event's name,
				// if not, use existing name instead of default global_date

				mysql.update(

					'events', 
					['event_name', 'total', 'total_new'], 
					[mysql.eventTableName, (database.getRegistered().length), database.getRegisteredNew().length], 

					// add 'where' conditional logic
					'table_name = "' + global_date + '"', 

					function(err) {
					// check for errors
					if(err) {
						// log error and exit
						return console.log('An error occurred updating table name information in mysql server -> ' + err);
					}

					// log success
					console.log('successfully renamed table ' + global_date + ' to ' + mysql.eventTableName + ' in mysql events table.');
				});

			} else {
				// if table has never been registered with an event name, register it, adding default (global_date) name,
				// associating that with user-generated event_name, total number of registered entries so far, and total new entries
				mysql.insertInto(

					'events', 
					['table_name', 'event_name', 'total', 'total_new'], 
					[global_date, mysql.eventTableName, (database.getRegistered().length + database.getRegisteredNew().length), database.getRegisteredNew().length], 

					function(err) {
					// check for errors
					if(err) {
						// log error and exit
						return console.log('An error occurred adding event-table ' + 
							global_date + ' with name ' + mysql.eventTableName + ' to the mysql server -> ' + err);
					}

					// if no errors advertise success to console
					console.log('successfully added table ' + global_date + ' with name ' + mysql.eventTableName + ' to mysql events table ');
				});
			}

		});
}

/**
 * 
 *
 * @param callback 		 	= {Function} 	to be called when mysql database query is complete.
**/
function importDataTablesFromMysql(callback) {

}

/**
 * Checks that EXCEL_OUTPUT_FILE file exists and reads all fields from it.
 * When file is parsed, it populates the 'database' object with data from its rows.
 *
 * @param callback 		 	= {Function} 	to be called when mysql database query is complete.
 * @callback_param mysql 	= {JSONObject} 	providing 'this' context for callback function
 * @callback_param err		= {String}		explaining error for unsuccessful connection to mysql server
**/
function populateDatabaseFromMysql(callback) {
	// issue query to get all fields from `students` in ascending order by last name
	mysql.connect().query('SELECT * FROM students ORDER BY last ASC', function(err, rows, fields) {
		// check for errors
		if(err) {
			// log error if database query fails. 
			console.log('There was an error parsing database fetch request. -> ' + err);
			
			// call callback function with context of mysql object, and pass err string as parameter
			return callback.call(mysql, err);
		}

		// iterate through rows array and add each row object to the database
		rows.forEach(function(row, index) {
			database.add(row);
		});

		// tell program local database has data
		database.populated = true;

		// emit event to fire when database has been populated
		scanner.emit('databasepopulated');

		//call passed callback function
		callback.call(mysql);
	});
}

/**
 * Checks that EXCEL_OUTPUT_FILE file exists and reads all fields from it.
 * When file is parsed, it populates the 'database' object with data from its rows.
 *
 * @param callback = {Function} to be called when excel sheet is done being read.
**/
function populateDatabaseFromSpreadsheet(callback) {
	// checks if file exists
	if(!fs.existsSync(EXCEL_OUTPUT_FILE)) {
		// define error message for no spreadsheet document found and exit
		var err = 'There is no database document present. Unable to proceed.';

		// call callback function and pass error message
		return callback.call(this, err);
	}
	
	// use excel package to read spreadsheet file
	excel(EXCEL_OUTPUT_FILE, function(err, data) {
		if(err) {
			// exit function and log error message to database.
			return console.log('Error reading spreadsheet file. -> '+err);
		}

		// loop through and add all rows (as arrays) from file to database
		for(var i = 1; i < data.length; i++) {
			database.add(data[i]);
		}

		// tell program local database has data
		database.populated = true;

		// emit event to fire when database has been populated
		scanner.emit('databasepopulated');

		// if callback function, call it with general context
		if(typeof callback == 'function') {
			callback.call(this);
		}

		// tell application, database has been populated
		// from the spreadsheet file.
		ready = true;

		// add plain array from file as backup data to database.
		database.setRawData(data);

		// Log to database that database has been populated and app is ready.
		console.log('local database has been populated from spreadsheet.');
	});
};

function exportDatabase(type, fname, callback) {
	if(typeof fname == 'function' && !callback) {
		callback = fname;
		fname = null;
	}

	if(!fname) {
		// define output file from global setting if none is given
		fname = EXCEL_OUTPUT_FILE;
	}

	if(type == 'excel' || !type) {
		if(fs.existsSync(fname)) {
			fs.unlink(fname,function(err) {
				if(err) {
					return console.log(err);
				}

				console.log('Preparing file...');
			});
		}

		var data = [];											// array of 'entry' objects containing student information
																// to be used with xlsx function to output data to spreadsheet

		database.forEach(function(entry, index) {
			// only add entry to data array if it hasn't been 'removed'
			if(!entry.deleted) {

				data.push({
					'ID'			: 	entry.id,				// contains student id as a string
					'LAST'			: 	entry.lname,			// contains student's last name
					'FIRST'			: 	entry.fname,			// contains student's first name
					'STUCLASS_DESC' : 	entry.year,				// contains student's class (freshman .. senior)
					'MAJR1'			: 	entry.major,			// contains student's area of study
					'EMAIL'			: 	entry.email,			// contains student's school email
					'VISITS'		: 	(''+entry.visits+''),	// add quotes to make sure value is treated as String, not Integer
					'EVENTS'		: 	entry.events 			// string containing event name (followed by current date and a comma)
				});

			}
		});

		// write all objects in data array to created spreadsheet
		return xlsx.write(fname, data, function(err) {
			if(err) {
				// log error
				console.log(err);

				// call callback function with error
				return callback.call(this, err);
			}

			console.log('The excel document has been updated!');

			if(callback && typeof callback == 'function') {
				callback.call(this);
			}
		});

	} else if(type == 'csv') {
		if(fs.existsSync('data.csv')) {
			fs.unlink('data.csv',function(err) {
				if(err) {
					return console.log(err);
				}

				console.log('Preparing CSV file...');
			});
		}

		var stream = csv.createWriteStream({headers:true});
		var writeStream = fs.createWriteStream('data.csv');
		var data = [];

		writeStream.on('finish',function() {
			console.log('The CSV document has been updated!');
			callback.call(this);
		});

		// 
		stream.pipe(writeStream);

		for(var i=0;i<database.size();i++) {
			stream.write({first_name:database.get(i).fname,last_name:database.get(i).lname,email:database.get(i).email});
		}

		// release file resources and safely close stream
		stream.end();

	} else if(type == 'mysql') {
		// check to see if server is still parsing request
		if(mysql.isBusy) {
			// if process is happening, advertise to console
			return callback.call(this, 'unable to export database using mysql method. mysql server is still exporting last query request.');
		}

		// once a table has been created, determine whether main mysql server database table 'students' contains any data
		if(!mysql.hasData) {
			// tell app mysql process is busy
			mysql.isBusy = true;

			// define index to tell how many entries have been added to mysql database
			var entryInsertCount = 0;

			// iterate through database entries and exit
			return database.forEach(function(entry) {
				// if mysql database table 'students' is empty, populate it
				mysql.insertInto(

					'students', 
					['student_id', 'last', 'first', 'year', 'major', 'email', 'date_added'],
					[entry.id, entry.lname, entry.fname, entry.year, entry.major, entry.email, '9_1_14'],

					function(err) {
						// check for errors
						if(err) {
							// advertise any insertion erros
							return console.log('error exporting database to empty mysql database table (students) -> ' + err);
						}

						// if no errors happen during query,
						entryInsertCount++;

						// tell our program entry now exists in mysql database
						entry.existsInMysqlDatabase = true;

						// if number of entries parsed is equal to total number of entries,
						// database has finished populating entries into mysql server database
						if(entryInsertCount == database.size()) {
							// tell program mysql process is no longer busy
							mysql.isBusy = false;

							// if there are no errors populating empty mysql database, tell program mysql database now has data
							mysql.hasData = true;

							// advertise that database has now been populated
							console.log('all local entries have been exported to mysql server database.');

							// call callback function
							callback.call(this);
						}
					}
				);
			});
		}
		
		// if new entries have been added to the local database object, add them to our mysql database as well
		database.forEach(function(entry, index) {
			// check to see if entry in list of new entries for this event has already been added as new value to mysql
			// table 'students'
			if(!entry.existsInMysqlDatabase) {
				// log that we are adding a newly registered person to the 'students' table in mysql database
				console.log('adding new entry with id ' + entry.id + ' to the student mysql table.');

				// insert new entry into database
				mysql.insertInto(

					'students', 
					['student_id', 'last', 'first', 'year', 'major', 'email', 'date_added'],
					[entry.id, entry.lname, entry.fname, entry.year, entry.major, entry.email, global_date],

					function(err) {
						if(err) {
							// log error and exit
							return console.log('[Fatal]: an error inserting new students into mysql table \'students\' -> ' + err);
						}

						// if no error, tell program new entry has been added
						entry.existsInMysqlDatabase = true;
					}
				);
			}

			// if entry has been registered in to the current event and it hasn't yet added to table containing list
			// of students who showed up to event, insert it
			if(entry.registered && !entry.addedToCurrentMysqlEventTable) {
				// log that we are adding registered student to the mysql database
				console.log('adding registered entry with id ' + entry.id + ' to the current event table in mysql server.');

				// insert entry if registered and not previously added to the table of registered students for this event
				mysql.insertInto(

					global_date, 
					['student_id', 'is_new'],
					[entry.id, (entry.isNew ? '1' : '')],

					function(err) {
						// check for errors
						if(err) {
							// log error and exit
							return console.log('[Fatal]: an error inserting new students into mysql table \'students\' -> ' + err);
						}

						// if no error, tell program new entry has been added
						entry.addedToCurrentMysqlEventTable = true;
					}
				);
			}
		});

		// call our calback function. Notice we are taking a risk to simplify things and ignoring any potential mysql errors from
		// two processes above, and continuing program as usual anyway. This may be addressed later as it is not urgent.
		return callback.call(this);

	} else {
		// if type is undefined, or invalid, output error
		var err = 'exportDatabase error: Invalid type.';

		// exit and call callback function and pass err variable as first @param
		return callback.call(this, err);
	}
};

/**
 * genereates an output table in mysql database containing final student data
 * for the current event
**/
function generateOutputMysqlTable() {
	// store name of our output table for ease of access to it
	var outputTableName = global_date + '_output';
	
	// create mysql table for current event if it doesn't exist
	mysql.connect()
		// since we have 'students' table containing rest of student data, we simply store student_id so we only have one
		// place to update data in the future. when we want student information, we fetch it from 'students' using student_id
		.query('CREATE TABLE IF NOT EXISTS ' + outputTableName + ' (' +
		
			'`id` int(11) unsigned NOT NULL AUTO_INCREMENT,'	+
			'`student_id` varchar(25) DEFAULT NULL,'			+
			'`first` varchar(25) DEFAULT NULL,'					+
			'`last` varchar(25) DEFAULT NULL,'					+
			'`email` varchar(50) DEFAULT NULL,'					+
			'`year` varchar(20) DEFAULT NULL,'					+
			'`major` varchar(30) DEFAULT NULL,'					+
			'`date_added` varchar(25) DEFAULT NULL,'			+
			'`at_event` varchar(2) DEFAULT NULL,'				+
			'`is_new` varchar(2) DEFAULT NULL,'					+
			'PRIMARY KEY (`id`)'								+

		') ENGINE=InnoDB DEFAULT CHARSET=utf8', function(err) {
			// check for errors
			if(err) {
				// if an error occurrs creating table for current event, 
				return console.log('[Fatal]: An error occurred creating a mysql table for the current event -> ' + err);
			}

			// if no errors occur, truncate the table to resave all updated data to it
			mysql.connect()
				.query('TRUNCATE TABLE ' + outputTableName, function(err) {
					if(err) {
						// log error and exit
						return console.log('[Fatal]: An error occurred truncating mysql output table for current event -> ' + err);
					}

					// if no errors, iterate through local database object entries
					database.forEach(function(entry, index) {
						// insert entry into output database
						mysql.insertInto(

							outputTableName, 
							['student_id', 'first', 'last', 'email', 'year', 'major', 'date_added', 'at_event', 'is_new'],
							[entry.id, entry.fname, entry.lname, entry.email, entry.year, entry.major, global_date, (entry.registered ? '1' : ''), (entry.isNew ? '1' : '')],

							function(err) {
								// check for errors
								if(err) {
									// log error and exit
									return console.log('[Fatal]: an error inserting new students into mysql table \'' + outputTableName + '\' -> ' + err);
								}

								// check to see if index of current entry is last one
								if(index + 1 == database.size()) {
									// log that we are done creating output table in database
									console.log('successfully created output table in mysql database!');
								}
							}
						);
					});

				})

		});
}

/**
 * Main function. Initializes program by fetching data from mysql
 * database, in order, by last_name ascending and populating database
 * object with it. Autoruns on program start.
**/
(function main() {
	// create new instance of a date object
	var date = new Date();

	// assign the current date to the database (increase .getMonth() by one since months start at 0)
	mysql.eventTableName = global_date = (date.getMonth() + 1) + '_' + date.getDate() + '_' + date.getFullYear();

	// before we try to populate internal database object, check to see if mysql server has any data in it
	mysql.connect().query('SELECT id FROM students', function(err, rows, fields) {
		// check for mysql query errors
		if(err) {
			// if error, assume mysql server is not available, don't use mysql server at all. Fall back to spreadsheet implementation and advertise this to console
			console.log('Using spreadsheet file to populate database instead.');

			// populate database from spreadsheet and exit
			return populateDatabaseFromSpreadsheet(function(err) {
				if(err) {
					// if fallback spreadsheet implementation errors, advertise error message and exit.
					return console.log(	'[Fatal]: There was an error populating the database using spreadsheet' +
										'file as backup, and the mysql database as a primary means -> ' + err);
				}

				// init autosave function using 'excel' method
				autosave('excel');
			});
		}

		// if no err, we know mysql server exists, check for event table
		// check to see whether current event's table has been created.
		// Warning: this module may execute while database is populated from 'if' statement below
		if(!mysql.eventTableCreated) {
			// tell program mysql process is busy
			mysql.isBusy = true;

			// tell console we're creating a table for our event instead of updating the mysql database. hopefully just this once.
			console.log('creating table in mysql database for the current event');

			// create mysql table for current event if it doesn't exist
			mysql.connect()
				// since we have 'students' table containing rest of student data, we simply store student_id so we only have one
				// place to update data in the future. when we want student information, we fetch it from 'students' using student_id
				.query('CREATE TABLE IF NOT EXISTS ' + mysql.eventTableName + ' (' +
				
					'`id` int(11) unsigned NOT NULL AUTO_INCREMENT,'	+
					'`student_id` varchar(25) DEFAULT NULL,'			+
					'`is_new` varchar(2) DEFAULT NULL,'					+
					'PRIMARY KEY (`id`)'								+

				') ENGINE=InnoDB DEFAULT CHARSET=utf8', function(err) {
					// tell program request has been parsed
					mysql.isBusy = false;

					// check for error
					if(err) {
						// if an error occurrs creating table for current event, 
						return console.log('[Fatal]: An error occurred creating a mysql table for the current event -> ' + err);
					}

					// if table creation succeeds, tell console it has been created
					console.log('mysql table successfully created for this event.');

					// and also tell program table now exists
					mysql.eventTableCreated = true;

					// index event's table and see which entries from database exist on it (done in case application is restarted more than once in the same event)
					// update local database's entries with data from mysql table's entries
					mysql.connect()
						.query('SELECT * FROM ' + mysql.eventTableName, function(err, rows, fields) {
							// check for errors
							if(err) {
								return callback.call(this, '[Fatal]: An error occurred attempting to check previously stored data in mysql event table -> ' + err);
							}

							// check to see if there are values stored in table
							if(rows.length) {
								// iterate through table data
								rows.forEach(function(row) {
									// attempt to find current entry in local database object
									var entry = database.find({
										id : row.student_id
									});

									// if value is found in local database object by its id...
									if(entry.length) {
										// ...set its flag indicating that its added to current event table in mysql server to true
										entry[0].addedToCurrentMysqlEventTable = true;

										// populate entry caches to let program know entry is indeed newly registered
										if(row.is_new) {
											// register entry as new
											database.registerNew(entry[0]);
										} else {
											// register entry as existing
											database.register(entry[0]);
										}
									}									
								});
							}

							// calculate data averages and analysis

							// select all table entries from 'events' table to gather previous data
							mysql.selectFrom('events', ['*'], 'table_name != "' + global_date + '"', function(err, rows, fields) {
								if(err) {
									// log errors
									return console.log('An error occurred selecting events from mysql database -> ' + err);
								}

								// iterate through events adding its total amount of guests to local database's average (recording total)
								rows.forEach(function(row) {
									database.statistics.average += row.total;
									database.statistics.averageNew += row.total_new;
								});

								// calculate actual averages by dividing total result by amount of rows
								database.statistics.average 		/= rows.length;
								database.statistics.averageNew	/= rows.length;
							});

							// add table with default name (global_name) to events table in mysql server null
							// value makes it so that if table entry exists, existing name is used instead of default
							addToMysqlEventsTableUsingName(null);
						});
				});
	
		}

		// if no error fetching data, check to see if any data in database. don't take into account if table has been created or not
		if(rows.length) {
			// if mysql table contains data, tell program it does have data
			mysql.hasData = true;

			// then, begin adding such data to internal database object
			populateDatabaseFromMysql(function(err) {
				// if mysql server not available, or mysql query not successful
				if(err) {
					// if error, advertise fatal error and exit
					return console.log('[Fatal]: There was an error fetching data from the mysql server -> ' + err);
				}

				// if database successfully populated from mysql database, tell database all current entries exist in the mysql database
				database.forEach(function(entry) {
					// set flag for entry's existence in mysql server
					entry.existsInMysqlDatabase = true;
				});

				// if success, begin autosaving data in mysql mode (to mysql server)
				autosave('mysql');
			});

		} else {
			// mysql database is empty. advertise that we are loading data from spreadsheet to populate mysql table
			console.log('no data found on mysql server. using spreadsheet to populate internal database.');

			// if no data in database, use spreadsheet data to populate our local database object, and then
			// use the newly populated local 'database' object to populate mysql server database
			populateDatabaseFromSpreadsheet(function(err) {
				// check for errors
				if(err) {
					// advertise error and exit
					return console.log('[Fatal]: Error populating local database object from spreadsheet -> ' + err);
				}

				// once internal database object has data in it, export data to mysql server if empty
				exportDatabase('mysql', EXCEL_AUTOSAVE_FILE, function(err) {
					// detect if error copying data from database object to mysql server database
					if(err) {
						// if error filling empty mysql database, advertise such error
						console.log('An error occurred populating empty mysql database -> ' + err);

						// since we are using spreadsheet as main source of data, keep auto-saving that instead and exit
						return autosave('excel');
					}

					// begin auto-saving new data to mysql database
					autosave('mysql');
				});
			});

		}
	});

	// define autosave function, uses recursion to create a new 'backup' file every minute
	function autosave(method) {
		// export all data in database to excel file
		exportDatabase(method, EXCEL_AUTOSAVE_FILE, function(err) {
			// check for errors
			if(err) {
				return console.log('There was an error auto-saving to the database: ' + err);
			}

			// advertise that the database has been auto-saved
			console.log('The database has been auto-saved.');

			// set timeout of 60 seconds
			setTimeout(function() {
				// call method recursively to start auto-save process again
				autosave.call(this, method);
			}, (1000 * 60));
		});
			
	}
})();
