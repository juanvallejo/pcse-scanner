/**
 * define mysql connection object
**/

var consts = require('./constants.js');
var date = require('./date.js');

var mysql = {

	// define mysql object properties
	connection 			: 	null,				// holds the connection object to the mysql server or null if not connected
	eventEntryCreated	: 	false,				// flag indicating whether a mysql entry has been added (`events`) for current event
	hasData				:	false,				// flag indicating whether mysql database table contains any data
	isBusy 				: 	false, 				// flag indicating whether a mysql query is currently ongoing
	isConnected			: 	false,				// flag indicating whether a connection to mysql server has been established
	library				: 	require('mysql'),	// define and import node.js package

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

module.exports = mysql;