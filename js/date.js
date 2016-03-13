/**
 * Date, semester, time handler
 */

var date = {

	_date: new Date(),

	get_current_date: function() {
		return date._date.getDate();
	},

	get_semester: function() {

		var semester = 'undefined';

		if(date._date.getMonth() < 6) {
			semester = 'spring';
		} else if(date._date.getMonth() >= 6 && date._date.getMonth() < 8) {
			semester = 'summer';
		} else if(date._date.getMonth() >= 8 && date._date.getMonth() <= 12 ) {
			semester = 'fall';
		}

		return semester;

	},

	get_year: function() {
		return date._date.getFullYear();
	},

	get_month: function() {
		return (date._date.getMonth() + 1);
	},

	get_id: function() {
		return (date._date.getMonth() + 1) + '_' + date._date.getDate() + '_' + date._date.getFullYear();
	}

};

module.exports = date;