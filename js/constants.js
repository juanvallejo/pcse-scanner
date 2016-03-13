/**
 * Holds app settings / constants, and global variables
 */

var date = require('./date.js');

var consts = {};

consts.DEBUG 				= (process.argv[2] == '--debug' 	// turns debug mode on or off for local development
							|| process.argv[2] == '-d'); 

// used to host remote data for access with API
consts.API_SERVER_URL 		= 'https://pmm-rubyserverapps.rhcloud.com:8443';

if(consts.DEBUG) {
	console.log('WARN', 'DEBUG', 'Client running in debug mode.');
	API_SERVER_URL = 'http://localhost:7777';
}

// define server constants
consts.SERVER_PORT 		= 8000;									// port at which to have server listen for connections
consts.SERVER_HOST 		= '0.0.0.0'; 							// listening for connections in all layers of app stack

consts.EXPORT_AS_CSV 	= false; 								// determines if 'export' command should export data to a spreadsheet, or in CSV format

// define excel output and input filenames
consts.EXCEL_OUTPUT_FILE 	= 'Master.xlsx';					// define name of output spreadsheet file (will be replaced) if it exists
consts.EXCEL_AUTOSAVE_FILE	= 'db_autosave.xlsx';				// defines filename used to export autosaved backups of database entries

consts.EXCEL_RESULTS_DIR = '../results/';

consts.CSV_OUTPUT_FILE 	= 'Master.csv';							// define name of output spreadsheet file (will be replaced) if it exists

// define default mysql constants
consts.MYSQL_DEFAULT_HOST 	= 'localhost';						// define address of mysql server
consts.MYSQL_DEFAULT_PASS	= '';								// define password for mysql server
consts.MYSQL_DEFAULT_DB 	= 'pizza_my_mind';					// define default mysql database name
consts.MYSQL_DEFAULT_USER	= 'root';							// define username for mysql server

consts.API_SERVER_TIMEOUT 	= 3; 								// if unable to connect to the remote API server,
																// client will attempt to reconnect n more times before giving up
consts.API_SERVER_R_FREQ 	= 5000; 							// time in milliseconds for reconnections to happen

// define constants
consts.ENTRY_EXISTS_IN_MYSQL_DB = true;
consts.GLOBAL_DATE 			= date.get_id();					// holds global date property for program

module.exports = consts;