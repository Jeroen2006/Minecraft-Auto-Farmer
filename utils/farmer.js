const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear, GoalXZ } } = require('mineflayer-pathfinder')
const TcpController = require('./tcpController.js');
const TASK = require('../tasks/task.js');

class Farmer {
    constructor({
        username,
        password,
        auth = 'offline',
        server_ip,
        server_port,
        controller_ip,
        controller_port,
        reconnect = false,
    }) {
        if(!checkAuthType(auth)) throw new Error('Invalid auth type');
        if(!isNumber(server_port)) throw new Error('Invalid server port');
        if(!isNumber(controller_port)) throw new Error('Invalid controller port');
        if(!isHostnameOrIp(server_ip)) throw new Error('Invalid server ip');
        if(!isHostnameOrIp(controller_ip)) throw new Error('Invalid controller ip');
        if(!isBoolean(reconnect)) throw new Error('Invalid reconnect value');

        this.controller_ip = controller_ip;
        this.controller_port = controller_port;
        this.server_ip = server_ip;
        this._server_port = server_port;
        this.auth = auth;
        this.username = username;
        this._password = password;
        this.reconnect = reconnect;
        this.currentTask = TASK.IDLE;

        this._bot = this._createBotObject({
            username,
            password,
            auth,
            server_ip,
            server_port
        });

        // this._tcpController = new TcpController({
        //     ip: this.controller_ip,
        //     port: this.controller_port,
        //     reconnect: true,
        //     connect: true,
        // });
         

        this._bot.on('end', this._onDisconnect);
    }

    get position(){
        return this._bot.entity.position;
    }

    get bot(){
        return this._bot;
    }

    walkToXZ(x, z){
        return new Promise(resolve => {
            const mcData = require('minecraft-data')(this._bot.version)
            this._botMovements = new Movements(this._bot, mcData)
            this._botMovements.canDig = false
            this._botMovements.canPlace = false
            this._botMovements.allow1by1towers = false
    
            this._bot.pathfinder.setMovements(this._botMovements);
            
            this._bot.pathfinder.setGoal(new GoalXZ(x, z))
            this._bot.on('goal_reached', () => {
                resolve(false)
            })

        })
    }

    destroy(){
        this.reconnect = false;
        this._bot.end();
        this._tcpController.destroy();
    }

    reconnect(reconnect){
        if(isBoolean(reconnect)) this.reconnect = reconnect;
        return this.reconnect;
    }

    on(event, callback){
        this._bot.on(event, callback);
    }

    _onDisconnect(){
        if(this.reconnect){
            this._bot = this._createBotObject({
                username: this.username,
                password: this._password,
                auth: this.auth,
                server_ip: this.server_ip,
                server_port: this._server_port
            });

            this._bot.on('end', this._onDisconnect);
        }
    }

    _createBotObject({
        username,
        password,
        auth,
        server_ip,
        server_port
    }){
        const bot = mineflayer.createBot({
            host: server_ip,
            username: username,
            auth: auth,
            password: password,
            port: server_port,
            keepAlive: true,
        });

        bot.loadPlugin(pathfinder)

        //on error log it
        bot.on('error', (err) => {
            console.log(err);
        });
        
        return bot;
    }
}

function checkAuthType(authType){
    if(authType === 'offline' || authType === 'microsoft'){
        return true;
    }
    return false;
}

function isBoolean(value){
    return typeof value === 'boolean';
}

function isNumber(value){
    return typeof value === 'number';
}

function isHostnameOrIp(value){
    return typeof value === 'string';
}

module.exports = Farmer;