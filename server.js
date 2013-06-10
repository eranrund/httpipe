var http = require('http'),
    io_server = require('socket.io'),
    io_client = require('socket.io-client'),
    //fs = require('fs'),
    crypto = require('crypto'),
    express = require('express'),
    events = require('events');


// TODO
/*Object.prototype.getName = function() {
   var funcNameRegex = /function (.{1,})\(/;
   var results = (funcNameRegex).exec((this).constructor.toString());
   return (results && results.length > 1) ? results[1] : "";
};*/


///////////////////////////////////////////////////////////////////////////////
// Frontend app (serves web clients + socket.io)
///////////////////////////////////////////////////////////////////////////////

var frontend_app = express();
frontend_app.use(express.static(__dirname + '/static'));


///////////////////////////////////////////////////////////////////////////////
// socket.io server
///////////////////////////////////////////////////////////////////////////////

var SocketIoServer = (function() {
    // Constructor
    function SocketIoServer(http_server) {
        var self = this;
        events.EventEmitter.call(this);

        // Init
        this.server = http_server;

        // socket.io server
        this.io = io_server.listen(this.server, {
            resource: '/__httpipe_socket.io'
        });

        this.io.on('connection', function(socket) {
            socket.on('room:join', function(data) {
                self.on_room_join(socket, data);
            });

            socket.on('fwd_response', function(data) {
                self.emit('fwd_response', socket, data);
            });
        });

    }

    SocketIoServer.prototype.__proto__ = events.EventEmitter.prototype;

    // broadcast
    SocketIoServer.prototype.broadcast = function(event, data) {
        this.io.sockets.emit(event, data);
        return this;
    };

    // check if a room is empty or not
    SocketIoServer.prototype.is_room_empty = function(room_name) {
        return this.io.sockets.clients(room_name).length == 0;
    };

    // socket.io event: join room
    SocketIoServer.prototype.on_room_join = function(socket, data) {
        console.log('SocketIoServer: on_room_join: '+data);
        socket.join(data);
    };

    return SocketIoServer;
})();


///////////////////////////////////////////////////////////////////////////////
// Request Catcher Server
///////////////////////////////////////////////////////////////////////////////

var ReqCatcherServer = (function() {
    // Constructor
    function ReqCatcherServer() {
        var self = this;
        events.EventEmitter.call(this);

        this.app = http
            .createServer(function(req, resp) { self.on_raw_request(req, resp); })
            .on('clientError', this.on_client_error);
    }

    ReqCatcherServer.prototype.__proto__ = events.EventEmitter.prototype;

    // Incoming HTTP request handler that reads all incoming
    // data before moving on to on_request
    ReqCatcherServer.prototype.on_raw_request = function(req, resp) {
        var that = this;
        //console.log('ReqCatcherServer: on_raw_request: '+req.url);

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
    ReqCatcherServer.prototype.on_request = function(req, data, resp) {
        console.log('ReqCatcherServer: on_request: '+req.method+' '+req.url+ ' ('+data.length+' data bytes)');

        // "unique" request id
        var req_id = crypto.randomBytes(16).toString('hex');

        // See if we have any listeners - if not we'll discard this request
        if (!this.listeners('request').length) {
            resp.writeHead(200);
            resp.end('OK');
            return;
        }

        this.emit('request', {
            id: req_id,
            method: req.method,
            url: req.url,
            headers: req.headers,
            data: data,
        }, resp);
    };

    // TODO
    ReqCatcherServer.prototype.on_client_error = function() {
        console.log('on client error');
    };

    return ReqCatcherServer;
})();


///////////////////////////////////////////////////////////////////////////////
// httpi.pe logic
///////////////////////////////////////////////////////////////////////////////

// make everything play together
var httpipeBusinessLogic = (function(reqcatcher_server, socketio_server) {
    // request id -> {req: ..., resp: ...}
    var pending_fwd_requests = {};

    // catch incoming requests
    reqcatcher_server.on('request', function(req, resp) {
        // Broadcast request to all clients
        socketio_server.broadcast('request', req);

        // See if we have any forwarders in the fwd socketio room
        // If we do, we'll let one of them handle generating a response
        // (they were made aware of it through the broadcast above).
        // If we don't, we'll generate a response and finish with the request
        if (socketio_server.is_room_empty('fwd')) {
            console.log('httpi.pe: '+req.method+' '+req.url+ ' ('+req.data.length+' data bytes): no forwarders');
            resp.writeHead(200);
            resp.end('OK');
            return;
        }

        // Store state to enable forwarder response
        pending_fwd_requests[req.id] = {req: req, resp: resp};
    });

    // handle responses from forwarders
    socketio_server.on('fwd_response', function(socket, data) {
        var req_id = data.req_id;
        var req_info = pending_fwd_requests[req_id];
        if (!req_info) {
            console.log('httpi.pe: fwd_response: unknown id: '+req_id);
            return;
        }

        console.log('httpi.pe: fwd_response: '+req_info.req.url+': '+data.status_code);

        req_info.resp.writeHead(data.status_code, data.headers);
        req_info.resp.write(data.data);
        req_info.resp.end();

        delete pending_fwd_requests[req_id];
    });
});

///////////////////////////////////////////////////////////////////////////////
// Main app
///////////////////////////////////////////////////////////////////////////////

// Init main server
var app = express()
  , server = http.createServer(app);

// socketio
var socketio_server = new SocketIoServer(server);

// request catcher
var reqcatcher_server = new ReqCatcherServer();
app.use(express.vhost('*.httpi.pe', reqcatcher_server.app));

// frontend
app.use(express.vhost('*', frontend_app));

// httpi.pe app
httpipeBusinessLogic(reqcatcher_server, socketio_server);

// Listen
server.listen(8888);

