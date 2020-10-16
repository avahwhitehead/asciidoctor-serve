#!/usr/local/bin/node
import choikdar from "chokidar";
import express from "express";
import listen from "socket.io";
import moment from "moment";
import os from "os";
import path from "path";
import portfinder from "portfinder";
import { exec } from "child_process";

/**
 * Return an array of all the IPv4 addresses of this computer
 * @returns {[string]}	Array of IPv4 addresses
 */
function getAllIps() {
	//Hold the found IPs
	let addresses = [];
	//Get all the connected interfaces, stored as { key: [addressInfo,addressInfo,...] }
	let interfaces = os.networkInterfaces();

	//Iterate over the interfaces
	for (let intfc of Object.values(interfaces)) {
		//Iterate over the addresses
		for (let addrInfo of intfc) {
			//Check the address is IPv4 and externally accessible
			if (addrInfo.family === 'IPv4' && !addrInfo.internal && addrInfo.address) {
				addresses.push(addrInfo.address);
			}
		}
	}
	return addresses;
}

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
	console.log(`${moment().format("YYYY-MM-DD HH:mm:ss")}\t Rendering`);
	exec(COMPILE_COMMAND, (error, stdout, stderr) => {
		if (error) callback(error, stdout);
		else callback(stderr, stdout);
	});
}

// ================

//Get the first external IP address in the list
const externalIp = getAllIps()[0] || null;

//Get a free port to use
portfinder.getPort({ port: 7000, host: externalIp }, (err, port) => {
	//Convert `localhost` and the external IP to URLs
	const localAddress = `http://localhost:${port}`;
	const externalAddress = externalIp ? `http://${externalIp}:${port}` : null;

	//Create a web server to listen on the chosen port
	const app = express();
	const server = app.listen(port, () => {
		console.log("========");
		console.log(`App running at:`);
		console.log(`- Local:\t${localAddress}`);
		if (externalAddress) console.log(`- Network:\t${externalAddress}`);
		console.log("========");
	});
	//Allow socket connections on the same port
	const socketIo = listen(server);

	// Add CORS headers to response messages
	// Source: https://stackoverflow.com/a/18311469/2966288
	app.use(function (req, res, next) {
		//Allow connecting from the client only
		res.setHeader('Access-Control-Allow-Origin', `*`);
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
	app.get('/', (req, res) => {
		res.send(`
	<!--The socket.io library-->
	<script src="/socket.io/socket.io.js"></script>
	<script>
		//Establish a socket connection to the server
		const socket = io.connect('${req.headers.host}');
		//Display the new HTML when it is received
		socket.on('updated', function(data) {
			document.getElementById("body").innerHTML = data;
		});
	</script>
	<body id="body"></body>`)
	});

	//Directory to monitor for changes
	let monitorDir = path.dirname(args[args.length - 1]);
	console.log(`Watching for changes in "${monitorDir}"`);

	//Update all the clients when the directory updates
	choikdar.watch(monitorDir).on('change', function (event, name) {
		console.log(`EVENT:\t${event}\t${name}`);
		getRenderedData((err, data) => {
			socketIo.sockets.emit('updated', data);
			console.error(err);
		});
	});

	//When a new client connects, render and send the file
	socketIo.sockets.on('connection', function (socket) {
		console.log(`New device connected`);
		getRenderedData((err, data) => {
			socket.emit('updated', data);
			console.error(err);
		});
	})
});

