/**
 * Script to organize all Pizza My Mind event information in one table
 */

var USE_CLOUD_DB = true;

var csv 	= require('fast-csv');
var fs 		= require('fs');
var excel 	= require('excel');

if(!USE_CLOUD_DB) {

	var mysql   = require('mysql').createConnection({
		host    : '127.0.0.1',
		port    : 3306,
		user    : 'root',
		password: '',
		database: 'pizza_my_mind'
	});

} else {

	var mysql   = require('mysql').createConnection({
		host    : '127.0.0.1',
		port    : 63966,
		user    : 'adminVhA9aks',
		password: 'WwnDBa9n2sNz',
		database: 'pmm'
	});

}

mysql.connect(function(err) {

	if(err) {
		return console.log('MYSQL', 'ERR', err);
	}

	console.log('Successfully connected to local database');

	// initDetectDiffsBetweenSpreadsheets('/Users/juanvallejo/Desktop/bigger.csv', '/Users/juanvallejo/Desktop/smaller.csv', 1, 1);
	// uniqueImportStudentsFromSpreadsheet('/Users/juanvallejo/Desktop/majors2016.xlsx', 'students');

	// initPopulateAttendanceTableFromEventTables('attendance');
	// initShowStudentRecordsDiff();
	// initQuickInsertEventTableIntoAttendance('9_24_2015');
	// initPopulateEventsSemesterAndYear();
	// initPopulateMasterStudenRecordsWithDiff();
	// initDetectDuplicatesOnTable('9_10_2015');

	// check for duplicates accross all events
	initDetectDuplicatesOnAttendance('2_4_2016');
	// initDetectDuplicatesOnAttendance('11_5_2015');
	// initDetectDuplicatesOnAttendance('10_29_2015');
	// initDetectDuplicatesOnAttendance('10_22_2015');
	// initDetectDuplicatesOnAttendance('10_15_2015');
	// initDetectDuplicatesOnAttendance('10_8_2015');
	// initDetectDuplicatesOnAttendance('10_1_2015');
	// initDetectDuplicatesOnAttendance('9_24_2015');
	// initDetectDuplicatesOnAttendance('9_17_2015');
	// initDetectDuplicatesOnAttendance('9_10_2015');
	// initDetectDuplicatesOnAttendance('9_3_2015');
	// initDetectDuplicatesOnAttendance('8_27_2015');

	// importEntriesFromCSVWithName('/Users/juanvallejo/Desktop/ScheduleOfClasses.csv');

});

function initDetectDiffsBetweenSpreadsheets(longListFile, masterFile, index1, index2) {

	// default email cell index
	index1 = index1 || 7;
	index2 = index2 || 3;

	console.log(index1, index2);

	var longTotal = 0;
	var masterTotal = 0;
	var longStream = fs.createReadStream(longListFile);
	var masterStream = fs.createReadStream(masterFile);

	var longStreamData = [];
	var masterStreamData = [];

	var longStreamDone = false;
	var masterStreamDone = false;

	// read first file
	var longStreamParse = csv
	.parse()
	.on('data', function(data){
		longTotal++;
		longStreamData.push(data);
	})
	.on("end", function(){
		longStreamDone = true;
		onEntryParse();
	});

	// read second file
	var masterStreamParse = csv
	.parse()
	.on('data', function(data){
		masterTotal++;
		masterStreamData.push(data);
	})
	.on("end", function(){
		masterStreamDone = true;
		onEntryParse();
	}).on("error", function(e) {
		console.log('ERR', e);
	});

	longStream.pipe(longStreamParse);
	masterStream.pipe(masterStreamParse);

	function onEntryParse() {

		if(!longStreamDone || !masterStreamDone) {
			return;
		}

		console.log('Comparing ' + longStreamData.length + ' (longstream) entries against ' + masterStreamData.length + ' (master) entries');

		var diffs = [];

		// assume both files have been parsed
		for(var  i = 0; i < longStreamData.length; i++) {
			
			var exists = false;
			for(var x = 0; x < masterStreamData.length; x++) {
				if(longStreamData[i][index1] == masterStreamData[x][index2]) {
					exists = true;
					break;
				}
			}

			if(!exists) {
				diffs.push(longStreamData[i]);
			}
		}

		console.log('Found ' + diffs.length + ' diffs');

		// write diffs to output file
		var writeStream = fs.createWriteStream("/Users/juanvallejo/Desktop/diff.csv");
		var csvWriteStream = csv.createWriteStream();

		writeStream.on('finish', function() {
			console.log('Done.');
		});

		csvWriteStream.pipe(writeStream);

		for(var i = 0; i < diffs.length; i++) {
			csvWriteStream.write(diffs[i]);
		}

		csvWriteStream.end();

	}

}

