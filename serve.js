#!/usr/local/bin/node
import choikdar from "chokidar";
import Command from "commander";
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

//Build the command line argument parser
const program = new Command.Command()
	.name("asciidoctor-serve")
	.usage("[options] [asciidoctor options]")
	.allowUnknownOption()
	.option('-pdf', "Whether to serve a PDF viewer instead of a web server")
	.option('-v, --viewer <viewer>', "The command to start up the PDF viewer (requires `-pdf`)", "evince")
	.option('--refresh', "If the PDF viewer does not refresh automatically when the document is changed (requires `-pdf`)");

program.on('--help', () => {
	console.log('');
	console.log(`[asciidoctor options] is any option string (except '-o') accepted by asciidoctor. You can view these with "asciidoctor --help"`);
	console.log('');
	console.log('Example calls:');
	console.log('    $ `asciidoctor-serve document.adoc`');
	console.log('        Render the document `document.adoc` in your web browser.');
	console.log('    $ `asciidoctor-serve -r asciidoctor-bibliography document.adoc`');
	console.log('        Render the document in your web browser with bibliography support.');
	console.log('    $ `asciidoctor-serve -pdf document.adoc`');
	console.log('        Render the document `document.adoc` as a PDF in the Evince viewer.');
	console.log('    $ `asciidoctor-serve -pdf --viewer=xreader document.adoc`');
	console.log('        Render the document `document.adoc` as a PDF in the XReader viewer.');
	console.log('    $ `asciidoctor-serve -pdf --viewer="xreader -f" document.adoc`');
	console.log('        Render the document `document.adoc` as a PDF in the XReader viewer in fullscreen mode.');
})

//Parse the arguments
program.parse(process.argv);

//Get the remaining arguments to pass to `asciidoctor` later
let args = program.args;

//A temporary file to hold the rendered PDF
const PDF_NAME = temp.path({suffix: '.pdf'});

//Build the serve command
let PDF_SERVE_COMMAND = `${program.viewer} "${PDF_NAME}"`;

//Check whether to render to PDF instead of HTML
const compileToPdf = !!program.Pdf;

//Whether the PDF viewer needs to be manually refreshed
const viewerNeedsRefresh = !!program.refresh;

//Check that at least one command line argument was provided
if (args.length === 0) {
	console.error("ERROR:\tNo asciidoctor arguments provided");
	program.outputHelp();
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

		//Return additional resources
		app.get('*', (req, res) => {
			//Get the absolute path to the file
			let p = path.resolve(path.join('.', req.path));
			//Show the absolute path
			console.log(`Resource requested: "${p}"`);
			//Return the file, if it exists
			res.sendFile(p);
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
	console.log(`Serving as PDF with command:\n\t${PDF_SERVE_COMMAND}`);

	//Update the viewer when the directory changes
	onWatchTrigger = () => getRenderedData((err, data) => {
		//Only run the command again if the PDF viewer needs manual refreshing
		if (viewerNeedsRefresh) exec(PDF_SERVE_COMMAND);
		//Display outputs and errors
		if (data) console.log(data);
		if (err) console.error(err);
	});

	//Run when the server starts
	getRenderedData((err, data) => {
		//Open the PDF viewer
		exec(PDF_SERVE_COMMAND);
		//Display outputs and errors
		if (data) console.log(data);
		if (err) console.error(err);
	})
}

//Directory to monitor for changes
let monitorDir = path.dirname(args[args.length - 1]);
console.log(`Watching for changes in "${monitorDir}"`);

//Watch the directory for changes
choikdar.watch(monitorDir).on('change', (event) => {
	console.log(`CHANGE DETECTED:\t${event}`);
	onWatchTrigger();
});
