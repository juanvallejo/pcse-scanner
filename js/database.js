/**
 * Wrapper for internal program database. Deefines main database object used to hold, add, and handle data
 * entries from spreadsheet
**/

var consts = require('./constants.js');
var date = require('./date.js');

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

	_callbacks: {},

	events: {
		EVT_ONDATA: 'data'
	},

	on: function(eventName, callback) {

		if(!database._callbacks[eventName]) {
			database._callbacks[eventName] = [];
		}

		database._callbacks[eventName].push(callback);
	},

	emit: function(eventName, params) {
		
		if(!database._callbacks[eventName]) {
			return;
		}

		if(!(params instanceof Array)) {
			params = [params];
		}

		database._callbacks[eventName].forEach(function(fn) {
			fn.apply(database, params);
		});
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
			console.log('REGISTER', 'DUPLICATE', 'The entry with id "', entry.id, '" already exists in the MySQL database.');
		}

		if(typeof entry == 'object') {

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
		callback = (callback && typeof callback == 'function') || function() {};

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

	remove: function(scanner, mysql, entry, callback) {

		callback = callback || function() {};

		// if entry param exists
		if(entry) {
			// if the entry exists in the database server, remove it from there
			if(entry.registered && entry.addedToCurrentMysqlEventTable && !entry.deleted) {
				// delete row from mysql table for current event
				mysql.deleteFrom(scanner.getEventId(), 'student_id = ' + entry.id, function(err) {
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
	size: function(a) {
		return a == 'registered' ? database.statistics.registeredCount : database.entries.length;
	},

	// create event entry in `events` table, gather statistical analysis data
	// from previous events, re-populate previous data if restoring session
	// from previous event
	initializeEventEntry: function(scanner, mysql, api, callback) {

		// tell program mysql process is busy
		mysql.isBusy = true;

		// tell console we're creating a table for our event instead of updating the mysql database. hopefully just this once.
		console.log('MYSQL', 'Initializing event data...');

		// create mysql entry for current event if it doesn't exist
		mysql.connect()
			
			// insert new entry into `events` table
			.query('INSERT IGNORE INTO `events` (table_name, event_name, semester, year) VALUES ("' + scanner.getEventId() + '", "' + scanner.getEventName() + '", "' + date.get_semester() + '", "' + date.get_year() + '")', function(err) {
				
				// tell program request has been parsed
				mysql.isBusy = false;

				if(err) {
					console.log('FATAL', 'MYSQL', err);
					return process.exit(1);
				}

				console.log('MYSQL', 'INFO', 'Event successfully added to `events` table.');
				mysql.eventEntryCreated = true;

				// index event's table and see which entries from database exist on it (done in case application is restarted more than once in the same event)
				// update local database's entries with data from mysql table's entries
				mysql.connect()
					.query('SELECT * FROM `attendance` WHERE event_id="' + scanner.getEventId() + '"', function(err, evtRows, evtCols) {

						if(err) {
							return console.log('MYSQL', 'QUERY', 'An error occurred attempting to check previously stored data in mysql event table -> ' + err);
						}

						// restore previous data to program database if any
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
										database.registerNewFromMysql(entry[0]);
									} else {
										database.register(entry[0], consts.ENTRY_EXISTS_IN_MYSQL_DB);
									}
								}								
							});
						}

						// select all table entries from 'events' table to gather previous data
						mysql.selectFrom('events', ['*'], null, function(err, rows, fields) {

							if(err) {
								return console.log('An error occurred selecting events from mysql database -> ' + err);
							}

							// iterate through events adding its total amount of guests to local database's average (recording total)
							// if current event row contains previously assigned name, recover it
							rows.forEach(function(row) {
								
								if(row.table_name != scanner.getEventId()) {
									database.statistics.average += row.total;
									database.statistics.averageNew += row.total_new;
								} else {
									
									if(row.event_name != scanner.getEventName()) {
										console.log('Recovering previous event name', row.event_name);
										scanner.updateEventName(scanner, mysql, api, row.event_name);
									}

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

						callback.call(this);

					});
			});
	},

	init: function(scanner, mysql, api, output) {

		// before we try to populate internal database object, check to see if mysql server has any data in it
		mysql.connect().query('SELECT * FROM `students` ORDER BY last ASC', function(err, rows, fields) {

			if(err) {

				// if error, assume mysql server is not available, don't use mysql server at all. Fall back to spreadsheet implementation and advertise this to console
				console.log('WARN', 'MYSQL', 'Using spreadsheet file to populate database instead. (' + err + ')');

				// populate database from spreadsheet and exit
				return scanner.populateDatabaseFromSpreadsheet(scanner, database, function(err) {

					if(err) {
						// if fallback spreadsheet implementation errors, advertise error message and exit.
						return console.log(	'[Fatal]: There was an error populating the database using spreadsheet' +
											'file as backup, and the mysql database as a primary means -> ' + err);
					}

					database.emit('ready', ['excel']);

				});
			}

			// if no error fetching data, check to see if any data in database. don't take into account if table has been created or not
			if(rows.length) {

				// if mysql table contains data, tell program
				mysql.hasData = true;

				// then, begin adding such data to internal database object
				scanner.populateDatabaseFromMysql(scanner, database, rows, function(err) {				

					if(!mysql.eventEntryCreated) {
						database.initializeEventEntry(scanner, mysql, api, function() {
							database.emit('ready', ['mysql']);
						});
					}

				});

			} else {

				// mysql database is empty. advertise that we are loading data from spreadsheet to populate mysql table
				console.log('EXCEL', 'No data found on mysql server. Using spreadsheet to populate internal database.');

				// if no data in database, use spreadsheet data to populate our local database object, and then
				// use the newly populated local 'database' object to populate mysql server database
				scanner.populateDatabaseFromSpreadsheet(scanner, database, function(err) {

					if(err) {
						return console.log('[Fatal]: Error populating local database object from spreadsheet -> ' + err);
					}

					// once internal database object has data in it, export data to mysql server if empty
					scanner.exportDatabase(scanner, database, mysql, api, output, 'mysql', consts.EXCEL_AUTOSAVE_FILE, function(err) {

						if(err) {
							console.log('An error occurred populating empty mysql database -> ' + err);
							return database.emit('ready', ['excel']);
						}

						// begin auto-saving new data to mysql database
						database.emit('ready', ['mysql']);
					});
				});

			}
		});
	}

};

module.exports = database;