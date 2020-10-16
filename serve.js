#!/usr/local/bin/node
import express from "express";
import fs from "fs";
import listen from "socket.io";
import portfinder from "portfinder";
import { exec } from "child_process";

// ================

//Remove `node` and script name from arguments
const args = process.argv.slice(2);

//Get the path to the asciidoc file
const FILE_NAME = args[0];
//File name not provided
if (!FILE_NAME) {
	console.error("ERROR:	File name required");
	process.exit(1);
}
//File does not exist
if (!fs.existsSync(FILE_NAME)) {
	console.error("ERROR:	File does not exist");
	process.exit(1);
}


// ================


//Get a free port to use
portfinder.getPort({ port: 7000 }, (err, port) => {
	//HTML/JS to run on the client side
	const RESPONSE_HTML = `
	<!--The socket.io library-->
	<script src="/socket.io/socket.io.js"></script>
	<script>
		//Establish a socket connection to the server
		const socket = io.connect('http://localhost:${port}');
		//Display the new HTML when it is received
		socket.on('updated', function(data) {
			document.getElementById("body").innerHTML = data;
		});
	</script>
	<body id="body"></body>`;

	// ================

	//Create a web server to listen on the chosen port
	const app = express();
	const server = app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
	//Allow socket connections on the same port
	const socketIo = listen(server);

	// Add CORS headers to response messages
	// Source: https://stackoverflow.com/a/18311469/2966288
	app.use(function (req, res, next) {
		//Allow connecting from the client only
		res.setHeader('Access-Control-Allow-Origin', `http://localhost:${port}`);
		//Request methods to allow
		//'GET, POST, OPTIONS, PUT, PATCH, DELETE'
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
		//Request headers to allow
		res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
		//Include cookies in sent requests (e.g. for sessions)
		res.setHeader('Access-Control-Allow-Credentials', false);

		//Pass to next layer of middleware
		next();
	});

	//Return the HTML page
	app.get('/', (req, res) => res.send(RESPONSE_HTML));

	//Notify all the clients when the file updates
	fs.watch(FILE_NAME, function (event, name) {
		console.log(`File changed: ${name}`);
		//Load the new data
		fs.readFile(FILE_NAME, (err, data) => {
			//Send the new data to the clients
			socketIo.sockets.emit('updated', data.toString());
		});
	});
});

