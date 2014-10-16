/**
* Provided under the MIT License (c) 2014
* See LICENSE @file for details.
*
* @file scanner.js
*
* @author juanvallejo
* @date 10/7/14
*
* Canvas animation library. Consists of three separate 'method modules' that define methods specific
* to the Lib object, spritesheet objects, canvas line objects, and canvas rectangle objects.
* Such events are separated for modularity and readability in one file. Shared methods are functions that
* are general enough to apply to all three types of Lib.js objects.
*
* Note: Include important notes on program here.
*
* Important: Include anything needed to run / dependencies required here.
*/

/**
 * define node.js libraries and dependencies
**/
var fs 		= require('fs');
var http 	= require('http');
var excel 	= require('excel');
var xlsx 	= require('xlsx-writer');
var csv 	= require('fast-csv');

/**
 * define mysql connection object
**/
var mysql = {
	// define and import node.js package
	library: require('mysql'),

	// flag indicating whether a connection to mysql server has been established
	isConnected:false,

	// holds the connection object to the mysql server or null if not connected
	connection: null,

	// creates and establishes a connection to the mysql server
	connect: function(host, user, password, database) {
		if(!mysql.isConnected || (host && user && password)) {
			// create connection blueprint
			mysql.connection = mysql.library.createConnection({
				host: 			host || 'localhost',
				user: 			user || 'root',
				pass: 		password || '',
				database: 	database || 'pizza_my_mind'
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

	//safely close the mysql connection
	end:function() {
		if(mysql.isConnected) {
			// reset our flag to indicate no connection exists
			mysql.isConnected = false;

			// send close packet to server
			mysql.connection.end();
		}
	}
};

/**
 * define variables required for command line interface
**/
var mode = 1;
var value = '';
var ready = false;

/**
 * define file extensions and their associated 'content' mime type
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
 * define main database object used to hold, add, and handle data
 * entries from spreadsheet
**/
var db = {
	entries:[],
	raw_data:[],
	last_reg:[],
	last_new_reg:[],
	global_values:[], 								//global_values[0] holds company name data
	global_date:'0/0/0000',
	add:function(entry) {
		db.raw_data.push(entry);
		db.entries.push({
			index:db.entries.length,
			id:entry[0],
			fname:entry[2],
			lname:entry[1],
			year:entry[3],
			major:entry[4],
			email:entry[5],
			visits:entry[6] == ' ' ? 0 : parseInt(entry[6]),
			events:(!entry[7]) ? '' : entry[7],
			deleted:false
		});

		return db.entries[db.entries.length-1];
	},

	/**
	 * Loops through each database 'entry' and calls function passing
	 * current entry and its index as parameters
	 *
	 * @param callback = {Function} to call on every iteration
	**/
	forEach:function(callback) {
		for(var i=0;i<db.size();i++) {
			// call the passed function for every item in 'database'
			callback.call(db, db.get(i), i);
		}
	},
	get:function(index) {
		return db.entries[index];
	},
	getRawData:function() {
		return db.raw_data;
	},
	getRegistered:function() {
		return db.last_reg;
	},
	getRegisteredNew:function() {
		return db.last_new_reg;
	},
	find:function(term) {
		var results = [];
		if(typeof term == 'object') {
			var found = true;
			for(var i=0;i<db.entries.length;i++) {
				found = true;
				for(var x in term) {
					if(db.entries[i][x] != term[x]) {
						found = false;
					}
				}
				if(found) {
					results.push(db.entries[i]);
				}
			}
		} else {
			for(var i=0;i<db.entries.length;i++) {
				if(db.entries[i].id == term || db.entries[i].fname == term || db.entries[i].lname == term || db.entries[i].year == term || db.entries[i].major == term || db.entries[i].email == term) {
					results.push(db.entries[i]);
				}
			}
		}
		return results;
	},
	has:function(id) {
		var found = false;
		for(var i=0;i<db.entries.length;i++) {
			if(db.entries[i].id == id) {
				found = true;
				break;
			}
		}
		return found;
	},
	isRegistered:function(entry) {
		var response = false;

		if(typeof entry == 'object') {
			for(var i=0;i<db.last_reg.length;i++) {
				if(db.last_reg[i] == entry) {
					response = true;
				}
			}
		}

		return response;
	},
	register:function(id) {
		if(typeof id == 'object') {
			db.last_reg.push(id);
		} else {
			db.last_reg.push(db.find({
				id:id
			})[0]);
		}
	},
	registerNew:function(id) {
		db.last_new_reg.push(db.find({
			id:id
		})[0]);
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
		return db.entries.length;
	}
};

parseDB(function() {
	var date = new Date();
	db.global_date = date.getMonth()+'/'+date.getDate()+'/'+date.getFullYear();

	var autosave = (function auto_save_process() {
		exportDB('excel','db_autosave.xlsx',function(err) {
			if(err) {
				return console.log('There was an error auto-saving to the database: '+err);
			}

			console.log('The database has been auto-saved');
			setTimeout(auto_save_process,(1000*60));
		});
	})();
});

var stdin = process.stdin;
process.stdin.setEncoding('utf8');
stdin.setRawMode(true);
stdin.on('data',function(key) {
	if(key =='\3') {
		process.exit();
	} else if(key == '\r') {
		if(ready) {
			var command = value.split('/');
			if(command[1] == 'export') {
				if(command[2] == 'excel') {
					exportDB();
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

var server = http.createServer(function(req,res) {
	var path = routes[req.url] || req.url;

	if(path == '/register') {
		if(req.method == 'POST') {
			var value = '';
			req.on('data',function(chunk) {
				value += chunk;
			});
			req.on('end',function() {
				var id = value.split('sid=')[1];
				
				var name = db.find({
					id:id
				});

				var response = {
					id:id
				};

				if(name.length == 0) {
					var name2 = db.find({
						id:'00'+id
					});

					if(name2.length > 0) {
						name = name2;
					}
				}

				if(name.length > 0) {
					var entry = db.get(name[0].index);

					if(db.isRegistered(entry)) {
						response.alreadyRegistered = true;
					} else {
						entry.visits++;
						entry.events += (db.global_values[0] || db.global_date)+',';

						db.register(name[0]);
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
				var id = '00'+value.split('sid=')[1];
				var name = id.split('&name=')[1].split(' ');
				id = id.split('&name=')[0];

				if(name) {
					console.log('Registering '+name+' with ID '+id);
				}

				db.registerNew(id);

				db.add([
					id,
					name[1],
					name[0],
					'N/A',
					'N/A',
					'N/A',
					'1',
					(db.global_values[0] || db.global_date)+','
				]);

				var response = {
					id:id
				};

				if(name.length > 0) {
					response.fname = name[0];
					response.lname = name[1];
					response.registered = true;
				} else {
					response.registered = false;
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
					exportDB(command[2],function(err) {
						if(err) {
							return res.end('ERR: There was an error exporting the data: '+err);
						}

						res.end('success');
					});
				} else if(command[1] == 'query') {
					res.end('I am not allowed to index the database yet.');
				} else if(command[1] == 'create') {
					res.end('ERR: Unimplemented command.');
				} else if(command[1] == 'event') {
					if(command[2] == 'name') {
						db.global_values[0] = decodeURIComponent(command[3]+' ('+db.global_date+')');
						res.end('success');
					} else if(command[2] == 'delete') {						
						if(command[3] == 'top') {
							db.remove(db.getRegistered()[0]);
							res.end('success');
						} else if(command[3] == 'bottom') {
							db.remove(db.getRegistered()[db.getRegistered().length-1]);
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
}).listen(8000);

function parseDB(callback) {
	if(fs.existsSync('db.xlsx')) {
		excel('db.xlsx',function(err,data) {
			if(err) {
				console.log('Error reading database document.');
				return console.log(err);
			}

			for(var i=1;i<data.length;i++) {
				db.add(data[i]);
			}

			if(typeof callback == 'function') callback.call(this);

			ready = true;
			db.setRawData(data);

			console.log('Database loaded. Waiting for scanner...');
		});
	} else {
		console.log('There is no database document present. Unable to proceed.');
	}
};

function parseBarcode(code) {
	code = code.substring(2);
	var search = db.find({
		id:code
	});

	if(search.length) {
		console.log('Welcome back, '+search[0].fname+' '+search[0].lname+'!');
	} else {
		console.log('You must be new here... ('+code+')');
	}
};

function exportDB(type,fname,callback) {
	if(typeof fname == 'function' && !callback) {
		callback = fname;
		fname = null;
	}

	if(!fname) {
		fname = 'db.xlsx';
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

		var data = [];
		var entry = {};
		for(var i=0;i<db.size();i++) {
			entry = db.get(i);
			if(!entry.deleted) {
				data.push({
					'ID':entry.id,
					'LAST':entry.lname,
					'FIRST':entry.fname,
					'STUCLASS_DESC':entry.year,
					'MAJR1':entry.major,
					'EMAIL':entry.email,
					'VISITS':(""+entry.visits+""),
					'EVENTS':entry.events
				});
			}
		}

		xlsx.write(fname,data,function(err) {
			if(err) {
				return console.log(err);
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

		stream.pipe(writeStream);

		for(var i=0;i<db.size();i++) {
			stream.write({first_name:db.get(i).fname,last_name:db.get(i).lname,email:db.get(i).email});
		}

		stream.end();
	} else if(type == 'mysql') {
		// connect to mysql server and export data from db object to it
		db.forEach(function(entry, index) {
			// iterate through each 'entry' and input its data as rows into the database
			mysql.connect()
				.query('INSERT INTO students(student_id, last, first, year, major, email) VALUES ("' +
					entry.id 	+ '", "' +
					entry.lname + '", "' +
					entry.fname + '", "' +
					entry.year 	+ '", "' + 
					entry.major + '", "' +
					entry.email + '")'
				);
		});

		console.log('successfully exported data to the mysql server.');
	} else {
		var err = 'exportDB error: Invalid type.';
		callback.call(this,err)
		return console.log(err);
	}
};
