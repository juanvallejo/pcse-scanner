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
*
* BUG: two extra zeroes are omitted before every new student ID
*/

var DEBUG 				= true; 							// turns debug mode on or off for local development

if(DEBUG) {
	console.log('WARN', 'DEBUG', 'Client running in debug mode.');
}

// define server constants
var SERVER_PORT 		= 8000;								// port at which to have server listen for connections
var SERVER_HOST 		= '0.0.0.0'; 						// listening for connections in all layers of app stack

// define excel output and input filenames
var EXCEL_OUTPUT_FILE 	= 'Master.xlsx';					// define name of output spreadsheet file (will be replaced) if it exists
var EXCEL_AUTOSAVE_FILE	= 'db_autosave.xlsx';				// defines filename used to export autosaved backups of database entries

var EXCEL_RESULTS_DIR = '../results/';

// define default mysql constants
var MYSQL_DEFAULT_HOST 	= 'localhost';						// define address of mysql server
var MYSQL_DEFAULT_PASS	= '';								// define password for mysql server
var MYSQL_DEFAULT_DB 	= 'pizza_my_mind';					// define default mysql database name
var MYSQL_DEFAULT_USER	= 'root';							// define username for mysql server

var API_SERVER_URL 		= (DEBUG ? 'http://localhost:7777' : 
			'https://pmm-rubyserverapps.rhcloud.com:8443'); // used to host remote data for access with API
var API_SERVER_TIMEOUT 	= 3; 								// if unable to connect to the remote API server,
															// client will attempt to reconnect n more times before giving up
var API_SERVER_R_FREQ 	= 5000; 							// time in milliseconds for reconnections to happen

// define constants
var ENTRY_EXISTS_IN_MYSQL_DB = true;

/**
 * define node.js libraries and dependencies
**/
var fs 		= require('fs');
var http 	= require('http');
var excel 	= require('excel');
var xlsx 	= require('xlsx-writer');
var csv 	= require('fast-csv');
var io 		= require('socket.io-client');

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
					// exportDatabase();
					console.log('Please use the graphical interface to interact with this command.');
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
		console.log('Welcome back, ' + search[0].fname + ' '+search[0].lname+'!');
	} else {
		console.log('You must be new here... ('+ code +')');
	}
};

/**
 * define api server connection
 */
