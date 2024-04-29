const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear, GoalXZ } } = require('mineflayer-pathfinder')
const TcpController = require('./tcpController.js');
const TASK = require('../tasks/task.js');
var Vec3 = require('vec3').Vec3;

const fullGrownAges = {
    'wheat': 7,
    'carrots': 7,
    'potatoes': 7,
    'beetroots': 3,
    'nether_wart': 3
}

/**
 * Represents a farmer in the Minecraft Auto Farmer application.
 * @class
 */
class Farmer {
    #password = null;
    #bot = null;
    #tcpController = null;

    /**
     * Represents a Farmer object.
     * @constructor
     * @param {Object} options - The options for creating a Farmer object.
     * @param {string} options.username - The username for authentication.
     * @param {string} options.password - The password for authentication.
     * @param {string} [options.auth='offline'] - The authentication type.
     * @param {string} options.server_ip - The IP address of the server.
     * @param {number} options.server_port - The port number of the server.
     * @param {string} options.controller_ip - The IP address of the controller.
     * @param {number} options.controller_port - The port number of the controller.
     * @param {boolean} [options.reconnect=false] - Indicates whether to reconnect.
     * @throws {Error} If any of the options are invalid.
     */
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
        this.#password = password;
        this.reconnect = reconnect;
        this.currentTask = TASK.IDLE;
        this.isMaster = false;

        this.#bot = this._createBotObject({
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
         

        this.#bot.on('end', this._onDisconnect);
    }

    /**
     * Get the position of the farmer.
     * @returns {Object} The position object containing x, y, and z coordinates.
     */
    get position(){
        return this.#bot.entity.position;
    }

    /**
     * Walks the bot to the specified X and Z coordinates.
     * @param {number} x - The X coordinate to walk to.
     * @param {number} z - The Z coordinate to walk to.
     * @returns {Promise<boolean>} A promise that resolves to `false` when the goal is reached.
     */
    walkToXZ(x, z){
        return new Promise(resolve => {
            const mcData = require('minecraft-data')(this.#bot.version)
            this._botMovements = new Movements(this.#bot, mcData)
            this._botMovements.canDig = false
            this._botMovements.canPlace = false
            this._botMovements.allow1by1towers = false
    
            this.#bot.pathfinder.setMovements(this._botMovements);
            
            this.#bot.pathfinder.setGoal(new GoalXZ(x, z))
            this.#bot.on('goal_reached', () => {
                resolve(false)
            })

        })
    }

    /**
     * Retrieves the type of crop at the specified coordinates.
     *
     * @param {number} x - The x-coordinate of the block.
     * @param {number} y - The y-coordinate of the block.
     * @param {number} z - The z-coordinate of the block.
     * @returns {string} The name of the crop block.
     */
    cropType(x, y, z){
        const block = this.#bot.blockAt(new Vec3(x, y, z));
        return block.name;
    }

    /**
     * Retrieves the crop data at the specified coordinates.
     *
     * @param {number} x - The x-coordinate of the block.
     * @param {number} y - The y-coordinate of the block.
     * @param {number} z - The z-coordinate of the block.
     * @returns {Block} The crop data at the specified coordinates.
     */
    _cropData(x, y, z){
        return this.#bot.blockAt(new Vec3(x, y, z));
    }


    /**
     * Finds grown crops within a specified distance from the bot's position.
     * @param {number} [maxDistance=32] - The maximum distance to search for grown crops.
     * @param {number} [count=1] - The number of grown crops to find.
     * @param {string|string[]} [cropType='wheat'] - The type(s) of crops to search for.
     * @returns {Crop[]} An array of Crop objects representing the found grown crops.
     */
    async findGrownCrops(maxDistance = 32, count = 1, cropType = 'wheat'){
        var cropTypes = cropType;
        if(typeof cropType === 'string') cropTypes = [cropType];

        cropTypes = cropTypes.map((cropType) => {
            return this.#bot.registry.blocksByName[cropType].id;
        });

        var result = this.#bot.findBlocks({
            useExtraInfo: (block) => {
                return block._properties.age >= fullGrownAges[block.name]
            },
            matching: cropTypes,
            maxDistance: maxDistance,
            count: count,
        });

        result = result.map((block) => {
            const cropData = this._cropData(block.x, block.y, block.z);
            return new Crop({
                x: block.x,
                y: block.y,
                z: block.z,
                type: cropData.name,
                age: cropData._properties.age
            });
        });

        return result;
    }

    /**
     * Finds empty farmland blocks within a specified distance from the bot's current position.
     * @param {number} [maxDistance=32] - The maximum distance to search for empty farmland blocks.
     * @param {number} [count=1] - The number of empty farmland blocks to find.
     * @returns {Array<Farmland>} An array of Farmland objects representing the found empty farmland blocks.
     */
    async findEmptyFarmland(maxDistance = 32, count = 1){
        const mcData = require('minecraft-data')(this.#bot.version)

        var result = this.#bot.findBlocks({
            useExtraInfo: (block) => {
                const blockAbove = this.#bot.blockAt(block.position.offset(0,1,0))
                return !blockAbove || blockAbove.type === mcData.blocksByName.air.id
            },
            matching: this.#bot.registry.blocksByName.farmland.id,
            maxDistance: maxDistance,
            count: count,
        });

        result = result.map((block) => {
            return new Farmland({
                x: block.x,
                y: block.y,
                z: block.z,
                botInstance: this.#bot
            });
        });

        return result;
    }

    /**
     * Destroys the farmer instance.
     */
    destroy(){
        this.reconnect = false;
        this.#bot.end();
        this.#tcpController.destroy();
    }

    /**
     * Sets the reconnect flag for the farmer.
     * @param {boolean} reconnect - The flag indicating whether to reconnect or not.
     * @returns {boolean} - The updated value of the reconnect flag.
     */
    reconnect(reconnect){
        if(isBoolean(reconnect)) this.reconnect = reconnect;
        return this.reconnect;
    }

    /**
     * Registers an event listener for the bot.
     *
     * @param {string} event - The name of the event to listen for.
     * @param {Function} callback - The callback function to be executed when the event is triggered.
     */
    on(event, callback){
        this.#bot.on(event, callback);
    }

    /**
     * Handles the disconnect event of the bot.
     * If the `reconnect` flag is set to true, it creates a new bot object and sets up the necessary event listeners.
     * @private
     */
    _onDisconnect(){
        if(this.reconnect){
            this.#bot = this._createBotObject({
                username: this.username,
                password: this._password,
                auth: this.auth,
                server_ip: this.server_ip,
                server_port: this._server_port
            });

            this.#bot.on('end', this._onDisconnect);
        }
    }

    /**
     * Creates a bot object for Minecraft auto farming.
     *
     * @param {Object} options - The options for creating the bot object.
     * @param {string} options.username - The username of the bot.
     * @param {string} options.password - The password of the bot.
     * @param {string} options.auth - The authentication token of the bot.
     * @param {string} options.server_ip - The IP address of the Minecraft server.
     * @param {number} options.server_port - The port number of the Minecraft server.
     * @returns {Object} - The created bot object.
     */
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

        bot.on('error', (err) => {
            console.log(err);
        });
        
        return bot;
    }
}

