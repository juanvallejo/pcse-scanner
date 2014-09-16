var fs = require('fs');
var http = require('http');
var excel = require('excel');
var xlsx = require('xlsx-writer');
var csv = require('fast-csv');

var mode = 1;
var value = '';
var ready = false;

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

var routes = {
	'/':'/index.html'
};

var db = {
	entries:[],
	raw_data:[],
	last_reg:[],
	last_new_reg:[],
	global_values:[], //global_values[0] holds company name data
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
			events:(!entry[7]) ? '' : entry[7]
		});
	},
	addLastRegistered:function(id) {
		db.last_reg.push(db.find({
			id:id
		})[0]);
	},
	addLastNewRegistered:function(id) {
		db.last_new_reg.push(db.find({
			id:id
		})[0]);
	},
	get:function(index) {
		return db.entries[index];
	},
	getRawData:function() {
		return db.raw_data;
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
	setRawData:function(data) {
		raw_data = data;
	},
	size:function() {
		return db.entries.length;
	}
};

parseDB();

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
					var date = new Date();
					var entry = db.get(name[0].index);

					entry.visits++;
					entry.events += (db.global_values[0] || date.getMonth()+'/'+date.getDate()+'/'+date.getFullYear())+',';

					db.addLastRegistered();

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

				db.add([
					id,
					name[1],
					name[0],
					'N/A',
					'N/A',
					'N/A',
					'1',
					db.global_values[0]
				]);

				var response = {
					id:id
				};

				if(name.length > 0) {
					response.fname = name[0];
					response.lname = name[1];
					response.registered = true;

					db.addLastNewRegistered(id);
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
				var command = value.split('/');
				if(command[1] == 'export') {
					exportDB(command[2],function(err) {
						if(err) {
							return res.end('There was an error exporting the data: '+err);
						}

						res.end('success');
					});
				} else if(command[1] == 'create') {

				} else if(command[1] == 'event') {
					if(command[2] == 'name') {
						db.global_values.push(command[3]);
						res.end('success');
					} else {
						res.end('Invalid event action.');
					}
				} else {
					res.end('Invalid command.');
				}
			});
		} else {
			console.log('Invalid request.');
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

function exportDB(type,callback) {
	if(type == 'excel') {
		if(fs.existsSync('db.xlsx')) {
			fs.unlink('db.xlsx',function(err) {
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

		xlsx.write('db.xlsx',data,function(err) {
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
	} else {
		var err = 'exportDB error: Invalid type.';
		callback.call(this,err)
		return console.log(err);
	}
};