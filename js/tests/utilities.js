/**
 * Script to organize all Pizza My Mind event information in one table
 */

var mysql   = require('mysql').createConnection({
	host    : '127.0.0.1',
	port    : 3306,
	user    : 'root',
	password: '',
	database: 'pizza_my_mind'
});

mysql.connect(function(err) {

	if(err) {
		return console.log('MYSQL', 'ERR', err);
	}

	console.log('Successfully connected to local database');

	// initPopulateAttendanceTableFromEventTables('attendance');
	// initShowStudentRecordsDiff();
	// initQuickInsertEventTableIntoAttendance('9_24_2015');
	// initPopulateEventsSemesterAndYear();
	// initPopulateMasterStudenRecordsWithDiff();
	// initDetectDuplicatesOnTable('9_10_2015');

	// check for duplicates accross all events
	initDetectDuplicatesOnAttendance('11_12_2015');
	initDetectDuplicatesOnAttendance('11_5_2015');
	initDetectDuplicatesOnAttendance('10_29_2015');
	initDetectDuplicatesOnAttendance('10_22_2015');
	initDetectDuplicatesOnAttendance('10_15_2015');
	initDetectDuplicatesOnAttendance('10_8_2015');
	initDetectDuplicatesOnAttendance('10_1_2015');
	initDetectDuplicatesOnAttendance('9_24_2015');
	initDetectDuplicatesOnAttendance('9_17_2015');
	initDetectDuplicatesOnAttendance('9_10_2015');
	initDetectDuplicatesOnAttendance('9_3_2015');
	initDetectDuplicatesOnAttendance('8_27_2015');

});

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