function uniqueImportStudentsFromSpreadsheet(fileName, databaseName) {

	var databaseReady = false;
	var excelReady = false;

	// stores data from local file
	var spreadsheetData = [];

	// stores existing data from database
	var databaseData = [];

	// database query callbacks
	function onDatasetsReady() {

		if(!databaseReady || !excelReady) {
			return;
		}

		console.log('Loading, estimated runtime complexity of O(n^2) ' + Math.pow(databaseData.length, 2));

		var diffs = [];

		// assume both sets have been populated
		// diff both sets and store diff in database
		for(var i = 0; i < spreadsheetData.length; i++) {

			var exists = false;

			for(var x = 0; x < databaseData.length; x++) {
				if(spreadsheetData[i][0] == databaseData[x].student_id) {
					exists = true;
					break;
				}
			}

			if(!exists) {
				diffs.push(spreadsheetData[i]);
			}
		}

		console.log('Found ' + diffs.length + ' diffs. Adding to database...');

		var totalEntries = diffs.length;
		var entriesParsed = 0;
		var entriesErr = 0;

		for(var i = 0; i < diffs.length; i++) {

			var entry = {
				student_id: diffs[i][0] || '',
				last: diffs[i][1] || '',
				first: diffs[i][2] || '',
				year: '',
				major: diffs[i][3] || '',
				email: diffs[i][5] || ''
			};

			entry.year = entry.email.match(/\.([0-9]+)\@/gi)[0];
			entry.year = entry.year ? entry.year.match(/[0-9]{2}/gi)[0] : '';
			entry.year = entry.year ? parseInt(entry.year) + 2004 : '';
		
			mysql.query('INSERT INTO `' + databaseName + '` (student_id, last, first, year, major, email, date_added) VALUES ("' 
				+ entry.student_id + '", "' + entry.last + '", "' + entry.first + '", "' + entry.year + '", "' 
				+ entry.major + '", "' + entry.email +'", "1_19_2016")', function(err) {

				entriesParsed++;

				if(err) {
					entriesErr++;
					console.log('ERR', 'Entry ' + entriesParsed + ' skipped');
				}

				if(entriesParsed >= totalEntries) {
					onEntriesSaved();
				}

			});

		}

		function onEntriesSaved() {

			if(entriesErr) {
				return console.log('ERR', entriesErr, ' entries skipped');
			}

			console.log('Successfully saved ' + entriesParsed + ' of ' + totalEntries + ' entries to the database.');
		}

	}

	// check if file exists
	if(!fs.existsSync(fileName)) {
		// define error message for no spreadsheet document found and exit
		var err = 'There is no input spreadsheet present. Unable to proceed.';

		// call callback function and pass error message
		return callback.call(this, err);
	}

	mysql.query('SELECT * FROM `' + databaseName + '`', function(err, rows) {

		if(err) {
			return console.log('ERR', 'MYSQL', err);
		}

		databaseData = rows;
		databaseReady = true;

		onDatasetsReady();

	});

	// use excel package to read spreadsheet file
	excel(fileName, function(err, data) {

		if(err) {
			// exit function and log error message to database.
			return console.log('Error reading spreadsheet file. -> '+err);
		}

		// loop through and add all rows (as arrays) from file to database
		for(var i = 1; i < data.length; i++) {
			spreadsheetData.push(data[i]);
		}

		// tell application, database has been populated
		// from the spreadsheet file.
		excelReady = true;
		onDatasetsReady();

	});

}

function importEntriesFromCSVWithName(filename) {

	var total = 0;
	var totalQueries = 0;
	var stream = fs.createReadStream(filename);

	var csvStream = csv
	.parse()
	.on('data', function(data){
		total++;
		mysql.query('INSERT INTO `coursedata` (crn, course, section, title, instructor) VALUES ("' + data[0] + '", "' + data[1] + '", "' + data[2] + '", "' + data[3] + '", "' + data[10] + '")', function(err) {
			
			if(err) {
				console.log('MYSQL', 'QUERY', err);
			}

			totalQueries++;

			console.log(totalQueries, 'of', total);

			if(totalQueries == total) {
				console.log('done');
			}

		});
	})
	.on("end", function(){

	});

	stream.pipe(csvStream);
}

function initDetectDuplicatesOnAttendance(eventName) {

	mysql.query('SELECT student_id FROM `attendance` WHERE event_id="' + eventName + '"', function(err, rows) {

		if(err) {
			return console.log('MYSQL', 'QUERY', err);
		}

		var entries = [];
		var duplicates = [];

		for(var i = 0; i < rows.length; i++) {
			if(entries.indexOf(rows[i].student_id) == -1) {
				entries.push(rows[i].student_id);
			} else {
				duplicates.push(rows[i]);
			}
		}

		console.log('Found', duplicates.length, 'duplicate entries in event', eventName);

		if(duplicates.length) {
			console.log(duplicates);
		}

	});

}

