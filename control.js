var net = require('net');

var controlServerSockets = [];
var connectedBots = [];
var claimedBlocks = []
var tasks = [];

var controlServer = net.createServer(function(socket) {
    
    controlServerSockets.push(socket);

    socket.on('close', function() {
        controlServerSockets.splice(controlServerSockets.indexOf(socket), 1);
    });

    socket.on('error', function(err) {
        controlServerSockets.splice(controlServerSockets.indexOf(socket), 1);


    });

    socket.on('data', function(data) {
        try{
            var message = JSON.parse(data.toString());
            handleIncomingMessage(message, socket)
        } catch(e){
        }

        
    });
});

setInterval(() => {
    //assign master is there is none
    if(connectedBots.filter(bot => bot.isMaster).length == 0 && connectedBots.length > 0){
        const randomBot = connectedBots[Math.floor(Math.random() * connectedBots.length)]
        randomBot.isMaster = true;
        console.log(`[${randomBot.username}] Assigned as master`);

        //send message to all bots
        connectedBots.forEach(bot => {
            sendMessage(bot.socket, 'MASTER', {isMaster: bot.isMaster, username: randomBot.username})
        })
    } else {
        //send message to all bots
        connectedBots.forEach(bot => {
            sendMessage(bot.socket, 'MASTER', {isMaster: bot.isMaster, username: connectedBots.find(bot => bot.isMaster).username})
        })
    }


}, 1000)

