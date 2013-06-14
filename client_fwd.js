///////////////////////////////////////////////////////////////////////////////
// httpi.pe - forwarding client
//
// forwards requests of specified session id to a given server
//
// Copyright (c) 2013
//    Eran Rundstein (eranrund@gmail.com)
//
///////////////////////////////////////////////////////////////////////////////

var io_client = require('socket.io-client'),
    http = require('http'),
    util = require('util');


// Command line parsing
var argv = require('optimist')
    .usage('Usage: $0 [--httpipe-server <httpi.pe server>] <session id> <destination server[:port]>')
    .demand(2)
    .describe('httpipe-server', 'httpi.pe server to work with')
    .default('httpipe-server', 'httpi.pe')
    .argv;

var httpipe_sid = argv._[0],
    fwd_dst     = argv._[1],
    httpipe_server = argv['httpipe-server'];

// Split fwd_dst into host:port
var elems = fwd_dst.split(':');
var fwd_dst_host = elems[0], fwd_dst_port = 80;
if (elems.length == 2) {
    fwd_dst_port = elems[1];
} else if (elems.length != 1) {
    throw util.format('Invalid destination server "%s"', fwd_dst);
}

if (!fwd_dst_host.length) {
    fwd_dst_host = '127.0.0.1';
}

fwd_dst = fwd_dst_host+':'+fwd_dst_port;

// Log
console.log(util.format('Forwarding session %s to %s (using %s)', httpipe_sid, fwd_dst, httpipe_server));

// Init socket.io
var socket = io_client.connect(httpipe_server, {
    resource: '__httpipe_socket.io'
});

socket.on('connect', function() {
    console.log('Connected to httpi.pe server!');
    socket.emit('room:join', httpipe_sid);
    socket.emit('room:join', httpipe_sid+':fwd');
});

socket.on('disconnect', function() {
    console.log('Disconnected from httpi.pe server :-(');
});

socket.on('error', function(err) {
    console.error('httpi.pe server error: '+err);
});

// Handle incoming requests
// (req contains id, method, url, headers, data)
socket.on('request', function(req) {
    console.log(req.method+' '+req.url+': forwarding...');

    // Set proper host header
    req.headers['host'] = fwd_dst;

    // Create client to do this
    var client = http.request({
        host: fwd_dst_host,
        port: fwd_dst_port,
        path: req.url,
        method: req.method,
        headers: req.headers,
        agent: false
    }, function(resp) {
        // Request completed, got response

        // Read response data
        var data = '';
        resp.on('data', function(chunk) {
            data += chunk;
        });

        // Wait for response to finish
        resp.on('end', function() {
            // Done - let the server deliver the response
            socket.emit('fwd_response', {
                req_id: req.id,
                status_code: resp.statusCode,
                headers: resp.headers,
                data: data
            });

            console.log(req.method+' '+req.url+': done ['+resp.statusCode+']');
        });
    });

    // Handle errors
    client.on('error', function(err) {
        // Done - let the server deliver the response
        socket.emit('fwd_response', {
            req_id: req.id,
            status_code: 500,
            data: err.toString()
        });

        console.log(req.method+' '+req.url+': error ['+err+']');
    });

    // Write data if we have any
    if (req.data) {
        client.write(req.data);
    }

    // Fire request
    client.end();

});
