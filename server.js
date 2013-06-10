var http = require('http'),
    io_server = require('socket.io'),
    io_client = require('socket.io-client'),
    //fs = require('fs'),
    crypto = require('crypto');

// TODO
/*Object.prototype.getName = function() { 
   var funcNameRegex = /function (.{1,})\(/;
   var results = (funcNameRegex).exec((this).constructor.toString());
   return (results && results.length > 1) ? results[1] : "";
};*/

var XXXServer = (function () {
    function XXXServer(port) { 
        var self = this;

        // TODO
        var options = {
            socketio_resource: '/__XXX_socket.io'
        };

        this.pending_fwd_requests = {};

        // HTTP Server
        this.server = http        
            .createServer(function(req, resp) { self.on_raw_request(req, resp); })
            .on('clientError', this.on_client_error);           

        // sockets.io server
        this.io = io_server.listen(this.server, {
            resource: options.socketio_resource
        }).on('connection', function(socket) {
            socket.on('room:join', function(data) { 
                self.on_socket_room_join(socket, data);
            });

            socket.on('fwd_response', function(data) {
                self.on_socket_fwd_response(socket, data);
            });
        });

        // Everything is ready
        this.server.listen(port);
    }

    // Incoming HTTP request handler that reads all incoming
    // data before moving on to on_request
    XXXServer.prototype.on_raw_request = function(req, resp) {
        var that = this;
        //console.log('XXXServer: on_raw_request: '+req.url);

        // Read incoming data
        var data = '';
        req.on('data', function(chunk) {
            data += chunk;
        });

        // Wait for request to end
        req.on('end', function() {
            that.on_request(req, data, resp);
        });
    };

    // Complete incoming HTTP request
    XXXServer.prototype.on_request = function(req, data, resp) {
        // "unique" request id
        var req_id = crypto.randomBytes(16).toString('hex');

        // Publish the request to whoever is listening
        this.io.sockets.emit('request', {
            id: req_id,
            method: req.method,
            url: req.url,
            headers: req.headers,
            data: data,
        });

        // Check if we have any customers in the forwarding room.
        // If we do, we'll let one of them handle generating a response.
        // If we don't, we'll OK this request and end it
        if (!this.io.sockets.clients('fwd').length) {
            console.log('XXXServer: on_request: '+req.method+' '+req.url+ ' ('+data.length+' data bytes): no forwarders');
            resp.writeHead(200);
            resp.end('OK');
            return;
        }

        // Store state to enable forwarder response
        this.pending_fwd_requests[req_id] = {
            req: req,
            resp: resp
        };

        console.log('XXXServer: on_request: '+req.method+' '+req.url+ ' ('+data.length+' data bytes): waiting for fwd');

        // 

        // TODO
//        var room_name = 'test';

        // // See if we have any listeners in the forwarding room
        // var fwds = this.io.sockets.clients('fwd');
        // if (fwds.length) {

        // }

        // Forward
        
        //this.broadcast_request(req, data);
    };

    // TODO
    XXXServer.prototype.on_client_error = function() {
        console.log('on client error');
    };

    ///////////////////////////////////////////////////////////////////////////
    // socket.io events
    ///////////////////////////////////////////////////////////////////////////

    XXXServer.prototype.on_socket_room_join = function(socket, data) {
        console.log('XXXServer: on_socket_room_join: '+data);
        socket.join(data);
    };

    // data: req_id, status_code, headers, data
    XXXServer.prototype.on_socket_fwd_response = function(socket, data) {
        var req_id = data.req_id;
        var req_info = this.pending_fwd_requests[req_id];
        if (!req_info) {
            console.log('XXXServer: on_socket_fwd_response: unknown id: '+req_id);
            return;
        }

        console.log('XXXServer: on_socket_fwd_response: '+req_info.req.url+': '+data.status_code);

        req_info.resp.writeHead(data.status_code, data.headers);
        req_info.resp.write(data.data);
        req_info.resp.end();
        delete this.pending_fwd_requests[req_id];
    };

    return XXXServer;
})();






var xxxServer = new XXXServer(8888);