/**
 * Checks the authentication type.
 * @param {string} authType - The authentication type to check.
 * @returns {boolean} - Returns true if the authentication type is 'offline' or 'microsoft', otherwise returns false.
 */
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

/**
 * Represents a crop in the farm.
 * @class
 */
class Crop {
    /**
     * Creates a new Crop instance.
     * @constructor
     * @param {Object} options - The options for the crop.
     * @param {number} options.x - The x-coordinate of the crop.
     * @param {number} options.y - The y-coordinate of the crop.
     * @param {number} options.z - The z-coordinate of the crop.
     * @param {string} options.type - The type of the crop.
     * @param {number} options.age - The age of the crop.
     */
    constructor({
        x,
        y,
        z,
        type,
        age,
    }){
        this.x = x;
        this.y = y;
        this.z = z;
        this.type = type;
        this.age = age;
    }
}

/**
 * Represents a piece of farmland in Minecraft.
 * @class
 */
class Farmland {
    #bot = null;

    constructor({
        x,
        y,
        z,
        botInstance
    }){
        this.x = x;
        this.y = y;
        this.z = z;
        this.#bot = botInstance;
    }


    get plantedCrop(){
        const blockAbovePosition = new Vec3(this.x, this.y + 1, this.z);
        const blockAbove = this.#bot.blockAt(blockAbovePosition);

        if(blockAbove.name === 'air') return null;

        return new Crop({
            x: this.x,
            y: this.y + 1,
            z: this.z,
            type: blockAbove.name,
            age: blockAbove._properties.age
        });
    }
}

module.exports = Farmer;