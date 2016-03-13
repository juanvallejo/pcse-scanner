/**
 * define api server connection
 */

var consts 	= require('./constants.js');
var io 		= require('socket.io-client');

var api = {
	
	// define internal state variables
	// _ denotes a private field / method

	// amount of tries left to try to reestablish
	// remote connection
	_reconnect_attempts_left: 0,
	_connection_successful: false,
	_connection_timeout: null,

	_connection_attempt_happened: false,

	// holds our api event configuration
	_on: {},

	// connection state with remote server
	// only true once the server
	// sends back a 'register' event
	_isConnected: false,

	// holds reference to 
	// socket.io-client object
	connection: null,

	/**
	 * Attempts to establish a connection with the
	 * remote API server. If a connection cannot be
	 * established, the client will attempt
	 * reconnecting API_SERVER_TIMEOUT amount of times
	 */
	connect: function() {

		if(api.connection) {
			return;
		}

		// tell api object we have at least tried
		// to connect to server
		api._connection_attempt_happened = true;
		api._reconnect_attempts_left = consts.API_SERVER_TIMEOUT;

		try {
			api.connection = io.connect(consts.API_SERVER_URL);
			api._connection_successful = true;
			api._handleSocketEvents();
		} catch(e) {
			console.log('API', 'Connection to API server unavailable, re-establishing...');
			api.reconnect();
		}

	},

	/**
	 * Checks to see if api.connect has been called
	 * as it is needed to initialize some flags.
	 * Attempts to reconnect n number of times to the
	 * remote API server
	 */
	reconnect: function() {

		// if flag is false, that means
		// api.connect has not yet been called.
		// attempt to connect as usual first
		if(!api._connection_attempt_happened) {
			return api.connect();
		}

		api._reconnect_attempts_left--;
			
		if(api._reconnect_attempts_left < 0 || api._connection_successful) {
			return console.log('API', 'Reconnection attepts to API server exceeded. Data for this event will NOT be synced.');
		}

		clearTimeout(api._connection_timeout);

		try {
			api.connection = io.connect(consts.API_SERVER_URL);
			api._connection_successful = true;
			api._handleSocketEvents();
		} catch(e) {
			api._connection_timeout = setTimeout(api.reconnect, API_SERVER_R_FREQ);
		}

	},

	/**
	 * Calls all callback functions for a specific event manually
	 * Assumes all objects stored in event arrays are functions
	 * 
	 * @param eventName String identifier for event
	 * @param params 	Array args to be passed to callbacks for eventName
	 */
	emit: function(eventName, params) {

		if(!(params instanceof Array)) {
			params = [params];
		}

		if(api._on[eventName] && api._on[eventName].length) {
			for(var i = 0; i < api._on[eventName].length; i++) {
				api._on[eventName][i].apply(this, params);
			}
		}

	},

	/**
	 * Sends an event with data to the API server.
	 * Data must be a JSON object. If the API server is unavailable,
	 * the event is queued and sent once a 'connection' event is sent
	 * back from the API server
	 *
	 * @param eventName 	String identifier for payload being sent
	 * @param data 			Object containing payload to send
	 * @callback callback 	Function called once payload is sent or queued
	 */
	send: function(eventName, data, callback) {

		// ensure callback is of type Function
		callback = callback && typeof callback == 'function' ? callback : function() {};

		if(!api.isConnected()) {
			return api.on('connected', function() {
				api.connection.emit(eventName, data);
				callback.call();
			});
		}

		api.connection.emit(eventName, data);
		callback.call();
	},

	/**
	 * Assigns passed callback function to a specific event
	 *
	 * @param eventName String event identifier to listen for
	 * @param callback 	Function callback to call when event occurs
	 */
	on: function(eventName, callback) {

		if(!api._on[eventName]) {
			api._on[eventName] = [];
		}

		api._on[eventName].push(callback);

	},

	/**
	 * object state - checks to see if a connection
	 * has been successfully established with the remote
	 * API server and that the server has returned a valid
	 * registration event and client id
	 */
	isConnected: function() {
		return api._isConnected;
	},

	handle_server_connection: function(scanner, mysql, api) {
		scanner.syncAttendanceTableWithAPIServer(mysql, api, function() {
			console.log('API', 'SYNC', 'Successfully synced `attendance` database with the API server.');
		});
	},

	handle_attendance_req: function(mysql, api, data) {

		console.log('API', 'SYNC', 'ATTENDANCE', 'Attendance data requested by API server. Sending...');
		mysql.connect().query('SELECT * FROM `attendance`', function(err, rows) {

			if(err) {
				return console.log('MYSQL', 'SYNC', 'ATTENDANCE', 'ERR', err);
			}

			api.send('attendancedata', {
				attendanceData: rows
			});

		});
	},

	/**
	 * Internal method, listens for socket.io events emitted
	 * from the server and calls any callback functions 
	 * currently assigned to that specific event.
	 * Assumes a connection has already been attempted.
	 */
	_handleSocketEvents: function() {

		api.connection.on('connected', function(data) {

			api._isConnected = true;
			api.emit('connected', data.id);

			console.log('API', 'Connection established with', consts.API_SERVER_URL ,'. Syncing enabled.');

		});

		api.connection.on('disconnect', function() {
			api._isConnected = false;
			api.emit('disconnected');
			console.log('API', 'Connection to server lost. Attempting to reconnect...');
		});

		api.connection.on('requestattendancedata', function(data) {
			api.emit('requestattendancedata', data);
		});

	}
};

module.exports = api;