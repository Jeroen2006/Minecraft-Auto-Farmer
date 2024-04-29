const net = require('net');
/**
 * Represents a TCP controller for handling network connections.
 */
class TcpController {
    /**
     * Creates an instance of TcpController.
     * @param {string} hostname - The hostname or IP address to connect to.
     * @param {number} port - The port number to connect to.
     * @param {boolean} [reconnect=false] - Indicates whether to automatically reconnect on connection close.
     * @param {boolean} [connect=true] - Indicates whether to connect immediately upon instantiation.
     * @param {Function} [onData=null] - The callback function to handle incoming data.
     */
    constructor({ hostname, port, reconnect = false, connect = true, onData = null }){
        this._hostname = hostname;
        this._port = port;
        this._reconnect = reconnect;
        this._onData = onData || (() => {});
        this._socket = new net.Socket();

        this._socket.on('data', this._onData);
        this._socket.on('close', this._onClose);
        this._socket.on('error', this._onError);

        if(connect) this.connect();
    }

    /**
     * Sets the reconnect flag.
     * @param {boolean} reconnect - Indicates whether to automatically reconnect on connection close.
     * @returns {boolean} The new value of the reconnect flag.
     */
    reconnect(reconnect){
        if(typeof reconnect === 'boolean') this._reconnect = reconnect;
        return this._reconnect;
    }

    /**
     * Connects to the specified hostname and port.
     */
    connect(){
        this._socket.connect(this._port, this._hostname);
    }

    /**
     * Checks if the TCP controller is currently connected.
     * @returns {boolean} True if connected, false otherwise.
     */
    isConnected(){
        return this._socket.connecting && !this._socket.destroyed;
    }

    /**
     * Sends data over the TCP connection.
     * @param {string|Buffer} data - The data to send.
     */
    send(data){
        this._socket.write(data);
    }

    /**
     * Handles the 'close' event of the TCP socket.
     * Automatically reconnects if the reconnect flag is set.
     */
    _onClose(){
        console.log('Connection closed');
        if(this._reconnect) this.connect();
    }

    /**
     * Handles the 'error' event of the TCP socket.
     * @param {Error} err - The error object.
     */
    _onError(err){
        console.log(err);
    }

    /**
     * Destroys the TCP connection.
     */
    destroy(){
        this._reconnect = false;
        this._socket.end();
    }
}

module.exports = TcpController;