/**
* Provided under the MIT License (c) 2014
* See LICENSE @file for details.
*
* @file index.js
*
* @author juanvallejo
* @date 10/15/14
*
* Scanner application 'server'. Handles all data processing and i/o.
* Reads data from a local mysql database, builds an internal structure
* with it, and allows for easy manipulation of it. Outputs to .xlsx file.
*
* Note: @callback_params are parameters a callback function receives
*
* Important: Requires the following dependencies / node.js packages:
*
*		- csv 	-> npm install fast-csv
* 		- excel -> npm install excel
* 		- mysql	-> npm install mysql
* 		- xlsx 	-> npm install xlsx-writer
*
* Mysql query to select all rows for an event
* """
* SELECT t1.student_id, t1.first, t1.last, t1.email, t1.year, t1.major, STRCMP(IFNULL(t2.student_id, ''), '') AS at_event, IFNULL(t2.is_new, '0') AS is_new FROM `students` AS t1 INNER JOIN `attendance` AS t2 ON t1.student_id=t2.student_id AND t2.event_id='3_10_2016'
* """
*
*/

var consts 	= require('./constansts.js');
var mysql 	= require('./mysql.js');
var db 		= require('./database.js');
var api 	= require('./api.js');
var cli 	= require('./cli_handler.js');
var scanner = require('./scanner.js');
var output 	= require('./output.js');
var server 	= require('./server.js');

/**
 * Main function. Initializes program by fetching data from mysql
 * database, in order, by last_name ascending and populating database
 * object with it. Autoruns on program start.
**/
(function main() {

	var event_id = date.get_id();

	if(process.argv[2]) {
		if(process.argv[2].match(/^[0-9]{0,2}\_[0-9]{0,2}\_[0-9]{4}$/gi)) {
			console.log('> Forcing event rename. Now using date \'' + process.argv[2] + '\' to store records.');
			event_id = process.argv[2];
		} else {
			console.log('Ignoring request to use previous event information, incorrect event id format.');
		}
	}

	// initialize cli input handler
	cli.init();
	cli.on('data', function(data) {
		cli.handle_cli_input(db, data);
	});

	// initialize scanner with event id
	scanner.init(event_id);

	// initialize database
	db.init(scanner, mysql, api, output);
	db.on('ready', function(save_method) {
		scanner.init_autosave(api, output, save_method);
	});

	// initialize http server
	server.init();
	server.on('register', function(response, data) {
		server.handle_register_req(db, response, data);
	});

	server.on('new_register', function(response, data) {
		server.handle_register_new_req(db, response, data);
	});

	server.on('command', function(response, data) {
		server.handle_command_req(scanner, api, output, mysql, db, response, data);
	});

	// initialize api connection
	if(!consts.DEBUG) api.connect();

	// request attendance hash as soon as API server connects
	api.on('connected', function() {
		api.handle_server_connection(scanner, mysql, api);
	});

	// listen for full attendance data request from API server
	// fetch all entries and send via 'attendancedata' event.
	api.on('requestattendancedata', function(data) {
		api.handle_attendance_req(mysql, api, data);
	});

	// sync event database and event data with remote server
	api.send('eventmetadata', {
		eventId: scanner.getEventId(),
		semester: date.get_semester(),
		year: date.get_year()
	}, function() {
		console.log('API', 'Syncing event name with API server');
	});

	// before we try to populate internal database object, check to see if mysql server has any data in it
	mysql.connect().query('SELECT * FROM `students` ORDER BY last ASC', function(err, rows, fields) {

		if(err) {

			// if error, assume mysql server is not available, don't use mysql server at all. Fall back to spreadsheet implementation and advertise this to console
			console.log('WARN', 'MYSQL', 'Using spreadsheet file to populate database instead. (' + err + ')');

			// populate database from spreadsheet and exit
			return scanner.populateDatabaseFromSpreadsheet(db, function(err) {

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
				.query('INSERT IGNORE INTO `events` (table_name, event_name, semester, year) VALUES ("' + scanner.getEventId() + '", "' + scanner.getEventName() + '", "' + semester + '", "' + year + '")', function(err) {
					
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
						.query('SELECT * FROM `attendance` WHERE event_id="' + scanner.getEventId() + '"', function(err, evtRows, evtCols) {
							// check for errors
							if(err) {
								return console.log('MYSQL', 'QUERY', 'An error occurred attempting to check previously stored data in mysql event table -> ' + err);
							}

							// check to see if there are values stored in table
							if(evtRows.length) {

								db.attendance = evtRows;

								// iterate through table data
								evtRows.forEach(function(row) {

									// attempt to find current entry in local database object
									var entry = db.find({
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
											db.registerNewFromMysql(entry[0]);
										} else {
											// register entry as existing
											db.register(entry[0], ENTRY_EXISTS_IN_MYSQL_DB);
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
									if(row.table_name != scanner.getEventId()) {
										db.statistics.average += row.total;
										db.statistics.averageNew += row.total_new;
									}
								});

								// calculate actual averages by dividing total result by amount of rows
								db.statistics.average 	/= (rows.length > 1 ? rows.length - 1 : 0);
								db.statistics.averageNew	/= (rows.length > 1 ? rows.length - 1 : 0);

								// sync event database and event data with remote server
								api.send('eventdata', {
									students: db.entries,
									attendance: db.attendance,
									events: rows
								}, function() {
									console.log('API', 'Syncing database entries with API server');
								});

							});							

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
			scanner.populateDatabaseFromMysql(db, rows, function(err) {				

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
			scanner.populateDatabaseFromSpreadsheet(db, function(err) {
				// check for errors
				if(err) {
					// advertise error and exit
					return console.log('[Fatal]: Error populating local database object from spreadsheet -> ' + err);
				}

				// once internal database object has data in it, export data to mysql server if empty
				scanner.exportDatabase(api, output, 'mysql', EXCEL_AUTOSAVE_FILE, function(err) {
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
			scanner.exportDatabase(api, output, method, EXCEL_AUTOSAVE_FILE, function(err) {
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
