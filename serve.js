#!/usr/local/bin/node
import choikdar from "chokidar";
import express from "express";
import listen from "socket.io";
import path from "path";
import portfinder from "portfinder";
import { exec } from "child_process";

// ================

//Remove `node` and script name from arguments
let args = process.argv.slice(2);

//Check that at least one command line argument was provided
if (args.length === 0) {
	console.error("ERROR:\tNo arguments provided");
	process.exit(1);
}

//If an output file was specified in the arguments, remove it
let i;
if ((i = args.indexOf("-o")) >= 0 || (i = args.indexOf("--out-file")) >= 0) {
	args = args.splice(i, 2);
}

// ================
const COMPILE_COMMAND = `asciidoctor ${args.join(' ')} -o -`;
console.log(`Rendering command:\n${COMPILE_COMMAND}`);

function getRenderedData(callback) {
	exec(COMPILE_COMMAND, (error, stdout, stderr) => {
		if (error) callback(error, stdout);
		else callback(stderr, stdout);
	});
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

	//Directory to monitor for changes
	let monitorDir = path.dirname(args[args.length - 1]);
	console.log(`Watching for changes in "${monitorDir}"`);

	//Update all the clients when the directory updates
	choikdar.watch(monitorDir).on('all', function (event, name) {
		getRenderedData((err, data) => {
			socketIo.sockets.emit('updated', data);
			console.error(err);
		});
	});

	//When a new client connects, render and send the file
	socketIo.sockets.on('connection', function (socket) {
		getRenderedData((err, data) => {
			socket.emit('updated', data);
			console.error(err);
		});
	})
});

