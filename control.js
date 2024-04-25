var net = require('net');

var controlServerSockets = [];

var controlServer = net.createServer(function(socket) {
    
    controlServerSockets.push(socket);

    socket.on('close', function() {
        controlServerSockets.splice(controlServerSockets.indexOf(socket), 1);
    });

    socket.on('error', function(err) {
        //console.log(err)
        controlServerSockets.splice(controlServerSockets.indexOf(socket), 1);
    });

    socket.on('data', function(data) {
        try{
            var message = JSON.parse(data.toString());
            handleIncomingMessage(message, socket)
        } catch(e){
            //console.log(e)
        }

        
    });

	//socket.pipe(socket);
});

var claimedBlocks = []

function handleIncomingMessage(message, socket){
    switch(message.type){
        case 'REGISTER':
            console.log(`[${message.data.username}] Registered`)
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

controlServer.listen(25568, '0.0.0.0');
console.log(`Control server listening`)