function initDetectDuplicatesOnTable(table) {
	mysql.query('SELECT student_id FROM `' + table + '`', function(err, rows) {
		
		if(err) {
			return console.log('MYSQL', 'QUERY', err);
		}

		var entries = [];
		var duplicates = [];

		for(var i = 0; i < rows.length; i++) {
			if(entries.indexOf(rows[i].student_id) == -1) {
				entries.push(rows[i].student_id);
			} else {
				duplicates.push(rows[i]);
			}
		}

		console.log('Found', duplicates.length, 'duplicate entries in table', table);

		if(duplicates.length) {
			console.log(duplicates);
		}

	});
}

/**
 * Performs a LEFT JOIN operation on all attendance data
 * Matches data with records found in `students` and
 * `students_2014_2015`. Populates `students_2014_2015` with data
 * that is found on `students` but not on `students_2014_2015`
 *
 * TLDR: Populates the chosen MASTER students table with the contents it doesn't have
 * from the other students tables 
 */
function initPopulateMasterStudenRecordsWithDiff() {
	mysql.query('SELECT t1.student_id, t2.last, t2.first, t2.year, t2.major, t2.email, t2.date_added, t3.first AS old_first, t3.last AS old_last, t1.event_id FROM `attendance` AS t1 LEFT JOIN `students` AS t2 ON t1.student_id=t2.student_id  LEFT JOIN `students_2014_2015` AS t3 ON t1.student_id=t3.student_id', function(err, rows) {
		
		if(err) {
			return console.log('MYSQL', 'QUERY', err);
		}

		var n = 0;
		var x = 0;
		var ids = [];

		// loop through returned rows and determine which
		// ones have not yet been added to the master list
		// of student records
		for(var i = 0; i < rows.length; i++) {
			if(rows[i].old_first == null) {
				if(notInIds(rows[i].student_id)) {
					ids.push(rows[i].student_id);
					n++;
					mysql.query('INSERT IGNORE INTO `students_2014_2015` (student_id, last, first, year, major, email, date_added) VALUES ("' + rows[i].student_id + '", "' + rows[i].last + '", "' + rows[i].first + '", "' + rows[i].year + '", "' + rows[i].major + '", "' + rows[i].email + '", "' + rows[i].date_added + '")', function(addErr) {

						if(addErr) {
							console.log('MYSQL', 'QUERY', addErr);
						}

						console.log(++x);

					});
				}
			} 
		}

		/**
		 * Takes a student ID and determines if it has been
		 * previously seen or not
		 */
		function notInIds(id) {
			return ids.indexOf(id) == -1;
		}

		function onPopulateMasterStudentRecordsWithDiff() {
			console.log('Added', n, 'new entries');
		}

	});
}

/**
 * Init script, to be called after a connection with the database is made
 * Displays entries present in previous semesters compared to the current one
 * Assumes `attendance` table exists and has been populated
 */
function initShowStudentRecordsDiff() {
	
	var students = [];
	var other = [];

	mysql.query('SELECT * FROM `students`', function(err, rows) {
		students = rows;

		mysql.query('SELECT * FROM `students_2014_2015`', function(otherErr, otherRows) {
			other = otherRows;
			onFinish();
		});
	});

	function onFinish() {

		var studentIsLongest = (students.length > other.length);
		var longestArray = (studentIsLongest ? students : other);
		var shortestArray = (studentIsLongest ? other : students);
		var difference = [];

		for(var i = 0; i < longestArray.length; i++) {

			var currentEntryFound = false;

			for(var x = 0; x < shortestArray.length && !currentEntryFound; x++) {
				if(longestArray[i].student_id == shortestArray[x].student_id) {
					currentEntryFound = true;
				}
			}

			if(!currentEntryFound) {
				difference.push(longestArray[i]);
			}
		}

		console.log(difference.length + '', 'differences found.');
		console.log(difference);

	}

}

/**
 * Selects all event entries from `events` table and
 * populates the 'semester' and 'year columns' based on
 * each event's ID data
 */
function initPopulateEventsSemesterAndYear() {

	var count = 0;

	mysql.query('SELECT table_name FROM `events`', function(err, rows) {
		
		if(err) {
			return console.log('MYSQL', 'QUERY', err);
		}

		for(var i = 0; i < rows.length; i++) {
			
			var pieces = rows[i].table_name.split('_');
			var year = pieces[2];
			var semester = parseInt(pieces[0]);

			if(semester < 6) {
				semester = 'spring';
			} else if(semester >= 6 && semester < 8) {
				semester = 'summer';
			} else if(semester >= 8 && semester <= 12 ) {
				semester = 'fall';
			} else {
				semester = 'undefined';
			}

			mysql.query('UPDATE `events` SET semester="' + semester +'", year="' + year + '" WHERE table_name="' + rows[i].table_name + '"', function(err) {
				if(err) {
					console.log('MYSQL', 'QUERY', 'UPDATE', err);
				}

				console.log(++count);
			});
		}

	});
}

