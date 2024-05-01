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

const cropToSeed = {
    'wheat': 'wheat_seeds',
    'carrots': 'carrot',
    'potatoes': 'potato',
    'beetroots': 'beetroot_seeds',
    'nether_wart': 'nether_wart'
}

/**
 * Represents a farmer in the Minecraft Auto Farmer application.
 * @class
 */
class Farmer {
    #password = null;
    #bot = null;
    #tcpController = null;
    #currentTaskData = null;

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
        this.masterUuid = null;

        this.#bot = this._createBotObject({
            username,
            password,
            auth,
            server_ip,
            server_port
        });

        this.#tcpController = new TcpController({
            ip: this.controller_ip,
            port: this.controller_port,
            reconnect: false,
            connect: true,
        });
        

        this.#tcpController.on('connect', () => this.#tcpController.authenticate(this.#bot));
        this.#tcpController.on('authenticated', (status) => {
            if(status == true) console.log('Authenticated with controller');
        });
        this.#tcpController.on('chosen_master', (masterInfo) => {
            this.isMaster = masterInfo.isMaster;
            this.masterUuid = masterInfo.master;
        });

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
     * Checks if the bot is joined to the server.
     *
     * @returns {boolean} Returns true if the bot is joined, false otherwise.
     */
    get isJoined(){
        return this.#bot.entity != null;
    }

    cropToSeed(crop){
        return cropToSeed[crop];
    }

    breakBlockAt(x, y, z){
        const block = this.#bot.blockAt(new Vec3(x, y, z));
        this.#bot.dig(block, true, (err) => {
            if(err) console.log(err);
        })
    }

    placeBlockAt(x, y, z){
        const block = this.#bot.blockAt(new Vec3(x, y - 1, z));
        this.#bot.placeBlock(block, new Vec3(0, 1, 0), (err) => {
            if(err) console.log(err);
        })
    }

    hasFullInventory(){
        return this.#bot.inventory.slots.filter((slot) => slot).length >= 30
    }

    look(pitch, yaw){
        this.#bot.look(pitch, yaw);
    }

    async dropItems(){
        //drop all items except 1 stack of wheat_seeds, carrot, potato, beetroot_seeds, nether_wart.
        //Its possible to have more than 1 stack of one of those items, in that case drop all but 1 stack.
        const items = this.#bot.inventory.items();

        const itemsToDrop = items;
        const itemsToKeep = ['wheat_seeds', 'carrot', 'potato', 'beetroot_seeds', 'nether_wart'];

        //keep 1 stack of each item
        for(const item of items){
            if(itemsToKeep.includes(item.name)){
                const index = itemsToDrop.indexOf(item);
                itemsToDrop.splice(index, 1);
            }
        }

        for(const item of itemsToDrop){
            await this.#bot.tossStack(item, (err) => {
                if(err) console.log(err);
            });
        }

        return itemsToDrop.length;
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

    randomXZ(){
        const x1 = process.env.FARM_B1_POSITION.split(',')[0]
        const x2 = process.env.FARM_B2_POSITION.split(',')[0]
        const z1 = process.env.FARM_B1_POSITION.split(',')[2]
        const z2 = process.env.FARM_B2_POSITION.split(',')[2]

        const x = Math.floor(Math.random() * (Math.abs(x1 - x2) + 1)) + Math.min(x1, x2)
        const z = Math.floor(Math.random() * (Math.abs(z1 - z2) + 1)) + Math.min(z1, z2)

        return { x, z }
    }

    sendMasterData(farmland, crops){
        this.#tcpController.sendMasterData({ farmland, crops });
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

    async getTask(){
        if(this.currentTask != TASK.IDLE) return { type: TASK.toTask(this.currentTask), data: this.#currentTaskData }
        if(this.isMaster) return { type: TASK.toTask(TASK.LEADER), data: null }
        
        const farmableCrops = this.farmableCrops();
        const position = this.position;

        const controllerAssignedTask = await this.#tcpController.getTask({ farmableCrops, position });
        return { type: controllerAssignedTask.task.type, data: {
            id: controllerAssignedTask?.task?.id,
            position: controllerAssignedTask?.task?.position,
            crop: controllerAssignedTask?.task?.crop
        }}

        return { type: TASK.toTask(TASK.IDLE), data: null }
    }

    completedTask(id){
        this.#tcpController.completedTask(id);
    }

    /**
     * Sleeps for a specified amount of time.
     * @param {number} ms - The number of milliseconds to sleep.
     * @returns {Promise<void>} - A promise that resolves after the specified time.
     */
    async sleep(ms){
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        })
    }

    /**
     * Equips the specified item in the bot's hand.
     * @param {string} itemName - The name of the item to equip.
     * @returns {boolean} - Returns true if the item was successfully equipped, false otherwise.
     */
    async equipItem(itemName){
        const item = this.#bot.inventory.items().find(item => item.name === itemName)
        if(item){
            this.#bot.equip(item, 'hand')
            return true;
        }

        return false;
    }

    /**
     * Checks if the bot has a specific item in its inventory.
     * @param {string} itemName - The name of the item to check for.
     * @returns {boolean} - Returns true if the bot has the item, false otherwise.
     */
    hasItem(itemName){
        return this.#bot.inventory.items().find(item => item.name === itemName) !== undefined;
    }

    /**
     * Retrieves a list of farmable crops based on the items available.
     * @returns {string[]} An array of farmable crop names.
     */
    farmableCrops(){
        var crops = [];
        if(this.hasItem('wheat_seeds')) crops.push('wheat');
        if(this.hasItem('carrot')) crops.push('carrots');
        if(this.hasItem('potato')) crops.push('potatoes');
        if(this.hasItem('beetroot_seeds')) crops.push('beetroots');
        if(this.hasItem('nether_wart')) crops.push('nether_wart');
        return crops;
    }

    /**
     * Finds grown crops within a specified distance from the bot's position.
     * @param {number} [maxDistance=32] - The maximum distance to search for grown crops.
     * @param {number} [count=1] - The number of grown crops to find.
     * @param {string|string[]} [cropType='wheat'] - The type(s) of crops to search for.
     * @returns {Crop[]} An array of Crop objects representing the found grown crops.
     */
    async findGrownCrops(maxDistance = 32, count = 1, cropType = ['wheat', 'carrots', 'potatoes', 'beetroots']){
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