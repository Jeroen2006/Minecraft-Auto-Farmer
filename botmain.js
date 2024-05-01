const { Farmer } = require('./utils/utils.js');
require('dotenv').config()


const player = new Farmer({
    username: process.env.BOT_USERNAME,
    password: process.env.PASSOWRD,
    auth: process.env.AUTHENTICATION,
    server_ip: process.env.SERVER_IP,
    server_port: parseInt(process.env.SERVER_PORT),
    controller_ip: process.env.CONTROLLER_IP,
    controller_port: parseInt(process.env.CONTROLLER_PORT),
    reconnect: true,
});

player.on('spawn', async ()=>{
    console.log('Bot spawned');

    const { HOME_POSITION } = process.env;
    const [x, y, z] = HOME_POSITION.split(',').map(Number);

    // await player.walkToXZ(x, z)
    // console.log('Bot reached home');

    while(player.isJoined){
        var task = null;
        if(player.hasFullInventory()) task = {type: 'EMPTY_INVENTORY'};

        if(task == null) task = await player.getTask();

        console.log(`[TASK] ${task.type} (${task?.data?.id || 'NOID'}) ${task?.data?.position != undefined ? `@ ${task.data.position.x}, ${task.data.position.z}` : ''}`)
        switch(task.type){
            case 'IDLE':
                await player.sleep(1000);
                break;
            case 'LEADER':
                const randomXZ = player.randomXZ();
                await player.walkToXZ(randomXZ.x, randomXZ.z);
                const emptyFarmlandPromise = player.findEmptyFarmland(32, 250);
                const grownCropsPromise = player.findGrownCrops(32, 250);
                const [emptyFarmland, grownCrops] = await Promise.all([emptyFarmlandPromise, grownCropsPromise]);
                player.sendMasterData(emptyFarmland, grownCrops)
                console.log(`Empty Farmland: ${emptyFarmland.length}, Grown Crops: ${grownCrops.length}`)
                break;
            case 'PLACE_CROP':
                // await player.walkToXZ(task.data.position.x, task.data.position.z);


                player.completedTask(task.data.id);
                player.sleep(1000);
            case 'HARVEST_CROP':
                const seedType = player.cropToSeed(task.data.crop);
                await player.walkToXZ(task.data.position.x, task.data.position.z);
                await player.sleep(250);
                await player.breakBlockAt(task.data.position.x, task.data.position.y, task.data.position.z);
                await player.equipItem(seedType);
                await player.placeBlockAt(task.data.position.x, task.data.position.y, task.data.position.z);
                await player.sleep(250);

                player.completedTask(task.data.id);
                break;
            case 'EMPTY_INVENTORY':
                await player.walkToXZ(-4, -166);
                player.look(1.047198, 0);
                await player.sleep(1000);
                await player.dropItems();
                break;
        }
    }

    // setTimeout(() => {
    //     // .then((farmland)=>{
    //     //     console.log(farmland);
    //     // })

    //     const farmableCrops = player.farmableCrops();
    //     // player.findGrownCrops(32, 100, farmableCrops).then((crops)=>{
    //     //     console.log(crops);
    //     // })
    // }, 1000);
})
