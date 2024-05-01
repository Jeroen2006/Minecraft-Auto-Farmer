const net = require('net');
const TASK = require('./tasks/task.js');
require('dotenv').config();

var farmers = [];
var tasks = [];
var claimed = []
var masterFarmerUuid = null;

//create server on port process.env.CONTROLLER_PORT
const server = net.createServer((socket) => {
    //console.log(`Client connected: ${socket.remoteAddress}:${socket.remotePort}`);

    socket.on('data', (data) => {
        data = data.toString();
        var messages = data.split(';');
        messages.forEach(message => {
            try {
                message = JSON.parse(message);
            } catch (e) {
            }

            if (message.type == 'AUTH') return handleAuth(socket, message.data);
            if (message.type == 'MASTER_FARM_INFO') return handleFarmData(socket, message.data);
            if (message.type == 'GET_TASK') return handleTaskRequest(socket, message.data);
            if (message.type == 'COMPLETED_TASK') return handleCompletedTask(socket, message.data);

            if (message.type != undefined) console.log(`Received: ${message.type}`);
        });
    })
    socket.on('end', () => {
        //console.log('Client disconnected');

        //remove all assigned tasks and claimed blocks
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].assignedTo == socket) {
                tasks.splice(i, 1);
                i--;
            }
        }

        for (var i = 0; i < claimed.length; i++) {
            if (claimed[i].assignedTo == socket) {
                claimed.splice(i, 1);
                i--;
            }
        }

        for (var i = 0; i < farmers.length; i++) {
            if (farmers[i].socket == socket) {
                if (farmers[i].uuid == masterFarmerUuid) {
                    masterFarmerUuid = null;
                    setTimeout(electMaster, 100);
                }

                farmers.splice(i, 1);

                //console.log('Removed farmer');
                break;
            }
        }
    })
    socket.on('error', (err) => {
        // console.log('Client disconnected');

        //remove all assigned tasks and claimed blocks
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].assignedTo == socket) {
                tasks.splice(i, 1);
                i--;
            }
        }

        for (var i = 0; i < claimed.length; i++) {
            if (claimed[i].assignedTo == socket) {
                claimed.splice(i, 1);
                i--;
            }
        }

        for (var i = 0; i < farmers.length; i++) {
            if (farmers[i].socket == socket) {

                if (farmers[i].uuid == masterFarmerUuid) {
                    masterFarmerUuid = null;
                    setTimeout(electMaster, 100);
                }

                farmers.splice(i, 1);

                //console.log('Removed farmer');
                break;
            }
        }
    })
})

function handleCompletedTask(socket, data) {
    const id = data;

    for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].id == id) {
            tasks.splice(i, 1);
            break;
        }
    }

    for (var i = 0; i < claimed.length; i++) {
        if (claimed[i].id == id) {
            claimed.splice(i, 1);
            break;
        }
    }

}


function handleTaskRequest(socket, data) {
    const { farmableCrops, position, id } = data;

    var availableTasks = tasks.filter(task => !task.assigned);
    availableTasks.sort((a, b) => {
        const aDist = Math.sqrt(Math.pow(a.position.x - position.x, 2) + Math.pow(a.position.z - position.z, 2));
        const bDist = Math.sqrt(Math.pow(b.position.x - position.x, 2) + Math.pow(b.position.z - position.z, 2));

        return aDist - bDist;
    });
    availableTasks = availableTasks.filter(task => {
        if (task.type == 'HARVEST_CROP') {
            return farmableCrops.includes(task.crop);
        }
        return true;
    });

    if (availableTasks.length == 0) {
        sendData(socket, { type: 'TASK', data: { id, task: { type: 'IDLE' } } });
    } else {
        const task = availableTasks[0];
        task.assigned = true;
        task.assignedTo = socket;
        claimed.push({
            id: task.id,
            assignedTo: socket,
            x: task.position.x,
            z: task.position.z
        });

        sendData(socket, { type: 'TASK', data: { id, task } });
    }
}

function handleFarmData(socket, data) {
    const { farmland, crops } = data;

    farmland.forEach(farm => {
        const taskId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        const task = {
            id: taskId,
            type: 'PLACE_CROP',
            position: farm,
            assigned: false,
        }

        //check if there already is a task for this position
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].position.x == farm.x && tasks[i].position.z == farm.z) {
                tasks.splice(i, 1);
                break;
            }
        }

        tasks.push(task);
    });

    crops.forEach(crop => {
        const taskId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        const task = {
            id: taskId,
            type: 'HARVEST_CROP',
            position: {
                x: crop.x,
                y: crop.y,
                z: crop.z
            },
            crop: crop.type,
            assigned: false
        }

        //check if there already is a task for this position
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].position.x == crop.x && tasks[i].position.z == crop.z) {
                tasks.splice(i, 1);
                break;
            }
        }

        tasks.push(task);
    });

    for (var i = 0; i < claimed.length; i++) {
        for (var j = 0; j < tasks.length; j++) {
            if (tasks[j].position.x == claimed[i].x && tasks[j].position.z == claimed[i].z) {
                tasks.splice(j, 1);
            }
        }
    }
}

function handleAuth(socket, data) {
    const { username, uuid } = data;
    //console.log(`Authenticating ${username} with UUID ${uuid}`);

    //check if uuid and/or username is already authenticated;
    for (var i = 0; i < farmers.length; i++) {
        if (farmers[i].username == username) {
            sendData(socket, { type: 'AUTH_RESULT', data: { success: false, reason: 'Username already authenticated' } });
            return;
        } else if (farmers[i].uuid == uuid) {
            sendData(socket, { type: 'AUTH_RESULT', data: { success: false, reason: 'UUID already authenticated' } });
            return;
        }
    }

    farmers.push({ username, uuid, socket });
    sendData(socket, { type: 'AUTH_RESULT', data: { success: true } });

    electMaster();
}

function electMaster() {
    if (farmers.length == 0) return;
    if (masterFarmerUuid != null) return;

    var masterIndex = Math.floor(Math.random() * farmers.length);
    masterFarmerUuid = farmers[masterIndex].uuid;

    //console.log(`Elected master: ${farmers[masterIndex].username}`);

    for (var i = 0; i < farmers.length; i++) {
        sendData(farmers[i].socket, { type: 'CHOSEN_MASTER', data: { master: masterFarmerUuid, isMaster: farmers[i].uuid == masterFarmerUuid } });
    }
}

setInterval(() => {
    for (var i = 0; i < farmers.length; i++) {
        sendData(farmers[i].socket, { type: 'CHOSEN_MASTER', data: { master: masterFarmerUuid, isMaster: farmers[i].uuid == masterFarmerUuid } });
    }

    console.clear();

    console.log(`Connected Farmers: ${farmers.length}`);
    if (masterFarmerUuid != null) {
        var masterIndex = farmers.findIndex(farmer => farmer.uuid == masterFarmerUuid);
        console.log(`Master: ${farmers[masterIndex].username}`);
    } else {
        console.log('Master: None');
    }

    console.log(`Tasks: ${tasks.length}`);
    console.log(`Claimed: ${claimed.length}`);
}, 1000);

function sendData(socket, data) {
    socket.write(`${JSON.stringify(data)};`);
}

server.listen(parseInt(process.env.CONTROLLER_PORT), process.env.CONTROLLER_IP, () => {
    console.log(`Server listening on ${process.env.CONTROLLER_IP}:${process.env.CONTROLLER_PORT}`);
})