function handleIncomingMessage(message, socket){
    switch(message.type){
        case 'REGISTER':
            console.log(`[${message.data.username}] Registered`)

            connectedBots.push({
                username: message.data.username, 
                socket: socket, 
                busy:false, 
                isMaster: false,
                pos: { 
                    x: 0, 
                    y: 0, 
                    z: 0
                }
            })

            socket.on('close', function() {
                console.log(`[${message.data.username}] Disconnected`)

                //set assigned tasks to null
                tasks.forEach(task => {
                    if(task.assigned == message.data.username){
                        task.assigned = null;
                    }
                })

                connectedBots.splice(connectedBots.findIndex(bot => bot.username === message.data.username), 1);
            });

            sendMessageAck(socket, { messageId: message.id})
            break;
        case 'CLAIMBLOCK':
            break; //niet nodig ivm FINDBLOCK
            console.log(`[${message.data.username}] Claiming block ${message.data.x}, ${message.data.y}, ${message.data.z}`)

            claimedBlocks.push({x: message.data.x, y: message.data.y, z: message.data.z, claimTime: new Date().getTime(), username: message.data.username})

            sendMessageAck(socket, { messageId: message.id})
            break;
        case 'RELEASEBLOCK':
            console.log(`[${message.data.username}] Releasing block ${message.data.x}, ${message.data.y}, ${message.data.z }`)

            const indexToDelete = claimedBlocks.findIndex(block =>
                block.x === message.data.x && block.y === message.data.y && block.z === message.data.z
            );
            claimedBlocks.splice(indexToDelete, 1);

            //remove task if block is released
            tasks = tasks.filter(task => task.data.x != message.data.x || task.data.y != message.data.y || task.data.z != message.data.z)

            sendMessageAck(socket, { messageId: message.id})
            break;

        case 'FINDBLOCK':
            console.log(`[${message.data.username}] Finding block`)

            const unclaimedBlock = findUnclaimedBlock(message.data.blockList)
            if(unclaimedBlock){
                claimedBlocks.push({x: unclaimedBlock.x, y: unclaimedBlock.y, z:unclaimedBlock.z, claimTime: new Date().getTime(), username: message.data.username})
                console.log(`[${message.data.username}] Found and claimed block ${unclaimedBlock.x}, ${unclaimedBlock.y}, ${unclaimedBlock.z}`)
                sendMessageAck(socket, { messageId: message.id, data: {x: unclaimedBlock.x, y: unclaimedBlock.y, z: unclaimedBlock.z}})
            } else {
                console.log(`[${message.data.username}] No blocks found`)
                sendMessageAck(socket, { messageId: message.id, data: null})
            }
            break;
        case 'UPDATEPOS':
            console.log(`[${message.data.username}] Updating position to ${message.data.x}, ${message.data.y}, ${message.data.z}`)

            const bot = connectedBots.find(bot => bot.socket === socket)
            if(bot){
                bot.pos = {x: message.data.x, y: message.data.y, z: message.data.z}
            }

            sendMessageAck(socket, { messageId: message.id})
            break;
        case 'MASTERDATA':
            console.log(`[${message.data.username}] Received master data`)

            var tempTasks = [];
            message.data.grownWheat.forEach(block => { tempTasks.push({type: 'FARM_CROPS', data: block, assigned: null}) });
            message.data.emptyFarmlands.forEach(block => { tempTasks.push({type: 'SEED_CROPS', data: block, assigned: null }) });
            //tasks = tasks.filter(task => tempTasks.find(tempTask => tempTask.data.x == task.data.x && tempTask.data.y == task.data.y && tempTask.data.z == task.data.z))
            tempTasks.forEach(tempTask => {
                if(!tasks.find(task => task.data.x == tempTask.data.x && task.data.y == tempTask.data.y && task.data.z == tempTask.data.z)){
                    tasks.push(tempTask)
                }
            })

            sendMessageAck(socket, { messageId: message.id})
            break;
        case 'FINDTASK':
            console.log(`[${message.data.username}] Finding task`)

            var tasksList = tasks.filter(task => task.assigned == null)
            const botPosition = connectedBots.find(bot => bot.username == message.data.username).pos;

            //remove tasks on blocks that are claimed from tasksList
            tasksList = tasksList.filter(task => isUnclaimedBlock(task.data.x, task.data.y, task.data.z))

            const closestTask = tasksList.reduce((prev, curr) => {
                const prevDistance = Math.sqrt(Math.pow(prev.data.x - botPosition.x, 2) + Math.pow(prev.data.y - botPosition.y, 2) + Math.pow(prev.data.z - botPosition.z, 2))
                const currDistance = Math.sqrt(Math.pow(curr.data.x - botPosition.x, 2) + Math.pow(curr.data.y - botPosition.y, 2) + Math.pow(curr.data.z - botPosition.z, 2))

                return prevDistance < currDistance ? prev : curr
            }, {data: {x: 0, y: 0, z: 0}})

            if(closestTask.data.x != 0){
                closestTask.assigned = message.data.username;
                console.log(`[${message.data.username}] Found task ${closestTask.type} at ${closestTask.data.x}, ${closestTask.data.y}, ${closestTask.data.z}`)
                sendMessageAck(socket, { messageId: message.id, data: {type: closestTask.type, block: closestTask.data}})
            } else {
                console.log(`[${message.data.username}] No tasks found`)
                sendMessageAck(socket, { messageId: message.id, data: null})
            }
            break;
        default:
            console.log(`Received: ${message.type} (${message.id}) ${message.data}`)
        break;
    }
}

//remove all claimed blocks from blockList after 1 minute
setInterval(() => {
    claimedBlocks = claimedBlocks.filter(block => block.claimTime > new Date().getTime() - 60000)
}, 60000)

function isUnclaimedBlock(x, y, z){
    return !claimedBlocks.find(block => block.x == x && block.y == y && block.z == z)
}

function findUnclaimedBlock(blockList){
    return blockList.find(block => isUnclaimedBlock(block.x, block.y, block.z))
}

function sendMessageAck(socket, data){
    //random delay 1-400ms
    setTimeout(() => {
        //return if socket is closed
        if(socket.destroyed) return;

        socket.write(`${JSON.stringify({type: 'ACK', data})};`)
    }, Math.floor(Math.random() * 400) + 1)
}

function sendMessage(socket, messageType, data){
    //random delay 1-400ms
    setTimeout(() => {
        //return if socket is closed
        if(socket.destroyed) return;

        socket.write(`${JSON.stringify({type: messageType, data})};`)
    }, Math.floor(Math.random() * 400) + 1)
}

controlServer.listen(34534, '0.0.0.0');
console.log(`Control server listening`)