/**
 * Init script, to be called after a connection with the database is made
 * Takes a table name and inserts its contents into `attendance`
 *
 * @param tableName String name of table
 */
function initQuickInsertEventTableIntoAttendance(tableName) {

	var total = 0;
	mysql.query('SELECT * FROM `' + tableName +'`', function(err, rows) {

		for(var i = 0; i < rows.length; i++) {

			if(rows[i].is_new != 1) {
				rows[i].is_new = 0;
			}

			mysql.query('INSERT INTO `attendance` (student_id, event_id, is_new) VALUES ("' + rows[i].student_id + '", "' + tableName + '", "' + rows[i].is_new + '")', function(err) {
				
				total++;

				console.log(total);

			});
		}
	});

}

/**
 * Init script, to be called after a connection with the database is made
 * Populates `attendance` table in database with data from each event's
 * independent table
 */
function initPopulateAttendanceTableFromEventTables(tableName) {

	var eventsList = [];
	var errors = [];
	var nTablesParsed = 0;
	var iterator = 0;

	// get a list of all events
	dbGetEventsList(function(rows, cols) {

		console.log('MYSQL', 'INFO', 'About to parse through', rows.length, 'tables...');
		addTableDataToArray();

		/**
		 * Select contents of each table and add to array as object
		 */
		function addTableDataToArray() {

			mysql.query('SELECT * FROM `' + rows[iterator].table_name + '`', function(err, evtRows, evtCols) {

				if(err) {
					console.log('MYSQL', 'ERR', 'An error has occurred while extracting data from table \'' + rows[iterator].table_name + '\'');
					return errors.push(err);
				}


				var evtToAdd = { table_name: rows[iterator].table_name, rows: evtRows };
				eventsList.push(evtToAdd);

				iterator++;
				nTablesParsed++;

				if(nTablesParsed >= rows.length) {
					onGetEventsList(eventsList);
				} else {
					addTableDataToArray();
				}

			});
		}

	});

	/**
	 * Callback called once eventsList has been populated with table data
	 */
	function onGetEventsList(rows) {
		console.log('MYSQL', 'INFO', 'Successfully parsed', eventsList.length, 'out of', rows.length, 'tables.');
		dbPopulateAttendanceTable(tableName, rows);

	}
}

/**
 * Perform a select query on all events in
 * `events` table
 */
function dbGetEventsList(callback) {
	mysql.query('SELECT table_name FROM `events` WHERE year="2015" AND semester="fall"', function(err, rows, cols) {

		if(err) {
			console.log('MYSQL', 'ERR', err);
			return process.exit(1);
		}

		callFunc(this, callback, [rows, cols]);

	});
}

/**
 * Perform an insert query on the attendance table
 * storing a reference to each student and event by ID
 *
 * @param rows Array of table rows
 */
function dbPopulateAttendanceTable(tableName, rows) {

	if(!tableName) {
		tableName = 'attendance';
	}

	var errors = [];
	var total = 0;
	var parsed = 0;

	for(var z in rows) {
		total += rows[z].rows.length;
	}

	for(var i in rows) {
		for(var x = 0; x < rows[i].rows.length; x++) {

			if(rows[i].rows[x].is_new != 1) {
				rows[i].rows[x].is_new = 0;
			}

			mysql.query('INSERT INTO `' + tableName + '` (student_id, event_id, is_new) VALUES ("' + rows[i].rows[x].student_id + '", "' + rows[i].table_name + '", "' + rows[i].rows[x].is_new + '")', function(err) {
				
				if(err) {
					errors.push(err);
				}

				if(++parsed >= total) {
					onPopulateAttendanceTable();
				}

			});
		}
	}

	function onPopulateAttendanceTable() {

		console.log('MYSQL', 'INFO', 'Successfully added', (total - errors.length), 'entries out of', total, 'to the `' + tableName + '` table.');

		if(errors.length) {
			console.log('MYSQL', 'LAST_ERROR', errors[errors.length - 1]);
		}
	}
	

}

/**
 * Ensures a callback function is not null, and attempts
 * to call it with the scope defines
 *
 * @param parameters Array of arguments to pass to a function
 */
function callFunc(scope, callback, parameters) {

	scope = scope || this;
	callback = callback && typeof callback == 'function' ? callback : function() {};
	callback.apply(scope, parameters || []);

}