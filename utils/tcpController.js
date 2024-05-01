const net = require('net');

/**
 * Represents a TCP controller for handling network connections.
 */
class TcpController {
    #bot = null
    #pendingRequests = []

    /**
     * Creates an instance of TcpController.
     * @param {string} hostname - The hostname or IP address to connect to.
     * @param {number} port - The port number to connect to.
     * @param {boolean} [reconnect=false] - Indicates whether to automatically reconnect on connection close.
     * @param {boolean} [connect=true] - Indicates whether to connect immediately upon instantiation.
     * @param {Function} [onData=null] - The callback function to handle incoming data.
     */
    constructor({ hostname, port, reconnect = true, connect = true, onData = null }){
        this._hostname = hostname;
        this._port = port;
        this._reconnect =  reconnect;
        this._socket = new net.Socket();
        this.registeredCallbacks = [];

        this.isAuthenticated = false;

        this._socket.on('data', (data) => this._onData(data, this.registeredCallbacks));
        this._socket.on('close', this._onClose);
        this._socket.on('error', this._onError);

        if(connect) this.connect();
    }

    completedTask(task){
        this.send(JSON.stringify({ type: 'COMPLETED_TASK', data: task }) + ';');
    }

    sendMasterData(data){
        this.send(JSON.stringify({ type: 'MASTER_FARM_INFO', data: data }) + ';');
    }

    getTask(options){
        return new Promise(res=>{
            const taskId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            const task = {
                id: taskId,
                ...options
            }
    
            this.#pendingRequests.push({
                type: 'GET_TASK',
                task,
                resolve: res
            });
            
            this.send(JSON.stringify({ type: 'GET_TASK', data: task }) + ';');
        })
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
     * Registers a callback function for the specified event.
     *
     * @param {string} event - The name of the event to listen for.
     * @param {Function} callback - The callback function to be executed when the event is triggered.
     */
    on(event, callback){
        this._socket.on(event, callback);
        this.registeredCallbacks.push({ event, callback });
    }

    /**
     * Authenticates the bot by sending an authentication message to the server.
     * @param {Object} bot - The bot object.
     */
    authenticate(bot){
        this.isAuthenticated = false;
        this.#bot = bot;

        const authenticationMessage = {
            type: 'AUTH',
            data: {
                username: bot._client.username,
                uuid: bot._client.uuid,
            }
        }
        this.send(`${JSON.stringify(authenticationMessage)};`);
    }

    /**
     * Handles the 'close' event of the TCP socket.
     * Automatically reconnects if the reconnect flag is set.
     */
    _onClose(){
        console.log('Connection closed');
        if(this._reconnect) {
            setTimeout(() => {
                this.connect();
            }, 1000);
        }
    }

    /**
     * Handles incoming data from the TCP connection.
     *
     * @param {Buffer} data - The incoming data.
     * @param {Array} registeredCallbacks - An array of registered callbacks.
     * @throws {Error} If authentication fails.
     */
    _onData(data, registeredCallbacks){
        data = data.toString();
        var messages = data.split(';');

        messages.forEach(message => {
            try{
                message = JSON.parse(message);
            } catch(e){
            }

            if(message.type == 'AUTH_RESULT') {
                if(message.data.success){
                    this.isAuthenticated = true;
                } else {
                    throw new Error(`Authentication failed: ${message.data.reason}`);
                    //this.#bot.destroy();
                }

                registeredCallbacks.forEach(({ event, callback }) => {
                    if(event == 'authenticated'){
                        callback(this.isAuthenticated);
                    }
                });
            }

            if(message.type == 'CHOSEN_MASTER'){
                registeredCallbacks.forEach(({ event, callback }) => {
                    if(event == 'chosen_master'){
                        callback(message.data);
                    }
                });
            }

            if(message.type == 'TASK'){
                const task = message.data;
                const pendingRequest = this.#pendingRequests.find(req => req.task.id == task.id);

                if(pendingRequest){
                    pendingRequest.resolve(task);
                    this.#pendingRequests = this.#pendingRequests.filter(req => req.task.id != task.id);
                }
            }
        });
    }

    /**
     * Handles the event when the client is connected to the server.
     */
    _onConnect(){
        console.log('Connected to server');
    }

    /**
     * Handles the 'error' event of the TCP socket.
     * @param {Error} err - The error object.
     */
    _onError(err){
        console.log('Connection closed');
        if(this._reconnect) {
            setTimeout(() => {
                this.connect();
            }, 1000);
        } else {
            throw new Error("Connection error: " + err.message);
        }

        
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