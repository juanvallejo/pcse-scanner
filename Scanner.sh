#!/bin/sh

# define path to program, assuming this file is
# inside of the application's folder

PLATFORM="osx";

# get name of OS
UNAME_OUT=`uname`;

# define app variables
PATH_TO_EXEC="./js/scanner.js";
APP_UI_ADDRESS="http://localhost:8000";

if [[ "$UNAME_OUT" == 'Linux' ]]; then

   PLATFORM='linux';
   google-chrome $APP_UI_ADDRESS;

elif [[ "$UNAME_OUT" == 'Darwin' ]]; then

   PLATFORM='osx';
   open -a "Google Chrome" $APP_UI_ADDRESS;

fi


wait;
node $PATH_TO_EXEC;

