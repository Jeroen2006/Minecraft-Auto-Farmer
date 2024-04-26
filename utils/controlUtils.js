var net = require('net');

var controlSockets = {};
var sendMessages = [];
var isMaster = false;

function createControlSocket(bot, {host, port}){
    return new Promise((resolve, reject) => {
        if(controlSockets[bot.username]) resolve(controlSockets[bot.username]);
        controlSockets[bot.username] = new net.Socket();

        controlSockets[bot.username].connect(port, host, async () => {
            await sendControlMessage('REGISTER', {username: bot.username});

            resolve(controlSockets[bot.username]);
        })

        controlSockets[bot.username].on('error', (err) => {
            controlSockets[bot.username] = null;

            setTimeout(() => {
                createControlSocket(bot, {host, port})
            }, 5000)

            //exit process
            //process.exit(1)
        })

        controlSockets[bot.username].on('close', () => {
            controlSockets[bot.username] = null;

            setTimeout(() => {
                createControlSocket(bot, {host, port})
            }, 5000)
            //exit process
            //process.exit(1)
        })

        controlSockets[bot.username].on('data', (data)=>{
            var messages = data.toString().split(';');
            
            //remove empty elements
            messages = messages.filter(message => message.length > 0)

            for(var i = 0; i < messages.length; i++){
                controlSocketDataReceivedHandler(messages[i])
            }
        })
    })
}

function sendControlMessage(messageType, data){
    const ackPromise = new Promise((resolve, reject) => {
        if(!controlSockets[data.username]) {
            console.log('Control socket not created yet')
            resolve(false);
            return;
        }
        const messageId = generateUniqueId();

        var responseTimeout = setTimeout(async () => {
            if(sendMessages[messageId]){
                //sendMessages[messageId].reject('Response timeout')
                //console.log(sendMessages[messageId])

                try{
                   const result = await sendControlMessage(sendMessages[messageId].messageType, sendMessages[messageId].data);
                   resolve(result)
                } catch(err){
                    console.log(err)
                }

                delete sendMessages[messageId]
            }
        }, 500)
    
        controlSockets[data.username].write(JSON.stringify({type: messageType, id: messageId, data}))

        sendMessages[messageId] = {messageType, data, sentTime: new Date().getTime(), ack: false, resolve, reject, responseTimeout}
    })

    return ackPromise;
}

function generateUniqueId(){
    var msgId;
    while(!msgId){
        var tmpMsgId = Math.floor(Math.random() * 10000000000)
        if(!sendMessages[tmpMsgId]) msgId = tmpMsgId
    }

    return msgId;
}

function controlSocketDataReceivedHandler(data){
    //console.log('Received: ' + data.toString());

    var message = JSON.parse(data.toString());
    if(message.type == 'ACK'){
        if(sendMessages[message.data.messageId]){
            clearTimeout(sendMessages[message.data.messageId].responseTimeout)
            sendMessages[message.data.messageId].ack = true;
            sendMessages[message.data.messageId].resolve(message.data)
            delete sendMessages[message.data.messageId]
        }
    }

    if(message.type == "MASTER"){
        const isMaster2 = message.data.isMaster;
        const masterName = message.data.username;

        if(isMaster == false && isMaster2 == true){
            isMaster = true;
        } else if(isMaster == true && isMaster2 == false){
            isMaster = false;
        }
    }
}

function isMasterFunc(){
    return isMaster;
}

module.exports = {
    createControlSocket,
    sendControlMessage,
    isMaster: isMasterFunc
}