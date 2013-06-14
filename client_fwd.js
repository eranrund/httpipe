///////////////////////////////////////////////////////////////////////////////
// httpi.pe - forwarding client
//
// forwards requests of specified session id to a given server
///////////////////////////////////////////////////////////////////////////////

var io_client = require('socket.io-client'),
    http = require('http');


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

console.log('Forwarding session '+httpipe_sid+' to '+fwd_dst+' (using '+httpipe_server+')');

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

    // TODO
    req.headers['host'] = fwd_dst;

    // Create client to do this
    var client = http.request({
        host: fwd_dst, // TODO
        port: 80, // TODO
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
            // TODO headers: resp.headers, ??
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
