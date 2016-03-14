/**
 * Module with utilities to output data to a file
 */

var fs 		= require('fs');
var csv 	= require('fast-csv');
var xlsx 	= require('xlsx-writer');
var consts 	= require('./constants.js');

var output = {

	generateMysqlSync: function(scanner, mysql, db, callback) {

		// check to see if server is still parsing a previous request
		if(mysql.isBusy) {
			return callback.call(output, 'unable to export database using mysql method. mysql server is still exporting last query request.');
		}

		// once a table has been created, determine whether main mysql server database table 'students' contains any data
		if(!mysql.hasData) {

			mysql.isBusy = true;

			// define index to tell how many entries have been added to mysql database
			var entryInsertCount = 0;

			// iterate through database entries and exit
			return db.forEach(function(entry) {
				// if mysql database table 'students' is empty, populate it
				mysql.insertInto(

					'students', 
					['student_id', 'last', 'first', 'year', 'major', 'email', 'date_added'],
					[entry.id, entry.lname, entry.fname, entry.year, entry.major, entry.email, scanner.getEventId()],

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
						if(entryInsertCount == db.size()) {
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
		db.forEach(function(entry, index) {

			// check to see if entry in list of new entries for this event has already been added as new value to mysql
			// table 'students'
			if(!entry.existsInMysqlDatabase) {
				// log that we are adding a newly registered person to the 'students' table in mysql database
				console.log('MYSQL', 'INSERT', 'INFO', 'adding new entry with id ' + entry.id + ' to the student mysql table.');

				// insert new entry into database
				mysql.insertInto(

					'students', 
					['student_id', 'last', 'first', 'year', 'major', 'email', 'date_added'],
					[entry.id, entry.lname, entry.fname, entry.year, entry.major, entry.email, scanner.getEventId()],

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
					[entry.id, entry.lname, entry.fname, entry.year, entry.major, entry.email, scanner.getEventId()],

					function(err) {
						if(err) {
							return console.log('FATAL', 'MYSQL', 'INSERT{NewStudent->students_master}', err);
						}
					}
				);

				// sync with local attendance table
				var existsInAttendanceArray = false;
				for(var i = 0; i < db.attendance.length && !existsInAttendanceArray; i++) {
					if(entry.id == db.attendance[i].student_id) {
						existsInAttendanceArray = true;
					}
				}

				// add entry fields to attendance only if it has not been
				// added before. Only for use with remote API syncing
				if(!existsInAttendanceArray) {
					db.attendance.push({
						student_id: entry.id,
						event_id: scanner.getEventId(),
						is_new: 1
					});

					console.log('LOCAL', 'SYNC', 'Added new entry', entry.fname, entry.lname, '(', entry.id, ') to local database attendance.');
				}

				// add to `attendance` table
				mysql.connect().query(

					"INSERT INTO `attendance` (`student_id`, `event_id`, `is_new`)" +
					"VALUES" +
					"	('" + entry.id + "', '" + scanner.getEventId() + "', 1);",

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
				for(var i = 0; i < db.attendance.length && !existsInAttendanceArray; i++) {
					if(entry.id == db.attendance[i].student_id) {
						existsInAttendanceArray = true;
					}
				}

				// add entry fields to attendance only if it has not been
				// added before. Only for use with remote API syncing
				if(!existsInAttendanceArray) {
					db.attendance.push({
						student_id: entry.id,
						event_id: scanner.getEventId(),
						is_new: entry.isNew
					});

					console.log('LOCAL', 'SYNC', 'Added entry', entry.fname, entry.lname, '(', entry.id, ') to local database attendance.');
				}

				entry.addedToCurrentMysqlEventTable = true;

				// add to `attendance` table
				mysql.connect().query(

					"INSERT INTO `attendance` (`student_id`, `event_id`, `is_new`)" +
					"VALUES" +
					"	('" + entry.id + "', '" + scanner.getEventId() + "', 0);",

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

	},

	generateCSVFromData: function(scanner, db, callback) {

		var fname = consts.EXCEL_RESULTS_DIR + scanner.getEventId() + '_' + consts.CSV_OUTPUT_FILE;

		if(fs.existsSync(fname)) {
			fs.unlink(fname, function(err) {
				if(err) {
					return console.log(err);
				}

				console.log('Preparing CSV file...');
			});
		}

		var stream = csv.createWriteStream({ headers: true });
		var writeStream = fs.createWriteStream(fname);
		var data = [];

		writeStream.on('finish', function() {
			console.log('The CSV document has been updated!');
			callback.call(this);
		});

		stream.pipe(writeStream);

		for(var i=0;i<db.size();i++) {
			if(!db.get(i).deleted) {
				stream.write({
					
					ID: db.get(i).id,
					FIRST: db.get(i).fname,
					LAST: db.get(i).lname,
					FIRST: db.get(i).email,
					YEAR: db.get(i).year,
					MAJOR: db.get(i).major,
					EMAIL: db.get(i).email,
					AT_EVENT: (db.get(i).registered ? '1' : ' '),
					IS_NEW: (db.get(i).isNew ? '1' : ' ')
				
				});
			}
		}

		// release file resources and safely close stream
		stream.end();

	},

	/**
	 * Stores an array of objects into a spreadsheet
	 */
	generateSpreadsheetFromData: function(scanner, entries, callback) {

		var fname = consts.EXCEL_RESULTS_DIR + scanner.getEventId() + '_' + consts.EXCEL_OUTPUT_FILE;

		// delete previosuly saved file with same name
		if(fs.existsSync(fname)) {
			fs.unlink(fname,function(err) {
				if(err) {
					return console.log(err);
				}

				console.log('EXPORT', 'EXCEL', 'Preparing file', fname + '...');
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
};

module.exports = output;