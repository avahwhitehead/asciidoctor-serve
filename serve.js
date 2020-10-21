#!/usr/local/bin/node
import choikdar from "chokidar";
import express from "express";
import listen from "socket.io";
import moment from "moment";
import os from "os";
import path from "path";
import portfinder from "portfinder";
import temp from "temp";
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

//A temporary file to hold the rendered PDF
let PDF_NAME = null;

let PDF_SERVE_COMMAND = null;

//Check whether to render to PDF
const compileToPdf = (args[0].toLowerCase() === "-pdf");
if (compileToPdf) {
	//Remove the argument from the list
	args = args.slice(1);
	//Temporary file path
	PDF_NAME = temp.path({suffix: '.pdf'});

	//Check if the user provided a custom PDF viewer
	let pdfViewer = "evince";
	if (args.length >= 1 && args[0].toLowerCase() === "--viewer") {
		//Check that there are enough arguments provided
		if (args.length < 2) {
			console.error("ERROR:\t'--viewer' needs an argument");
			process.exit(1);
		}
		//Use the next argument as the PDF viewer name
		pdfViewer = args[1];
		//Remove these arguments from the list
		args = args.slice(2);
	}
	//Build the serve command
	PDF_SERVE_COMMAND = `${pdfViewer} "${PDF_NAME}"`;

	//Output the location
	console.log(`Serving as PDF with command:\n\t${PDF_SERVE_COMMAND}`);
}

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
//Hold the command to render the file
let COMPILE_COMMAND;
if (compileToPdf) {
	//Render to PDF format and write to the file
	COMPILE_COMMAND = `asciidoctor-pdf ${(args.join(' '))} -o ${PDF_NAME}`;
} else {
	//Render to HTML and output to stdout
	COMPILE_COMMAND = `asciidoctor ${(args.join(' '))} -o -`;
}

console.log(`Using rendering command:\n\t${COMPILE_COMMAND}`);

function getRenderedData(callback) {
	console.log(`${moment().format("YYYY-MM-DD HH:mm:ss")}\t Rendering`);
	exec(COMPILE_COMMAND, (error, stdout, stderr) => {
		if (error) callback(error, stdout);
		else callback(stderr, stdout);
	});
}

// ================

let onWatchTrigger = () => { };

if (!compileToPdf) {
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
			res.setHeader('Access-Control-Allow-Credentials', 'false');

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

		//Update all the clients when the directory updates
		onWatchTrigger = () => getRenderedData((err, data) => {
			socketIo.sockets.emit('updated', data);
			if (err) console.error(err);
		});

		//When a new client connects, render and send the file
		socketIo.sockets.on('connection', function (socket) {
			console.log(`New device connected`);
			onWatchTrigger();
		})
	});
} else {
	//Update all the clients when the directory updates
	onWatchTrigger = () => getRenderedData((err, data) => {
		exec(PDF_SERVE_COMMAND);
		if (data) console.log(data);
		if (err) console.error(err);
	});

	onWatchTrigger();
}

//Directory to monitor for changes
let monitorDir = path.dirname(args[args.length - 1]);
console.log(`Watching for changes in "${monitorDir}"`);

//Watch the directory for changes
choikdar.watch(monitorDir).on('change', (event) => {
	console.log(`CHANGE DETECTED:\t${event}`);
	onWatchTrigger();
});