var api = {
	
	// define internal state variables
	// _ denotes a private field / method

	// amount of tries left to try to reestablish
	// remote connection
	_reconnect_attempts_left: 0,
	_connection_successful: false,
	_connection_timeout: null,

	_connection_attempt_happened: false,

	// holds our api event configuration
	_on: {},

	// connection state with remote server
	// only true once the server
	// sends back a 'register' event
	_isConnected: false,

	// holds reference to 
	// socket.io-client object
	connection: null,

	/**
	 * Attempts to establish a connection with the
	 * remote API server. If a connection cannot be
	 * established, the client will attempt
	 * reconnecting API_SERVER_TIMEOUT amount of times
	 */
	connect: function() {

		if(api.connection) {
			return;
		}

		// tell api object we have at least tried
		// to connect to server
		api._connection_attempt_happened = true;
		api._reconnect_attempts_left = API_SERVER_TIMEOUT;

		try {
			api.connection = io.connect(API_SERVER_URL);
			api._connection_successful = true;
			api._handleSocketEvents();
		} catch(e) {
			console.log('API', 'Connection to API server unavailable, re-establishing...');
			api.reconnect();
		}

	},

	/**
	 * Checks to see if api.connect has been called
	 * as it is needed to initialize some flags.
	 * Attempts to reconnect n number of times to the
	 * remote API server
	 */
	reconnect: function() {

		// if flag is false, that means
		// api.connect has not yet been called.
		// attempt to connect as usual first
		if(!api._connection_attempt_happened) {
			return api.connect();
		}

		api._reconnect_attempts_left--;
			
		if(api._reconnect_attempts_left < 0 || api._connection_successful) {
			return console.log('API', 'Reconnection attepts to API server exceeded. Data for this event will NOT be synced.');
		}

		clearTimeout(api._connection_timeout);

		try {
			api.connection = io.connect(API_SERVER_URL);
			api._connection_successful = true;
			api._handleSocketEvents();
		} catch(e) {
			api._connection_timeout = setTimeout(api.reconnect, API_SERVER_R_FREQ);
		}

	},

	/**
	 * Calls all callback functions for a specific event manually
	 * Assumes all objects stored in event arrays are functions
	 * 
	 * @param eventName String identifier for event
	 * @param params 	Array args to be passed to callbacks for eventName
	 */
	emit: function(eventName, params) {

		if(!(params instanceof Array)) {
			params = [params];
		}

		if(api._on[eventName] && api._on[eventName].length) {
			for(var i = 0; i < api._on[eventName].length; i++) {
				api._on[eventName][i].apply(this, params);
			}
		}

	},

	/**
	 * Sends an event with data to the API server.
	 * Data must be a JSON object. If the API server is unavailable,
	 * the event is queued and sent once a 'connection' event is sent
	 * back from the API server
	 *
	 * @param eventName 	String identifier for payload being sent
	 * @param data 			Object containing payload to send
	 * @callback callback 	Function called once payload is sent or queued
	 */
	send: function(eventName, data, callback) {

		// ensure callback is of type Function
		callback = callback && typeof callback == 'function' ? callback : function() {};

		if(!api.isConnected()) {
			return api.on('connected', function() {
				api.connection.emit(eventName, data);
				callback.call();
			});
		}

		api.connection.emit(eventName, data);
		callback.call();
	},

	/**
	 * Assigns passed callback function to a specific event
	 *
	 * @param eventName String event identifier to listen for
	 * @param callback 	Function callback to call when event occurs
	 */
	on: function(eventName, callback) {

		if(!api._on[eventName]) {
			api._on[eventName] = [];
		}

		api._on[eventName].push(callback);

	},

	/**
	 * object state - checks to see if a connection
	 * has been successfully established with the remote
	 * API server and that the server has returned a valid
	 * registration event and client id
	 */
	isConnected: function() {
		return api._isConnected;
	},

	/**
	 * Internal method, listens for socket.io events emitted
	 * from the server and calls any callback functions 
	 * currently assigned to that specific event.
	 * Assumes a connection has already been attempted.
	 */
	_handleSocketEvents: function() {

		api.connection.on('connected', function(data) {

			api._isConnected = true;
			api.emit('connected', data.id);

			console.log('API', 'Connection established. Syncing enabled.');

		});

		api.connection.on('disconnect', function() {
			api._isConnected = false;
			api.emit('disconnected');
			console.log('API', 'Connection to server lost. Attempting to reconnect...');
		});

	}
}

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
	eventEntryCreated	: 	false,				// flag indicating whether a mysql entry has been added (`events`) for current event
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
					console.log('MYSQL', 'Error establishing a connection to the mysql server -> '+err);

					return;
				}

				console.log('MYSQL', 'Successfully connected to mysql server');
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
	 * deletes entries from table where whereLogic applies
	 *
	 * @param mysqlTableName  	= {Object}		entry object from local 'database' object
	 * @param whereLogic 		= {String} 		containing equality to use to target the selection of a specific row
	 * @param callback 			= {Function} 	to call after operation has completed successfully
	 *
	 * for data protection, if @param whereLogic is 'null', nothing is deleted / returned
	**/
	deleteFrom : function(mysqlTableName, whereLogic, callback) {
		if(whereLogic) {
			// perform query only if whereLogic has been passed
			mysql.connect()
				.query('DELETE FROM ' + mysqlTableName + ' WHERE ' + (whereLogic || '1 = 1'), callback);
		} else {
			// fail and exit function with error
			callback.call(this, 'ERR: (mysqldatabasedeletionerror): no \'WHERE\' condition applies for selected logic.');
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
	attendance 		: [],
	raw_data 		: [],
	last_reg 		: [],
	last_new_reg 	: [],
	global_values 	: [], 													// global_values[0] holds company name data

	// define statistics object, holds data analysis information
	statistics				: {
		average 			: 0, 											// holds value for average amount of visitors per event
		averageNew 			: 0, 											// holds value for average amount of new visitors per event
		deletedCount 		: 0, 											// holds value for amount of visitors deleted
		registeredCount 	: 0, 											// holds count for amount of visitors registered
		registeredNewCount 	: 0 											// holds count for amount of new visitors registered
	},

	add: function(entry) {
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
				registered:((!entry[6] || entry[6] == undefined || entry[6] == ' ') ? 0 : parseInt(entry[6])),
				events:(!entry[7]) ? '' : entry[7],
				deleted:false,
				visits: 0
			});

			// increment stats
			if(entry[6] && parseInt(entry[6]) == 1) {
				database.statistics.registeredCount++;
			}

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

	// callback returns pointer to recently registered entry
	register:function(entry, callback) {

		var existsInMysql = (callback && typeof callback == 'boolean' ? callback : false);

		if(existsInMysql) {
			console.log('REGISTER', 'DUPLICATE', 'The entry with id', entry.id, 'already exists in the MySQL database.');
		}

		if(typeof entry == 'object') {
			// tell program entry is now registered
			entry.registered = true;
			entry.addedToCurrentMysqlEventTable = existsInMysql;

			// push entry to last_reg array of recently registered entries
			database.last_reg.push(entry);

		} else {

			// if entry is a string, we assume we are given its id. Find object from id and store it
			database.last_reg.push(database.find({
				id: entry
			})[0]);

			//tell program entry is now	registered
			var foundEntry = database.find({
				id:entry
			})[0];

			foundEntry.registered = true;
			foundEntry.addedToCurrentMysqlEventTable = true;
		}

		// update statistical counter
		database.statistics.registeredCount++;

		// make sure callback is of type function
		callback = (typeof callback == 'function' && callback) || function() {};

		// call callback function to continue
		callback.call(this, entry); 
	},

	/**
	 * Registers an entry that did not previously exist in the mysql database
	 */
	registerNew:function(entry) {
		// register the entry normally
		database.register(entry, function(registeredEntry) {

			// once it's registered, increase new count and add entry to new array

			// tell program whether entry is new
			entry.isNew = true;

			// add entry to the main database
			database.add(entry);
			// store entry in the last_new_reg array of recently stored 'new' entries as well as normal last_reg list
			database.last_new_reg.push(entry);

			// update statistical counter
			database.statistics.registeredNewCount++;
		});
	},
	
	/**
	 * Registers an entry that is new to the current event, but has already been added to the database previously.
	 * Differs from registerNew method in that it doesn't 're-add' entry back into the local database object
	 */
	registerNewFromMysql:function(entry) {

		// register the entry normally
		database.register(entry, function(registeredEntry) {
			// once it's registered, increase new count and add entry to new array

			var foundEntry = database.find({
				id: registeredEntry.id
			});

			foundEntry[0].addedToCurrentMysqlEventTable = true;

			// tell program whether entry is new
			registeredEntry.isNew = true;

			// store entry in the last_new_reg array of recently stored 'new' entries as well as normal last_reg list
			database.last_new_reg.push(registeredEntry);

			// update statistical counter
			database.statistics.registeredNewCount++;
		});
	},
	remove:function(entry, callback) {
		// ensure we have a callback function to call
		callback = callback || function() {};

		// if entry param exists
		if(entry) {
			// if the entry exists in the database server, remove it from there
			if(entry.registered && entry.addedToCurrentMysqlEventTable && !entry.deleted) {
				// delete row from mysql table for current event
				mysql.deleteFrom(global_date, 'student_id = ' + entry.id, function(err) {
					if(err) {
						// fail and exit function with error message
						return callback.call(this, err);
					}

					// tell database entry no longer exists in the mysql table
					entry.addedToCurrentMysqlEventTable = false;

					// tell database entry has been deleted
					entry.deleted = true;

					// remove from registered counter
					database.statistics.registeredCount--;

					// increase statistical deletion counter
					database.statistics.deletedCount++;

					// exit function successfully
					callback.call(this);
				});
			} else {
				// if entry was already deleted
				if(entry.deleted) {
					// fail and exit function with error message
					return callback.call(this, 'The entry with id ' + entry.id + ' has already been deleted');
				}
			}
		} else {
			// fail and exit function with error message
			return callback.call(this, 'No entry was passed for deletion');
		}
	},
	setRawData:function(data) {
		raw_data = data;
	},
	size:function(a) {
		return a == 'registered' ? database.statistics.registeredCount : database.entries.length;
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
		
		// check the type of request being made is a post
		if(req.method != 'POST') {
			return console.log('ERR: Invalid request.');
		}

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

				// activate spreadsheet export
				if(command[2] && command[2] == 'excel') {

					exportDatabase('excel', function(err) {
						// check for errors
						if(err) {
							// send error message back to client and exit
							return res.end('ERR: There was an error exporting the data: '+err);
						}

						// advertise method of database export
						console.log('EXPORT', 'EXCEL', 'Database exported through excel command');

						// send success message back to client
						res.end('success');
					});


				} else {

					// override second command if mysql server is currently being used for data
					// by exporting database we are simply updating new entries and registered students
					exportDatabase((mysql.isConnected ? 'mysql' : command[2]), function(err) {

						if(err) {
							// send error message back to client and exit
							return res.end('ERR: There was an error exporting the data: '+err);
						}

						// advertise method of database export
						console.log('EXPORT', 'MYSQL', 'database exported through mysql command');

						// send success message back to client
						res.end('success');
					});

					// generate a mysql table with all student information to easily add to spreadsheet
					generateOutputData();

					// update mysql 'events' table with current entry counts
					updateMysqlEventsTableUsingName(mysql.eventTableName);
				}

			} else if(command[1] == 'query') {

				// database.query();

				// send error back to client
				res.end('I am not allowed to index the database yet.');
				
			} else if(command[1] == 'create') {
				res.end('ERR: Unimplemented command.');
			} else if(command[1] == 'event') {

				if(command[2] == 'name') {
					// set global event name,
					// add event with its new name to the 'events' table in the mysql database
					database.global_values[0] = decodeURIComponent(command[3] + ' (' + global_date + ')');
					updateMysqlEventsTableUsingName(decodeURIComponent(command[3]));

					// send success message back to client
					res.end('success');

				} else if(command[2] == 'delete') {
					// handles deletion of records				
					if(command[3] == 'top') {

						database.remove(database.getRegistered()[0]);
						res.end('success');

					} else if(command[3] == 'bottom') {
						// advertise command is not yet fully implemented
						console.log('Unimplemented command called.');
						return res.end('This command has not been implemented yet.');

						// initialize record to delete with last item on database
						var recordToDelete 			= database.getRegistered()[database.getRegistered().length - 1];
						var numberOfDeletedRecords 	= 0;

						// iterate through records from the bottom of the list until we find next one that hasn't been deleted
						while(!recordToDelete.deleted) {
							// increment tally of already deleted records
							numberOfDeletedRecords++;

							// assign next record from bottom as record to delete
							recordToDelete = database.getRegistered()[database.getRegistered().length - 1 - numberOfDeletedRecords];
						}

						// tell database to remove the last record on the list
						database.remove(database.getRegistered()[database.getRegistered().length - 1 - numberOfDeletedRecords], function(err) {
							if(err) {
								// advertise error
								console.log('An error occurred deleting a database record -> ' + err);

								// send back error response as JSON object to client and exit
								return res.end(JSON.stringify({
									error : err
								}));
							}

							console.log(database.getRegistered()[database.getRegistered().length-1].deleted);

							// if success, advertise
							console.log('successfully deleted entry with id ' + database.getRegistered()[database.getRegistered().length-1].id);

							// send back successful response as JSON object to client
							return res.end(JSON.stringify({
								data : {
									error : false,
									length : database.statistics.registeredCount,
									stats : database.statistics
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
				// data for statistics is being requested
				if(command[2] == 'stats') {
					// call method pertaining to database
					res.writeHead(200, {'Content-type':'application/json'});
					res.end(JSON.stringify({
						data : {
							stats : database.statistics,
							length : database.size('registered')
						}
					}));
				}
			} else {
				res.end('ERR: Invalid command [' + command[1] + ']');
			}
		});

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

}).listen(SERVER_PORT, SERVER_HOST);

/**
 * Takes the event's official name assigned by the user through the client, and 
 * adds it to the mysql 'events' table, pairing it with the table's name (created using the global_date
 * for such event.
 *
 * @param eventName	= {String} containing current event's name assigned through the client by user
**/
function updateMysqlEventsTableUsingName(eventName) {

	// now that a name for this event has been passed, assign in to our mysql object, if eventName is null or
	// undefined, use default name of global_date.
	mysql.eventTableName = eventName || global_date;

	mysql.update(

		'events', 
		['event_name', 'total', 'total_new'], 
		[mysql.eventTableName, (database.getRegistered().length + database.getRegisteredNew().length), database.getRegisteredNew().length], 

		// add 'where' conditional logic
		'table_name = "' + global_date + '"', 

		function(err) {
		// check for errors
		if(err) {
			// log error and exit
			return console.log('An error occurred updating table name information in mysql server -> ' + err);
		}

		// log success
		if(mysql.eventTableName == global_date) {
			console.log('MYSQL', 'UPDATE', 'Successfully updated event entry ' + global_date + ' with statistical information.');
		} else {
			console.log('MYSQL', 'UPDATE', 'Successfully renamed event entry ' + global_date + ' to ' + mysql.eventTableName + ' in mysql events table.');
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
function populateDatabaseFromMysql(rows, callback) {

		// iterate through rows array and add each row object to the database
		rows.forEach(function(row, index) {
			database.add(row);
		});

		// tell program local database has data
		database.populated = true;

		// emit event to fire when database has been populated
		scanner.emit('databasepopulated');

		// call passed callback function
		callback.call(mysql);

}

/**
 * Checks that EXCEL_OUTPUT_FILE file exists and reads all fields from it.
 * When file is parsed, it populates the 'database' object with data from its rows.
 *
 * @param callback = {Function} to be called when excel sheet is done being read.
**/
function populateDatabaseFromSpreadsheet(callback) {

	// check for individual event data
	var local_outputfile_exists = false;
	if(fs.existsSync(EXCEL_RESULTS_DIR + global_date + '_' + EXCEL_OUTPUT_FILE)) {
		local_outputfile_exists = true;
	}

	// checks if file exists
	if(!fs.existsSync(EXCEL_RESULTS_DIR + EXCEL_OUTPUT_FILE) && !local_outputfile_exists) {
		// define error message for no spreadsheet document found and exit
		var err = 'There is no database document present. Unable to proceed.';

		// call callback function and pass error message
		return callback.call(this, err);
	}

	// use excel package to read spreadsheet file
	excel((local_outputfile_exists ? EXCEL_RESULTS_DIR + global_date + '_' + EXCEL_OUTPUT_FILE : (EXCEL_RESULTS_DIR + EXCEL_OUTPUT_FILE)), function(err, data) {
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
		if(local_outputfile_exists) {
			console.log('The local database has been populated from an existing spreadsheet (' + (global_date + '_' + EXCEL_OUTPUT_FILE) + ').');
		} else {
			console.log('The local database has been populated from spreadsheet.');
		}
	});
};

function exportDatabase(type, fname, callback) {

	// sync with api server, prevent queuing if server
	// is offline, this is so that if the server comes
	// back online, it is not spammed with 'export' requests
	if(api.isConnected()) {
		api.send('eventdata', {
			students: database.entries,
			attendance: database.attendance
		}, function() {
			console.log('API', 'Syncing database (student, attendance) entries with API server');
		});
	}


	if(typeof fname == 'function' && !callback) {
		callback = fname;
		fname = null;
	}

	if(!fname) {
		// define output file from global setting if none is given
		fname = EXCEL_OUTPUT_FILE;
	}

	// save to individual file for current day - prevents destructive output
	fname = EXCEL_RESULTS_DIR + global_date + '_' + EXCEL_OUTPUT_FILE;

	if(type == 'excel' || !type) {
		return generateSpreadheetFromdata(database.entries, callback);
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

		// check to see if server is still parsing a previous request
		if(mysql.isBusy) {
			return callback.call(this, 'unable to export database using mysql method. mysql server is still exporting last query request.');
		}

		// once a table has been created, determine whether main mysql server database table 'students' contains any data
		if(!mysql.hasData) {

			mysql.isBusy = true;

			// define index to tell how many entries have been added to mysql database
			var entryInsertCount = 0;

			// iterate through database entries and exit
			return database.forEach(function(entry) {
				// if mysql database table 'students' is empty, populate it
				mysql.insertInto(

					'students', 
					['student_id', 'last', 'first', 'year', 'major', 'email', 'date_added'],
					[entry.id, entry.lname, entry.fname, entry.year, entry.major, entry.email, global_date],

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
							console.log('MYSQL', 'INFO', 'NEW', 'All local entries have been exported to mysql server database.');

							// call callback function
							callback.call(this);
						}
					}
				);
			});
		}
		
		// assume database had previous entries, add new ones
		// register the rest for the current event
		database.forEach(function(entry, index) {

			// check to see if entry in list of new entries for this event has already been added as new value to mysql
			// table 'students'
			if(!entry.existsInMysqlDatabase) {
				// log that we are adding a newly registered person to the 'students' table in mysql database
				console.log('MYSQL', 'INSERT', 'INFO', 'adding new entry with id ' + entry.id + ' to the student mysql table.');

				// insert new entry into database
				mysql.insertInto(

					'students', 
					['student_id', 'last', 'first', 'year', 'major', 'email', 'date_added'],
					[entry.id, entry.lname, entry.fname, entry.year, entry.major, entry.email, global_date],

					function(err) {
						if(err) {
							return console.log('FATAL', 'MYSQL', 'INSERT{NewStudent->students}', err);
						}

						// if no error, tell program new entry has been added
						entry.existsInMysqlDatabase = true;
					}
				);

				// insert into master database
				mysql.insertInto(

					'students_master', 
					['student_id', 'last', 'first', 'year', 'major', 'email', 'date_added'],
					[entry.id, entry.lname, entry.fname, entry.year, entry.major, entry.email, global_date],

					function(err) {
						if(err) {
							return console.log('FATAL', 'MYSQL', 'INSERT{NewStudent->students_master}', err);
						}
					}
				);

				// sync with local attendance table
				var existsInAttendanceArray = false;
				for(var i = 0; i < database.attendance.length && !existsInAttendanceArray; i++) {
					if(entry.id == database.attendance[i].student_id) {
						existsInAttendanceArray = true;
					}
				}

				// add entry fields to attendance only if it has not been
				// added before. Only for use with remote API syncing
				if(!existsInAttendanceArray) {
					database.attendance.push({
						student_id: entry.id,
						event_id: global_date,
						is_new: 1
					});

					console.log('LOCAL', 'SYNC', 'Added new entry', entry.fname, entry.lname, '(', entry.id, ') to local database attendance.');
				}

				// add to `attendance` table
				mysql.connect().query(

					"INSERT INTO `attendance` (`student_id`, `event_id`, `is_new`)" +
					"VALUES" +
					"	('" + entry.id + "', '" + global_date + "', 1);",

				function(err) {
					
					if(err) {
						return console.log('FATAL', 'MYSQL', 'INSERT{NewStudent->attendance}', err);
					}

					entry.addedToCurrentMysqlEventTable = true;
				});

			}
				
			// if entry has not been 'deleted' and it has been registered in to the current event
			// and it hasn't yet added to table containing list of students who showed up to event, insert it
			else if(entry.registered && !entry.addedToCurrentMysqlEventTable && !entry.deleted) {

				// log that we are adding registered student to the mysql database
				console.log('MYSQL', 'INFO', 'Adding registered entry with id ' + entry.id + ' to the current event table in mysql server.');

				// sync with local attendance table
				var existsInAttendanceArray = false;
				for(var i = 0; i < database.attendance.length && !existsInAttendanceArray; i++) {
					if(entry.id == database.attendance[i].student_id) {
						existsInAttendanceArray = true;
					}
				}

				// add entry fields to attendance only if it has not been
				// added before. Only for use with remote API syncing
				if(!existsInAttendanceArray) {
					database.attendance.push({
						student_id: entry.id,
						event_id: global_date,
						is_new: entry.isNew
					});

					console.log('LOCAL', 'SYNC', 'Added entry', entry.fname, entry.lname, '(', entry.id, ') to local database attendance.');
				}

				entry.addedToCurrentMysqlEventTable = true;

				// add to `attendance` table
				mysql.connect().query(

					"INSERT INTO `attendance` (`student_id`, `event_id`, `is_new`)" +
					"VALUES" +
					"	('" + entry.id + "', '" + global_date + "', 0);",

				function(err) {
					if(err) {
						return console.log('FATAL', 'MYSQL', 'INSERT{RegStudent->attendance}', err);
					}
				});
				
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
 * Stores an array of objects into a spreadsheet
 */
function generateSpreadheetFromdata(entries, callback) {

	var fname = EXCEL_RESULTS_DIR + global_date + '_' + EXCEL_OUTPUT_FILE;

	// delete previosuly saved file with same name
	if(fs.existsSync(fname)) {
		fs.unlink(fname,function(err) {
			if(err) {
				return console.log(err);
			}

			console.log('EXPORT', 'EXCEL', 'Preparing file', fname,'...');
		});
	}

		var data = [];											// array of 'entry' objects containing student information
																// to be used with xlsx function to output data to spreadsheet

		for(var i = 0; i < entries.length; i++) {

			if(!entries[i].deleted) {

				data.push({
					'ID'			: 	entries[i].id || entries[i].student_id,									// contains student id as a string
					'LAST'			: 	entries[i].lname || entries[i].last,									// contains student's last name
					'FIRST'			: 	entries[i].fname || entries[i].first,									// contains student's first name
					'YEAR' 			: 	entries[i].year,														// contains student's class (freshman .. senior)
					'MAJOR'			: 	entries[i].major,														// contains student's area of study
					'EMAIL'			: 	entries[i].email,														// contains student's school email
					'AT_EVENT'		: 	((entries[i].registered || entries[i].at_event) ? '1' : ' '),			// add quotes to make sure value is treated as String, not Integer
					'IS_NEW'		: 	((entries[i].isNew || entries[i].is_new == '1') ? '1' : ' ') 			// string containing event name (followed by current date and a comma)
				});

			}

		}		

		// write all objects in data array to created spreadsheet
        return xlsx.write(fname, data, function(err) {
			if(err) {
				// log error
				console.log(err);

				// call callback function with error
				return callback.call(this, err);
			}

			console.log('EXPORT', 'EXCEL', 'The excel document (' + fname + ') has been updated!');

			if(callback && typeof callback == 'function') {
				callback.call(this);
			}
		});
}

/**
 * Dumps event data to excel spreadsheet
**/
function generateOutputData() {

	// select entries to export
	mysql.connect().query("SELECT t1.student_id, t1.first, t1.last, t1.email, t1.year, t1.major, STRCMP(IFNULL(t2.student_id, ''), '') AS at_event, IFNULL(t2.is_new, '0') AS is_new FROM `students` AS t1 LEFT JOIN `attendance` AS t2 ON t1.student_id=t2.student_id AND t2.event_id='" + global_date + "'", function(err, rows, cols) {

		if(err) {
			return console.log('MYSQL', 'ERR', 'EXPORT', err);
		}

		console.log('EXCEL', 'EXPORT', 'Selected', rows.length, 'rows to export. Work in progress...');
		generateSpreadheetFromdata(rows);

	});
	
}

/**
 * Main function. Initializes program by fetching data from mysql
 * database, in order, by last_name ascending and populating database
 * object with it. Autoruns on program start.
**/
(function main() {

	// initialize api connection
	api.connect();

	// create new instance of a date object
	var date = new Date();

	// assign the current date to the database (increase .getMonth() by one since months start at 0)
	mysql.eventTableName = global_date = (date.getMonth() + 1) + '_' + date.getDate() + '_' + date.getFullYear();

	var semester 	= 'undefined';
	var year 		= date.getFullYear();

	if(date.getMonth() < 6) {
		semester = 'spring';
	} else if(date.getMonth() >= 6 && date.getMonth() < 8) {
		semester = 'summer';
	} else if(date.getMonth() >= 8 && date.getMonth() <= 12 ) {
		semester = 'fall';
	}

	// sync event database and event data with remote server
	api.send('eventmetadata', {
		eventId: mysql.eventTableName,
		semester: semester,
		year: year
	}, function() {
		console.log('API', 'Syncing event name with API server');
	});

	// detect whether an argument was passed @ app begin
	if(process.argv[2]) {
		if(process.argv[2].match(/^[0-9]{0,2}\_[0-9]{0,2}\_[0-9]{4}$/gi)) {
			console.log('> Forcing event rename. Now using date \'' + process.argv[2] + '\' to store records.');
			mysql.eventTableName = global_date = process.argv[2];
		} else {
			console.log('Ignoring request to use previous event information, incorrect event id format.');
		}
	}

	// before we try to populate internal database object, check to see if mysql server has any data in it
	mysql.connect().query('SELECT * FROM `students` ORDER BY last ASC', function(err, rows, fields) {

		if(err) {

			// if error, assume mysql server is not available, don't use mysql server at all. Fall back to spreadsheet implementation and advertise this to console
			console.log('WARN', 'MYSQL', 'Using spreadsheet file to populate database instead. (' + err + ')');

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


		// create event entry in `events` table, gather statistical analysis data
		// from previous events, re-populate previous data if restoring session
		// from previous event
		function initializeEventEntry(callback) {

			// tell program mysql process is busy
			mysql.isBusy = true;

			// tell console we're creating a table for our event instead of updating the mysql database. hopefully just this once.
			console.log('MYSQL', 'creating table in mysql database for the current event');

			// create mysql entry for current event if it doesn't exist
			mysql.connect()
				
				// insert new entry into `events` table
				.query('INSERT IGNORE INTO `events` (table_name, event_name, semester, year) VALUES ("' + mysql.eventTableName + '", "' + mysql.eventTableName + '", "' + semester + '", "' + year + '")', function(err) {
					
					// tell program request has been parsed
					mysql.isBusy = false;

					// check for error
					if(err) {
						// if an error occurrs creating table for current event, 
						console.log('FATAL', 'MYSQL', err);
						return process.exit(1);
					}

					// if table creation succeeds, tell console it has been created
					console.log('MYSQL', 'INFO', 'Event successfully added to `events` table.');

					// and also tell program table now exists
					mysql.eventEntryCreated = true;

					// index event's table and see which entries from database exist on it (done in case application is restarted more than once in the same event)
					// update local database's entries with data from mysql table's entries
					mysql.connect()
						.query('SELECT * FROM `attendance` WHERE event_id="' + mysql.eventTableName + '"', function(err, evtRows, evtCols) {
							// check for errors
							if(err) {
								return console.log('MYSQL', 'QUERY', 'An error occurred attempting to check previously stored data in mysql event table -> ' + err);
							}

							// check to see if there are values stored in table
							if(evtRows.length) {

								database.attendance = evtRows;

								// iterate through table data
								evtRows.forEach(function(row) {

									// attempt to find current entry in local database object
									var entry = database.find({
										id : row.student_id
									});

									// if value is found in local database object by its id...
									if(entry.length) {

										// ...set its flag indicating that its added to current event table in mysql server to true
										entry[0].addedToCurrentMysqlEventTable = true;
										entry[0].registered = true;

										// populate entry caches to let program know entry is indeed newly registered
										if(row.is_new) {
											// register entry as new
											database.registerNewFromMysql(entry[0]);
										} else {
											// register entry as existing
											database.register(entry[0], ENTRY_EXISTS_IN_MYSQL_DB);
										}
									}								
								});
							}

							// calculate data averages and analysis

							// select all table entries from 'events' table to gather previous data
							mysql.selectFrom('events', ['*'], null, function(err, rows, fields) {

								if(err) {
									// log errors
									return console.log('An error occurred selecting events from mysql database -> ' + err);
								}

								// iterate through events adding its total amount of guests to local database's average (recording total)
								rows.forEach(function(row) {
									if(row.table_name != global_date) {
										database.statistics.average += row.total;
										database.statistics.averageNew += row.total_new;
									}
								});

								// calculate actual averages by dividing total result by amount of rows
								database.statistics.average 	/= (rows.length > 1 ? rows.length - 1 : 0);
								database.statistics.averageNew	/= (rows.length > 1 ? rows.length - 1 : 0);

								// sync event database and event data with remote server
								api.send('eventdata', {
									students: database.entries,
									attendance: database.attendance,
									events: rows
								}, function() {
									console.log('API', 'Syncing database entries with API server');
								});

							});

							// update event table with statistical information
							updateMysqlEventsTableUsingName(null);

							// continue with callback
							callback.call(this);

						});
				});
		}


		// if no error fetching data, check to see if any data in database. don't take into account if table has been created or not
		if(rows.length) {

			// if mysql table contains data, tell program it does have data
			mysql.hasData = true;

			// then, begin adding such data to internal database object
			populateDatabaseFromMysql(rows, function(err) {

				if(err) {
					// if error, advertise fatal error and exit
					return console.log('[Fatal]: There was an error fetching data from the mysql server -> ' + err);
				}

				// if database successfully populated from mysql database, tell database all current entries exist in the mysql database
				database.forEach(function(entry) {
					// set flag for entry's existence in mysql server
					entry.existsInMysqlDatabase = true;
				});

				// check to see whether current event's table has been created.
				if(!mysql.eventEntryCreated) {
					initializeEventEntry(function() {
						autosave('mysql');
					});
				}

			});

		} else {

			// mysql database is empty. advertise that we are loading data from spreadsheet to populate mysql table
			console.log('EXCEL', 'No data found on mysql server. Using spreadsheet to populate internal database.');

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

	// define autosave function, uses recursion to create a new 'backup' file every two minutes
	function autosave(method) {

		clearTimeout(autosave.setTimeout);
		autosave.setTimeout = setTimeout(function() {

			// export all data in database to excel file
			exportDatabase(method, EXCEL_AUTOSAVE_FILE, function(err) {
				// check for errors
				if(err) {
					return console.log('There was an error auto-saving to the database: ' + err);
				}

				// advertise that the database has been auto-saved
				console.log('AUTOSAVE', 'The database has been auto-saved using method \'' + method + '\'.');

				// set timeout of 60 seconds
				clearTimeout(autosave.setTimeout);
				autosave.setTimeout = setTimeout(function() {
					// call method recursively to start auto-save process again
					autosave.call(this, method);
				}, (1000 * 60));
			});

		}, (1000 * 60));

	}
})();
