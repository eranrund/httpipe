var io_client = require('socket.io-client'),
    http = require('http');

// TODO
var socket = io_client.connect('http://127.0.0.1:8888', {
    resource: '__httpipe_socket.io'
});

socket.on('connect', function() {
    console.log('HttpipeFwdClient: connected!');
    socket.emit('room:join', 'fwd');
});

socket.on('disconnect', function() {
    console.log('HttpipeFwdClient: disconnected :-(');
});

socket.on('error', function(err) {
    console.error('HttpipeFwdClient: Error: '+err);
});

// req: id, method, url, headers, data
socket.on('request', function(req) {
    console.log(req.method+' '+req.url+': forwarding...');

    // TODO
    req.headers['host'] = 'httpbin.org';

    // Create client to do this
    var client = http.request({
        host: 'httpbin.org', // TODO
        //host: '127.0.0.1',
        port: 80,
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
