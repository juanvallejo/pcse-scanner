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

var api 	= require('./api.js');
var cli 	= require('./cli_handler.js');
var consts 	= require('./constants.js');
var date 	= require('./date.js');
var db 		= require('./database.js');
var mysql 	= require('./mysql.js');
var output 	= require('./output.js');
var scanner = require('./scanner.js');
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
		scanner.init_autosave(scanner, db, mysql, api, output, save_method);
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
	if(!consts.DEBUG) {
		api.connect();
	}

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
		eventName: scanner.getEventName(),
		semester: date.get_semester(),
		year: date.get_year()
	}, function() {
		console.log('API', 'Successfully synced event name with API server.');
	});

})();
