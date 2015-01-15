#!/bin/sh

# define path to program, assuming this file is
# inside of the application's folder

PLATFORM="osx";

# get name of OS
UNAME_OUT=`uname`;

# define app variables
PATH_TO_EXEC="js/scanner.js";
APP_UI_ADDRESS="http://localhost:8000";
PLATFORM='linux';
ROOT_PATH='/home/pcse/Documents/pcse-scanner/';

gnome-terminal -e "bash -c \"google-chrome http://localhost:8000\"";
gnome-terminal -e "bash -c \"node $ROOT_PATH$PATH_TO_EXEC\"";

