/**
 * define node.js libraries and dependencies
**/
var fs 		= require('fs');
var http 	= require('http');
var excel 	= require('excel');
var xlsx 	= require('xlsx-writer');
var csv 	= require('fast-csv');

// define application state flags
var ready = false;											// indicates whether a process, or event, has completed or fired

// define excel output and input filenames
var EXCEL_OUTPUT_FILE 	= 'db.xlsx';						// define name of output spreadsheet file (will be replaced) if it exists
var EXCEL_AUTOSAVE_FILE	= 'db_autosave.xlsx';				// defines filename used to export autosaved backups of database entries

// define default mysql constants
var MYSQL_DEFAULT_HOST 	= 'localhost';						// define address of mysql server
var MYSQL_DEFAULT_PASS	= '';								// define password for mysql server
var MYSQL_DEFAULT_DB 	= 'pizza_my_mind';					// define default mysql database name
var MYSQL_DEFAULT_USER	= 'root';							// define username for mysql server

var database = {
	entries:[],
	raw_data:[],
	last_reg:[],
	last_new_reg:[],
	global_values:[], 																	// global_values[0] holds company name data

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
					if(database.entries[i][x].toLowerCase().trim() != term[x].toLowerCase().trim()) {
						found = false;
					}
				}
				if(found) {
					results.push(database.entries[i]);
				}
			}
		} else {
			for(var i=0;i<database.entries.length;i++) {
				if(database.entries[i].id.toLowerCase() == term.toLowerCase() || database.entries[i].fname == term || database.entries[i].lname.toLowerCase() == term.toLowerCase() || database.entries[i].year == term || database.entries[i].major == term || database.entries[i].email == term) {
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

		// store entry in the last_new_reg array of recently stored 'new' entries
		database.last_new_reg.push(entry);
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
 * Checks that EXCEL_OUTPUT_FILE file exists and reads all fields from it.
 * When file is parsed, it populates the 'database' object with data from its rows.
 *
 * @param callback = {Function} to be called when excel sheet is done being read.
**/
function populateDatabaseFromSpreadsheet(fileName, callback) {
	// checks if file exists
	if(!fs.existsSync(fileName)) {
		// define error message for no spreadsheet document found and exit
		var err = 'There is no database document present. Unable to proceed.';

		// call callback function and pass error message
		return callback.call(this, err);
	}
	
	// use excel package to read spreadsheet file
	excel(fileName, function(err, data) {
		if(err) {
			// exit function and log error message to database.
			console.log('Error reading spreadsheet file. -> '+err);

			//exit
			return callback.call(this, err, data);
		}

		callback.call(this, false, data);
	});
};

(function main() {
	populateDatabaseFromSpreadsheet('clare_list.xlsx', function(err, data) {
		if(err) {
			return console.log(err);
		}

		// loop through and add all rows (as arrays) from file to database
		for(var i = 1; i < data.length; i++) {
			database.add(data[i]);
		}

		// fetch contents of file we are comparing with
		populateDatabaseFromSpreadsheet('my_list.xlsx', function(err, data2) {
			// check for errors
			if(err) {
				// exit and log error
				return console.log(err);
			}

			// loop through and add all rows (as arrays) from file to database
			data2.forEach(function(entry, index) {
				// skip first index, just headers
				if(index < data2.length - 1 ) {
					var find = database.find({
						lname : entry[3]
					});

					if(!find.length) {
						// console.log('mismatch @ ' + entry);
					} else {
						find.forEach(function(found, index) {
							database.get(find[index].index).matched = true;
						});
					}
				}
			});

			database.forEach(function(entry) {
				if(!entry.matched) {
					console.log(entry);
				}
			});

			// var find = database.find({
			// 	lname : 'gasteiger'
			// });

			// tell application, database has been populated
			// from the spreadsheet file.
			ready = true;

			// add plain array from file as backup data to database.
			database.setRawData(data);

			// Log to database that database has been populated and app is ready.
			console.log('loaded ' + data.length + ' items + ' + data2.length + ' items');
		});
	});
})();