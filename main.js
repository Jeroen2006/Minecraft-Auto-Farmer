const { Vec3, createBotInstance, walkToLocation, walkToRandomNearLocation, dropUnneededItems, checkInventoryFull, lookForEmptyFarmland, findGrownWheat, checkGrownWheat, harvestAndReplaceWheat, tasks: TASK, } = require('./utils/botUtils')
const { delay } = require('./utils/utils')
const { createControlSocket, sendControlMessage } = require('./utils/controlUtils')

const config = {
  host: '192.168.20.221',
  port: 25532,
  interval: 1,
  hostTCP: '192.168.20.221',
  portTCP: 34534,
}

var claimedBlocks = []

var forceTask;
async function initBots(){

    //get id from env variable, default to 1
    const id = process.argv[2] || process.env['BOTID'] || 1
    // for(let i = 0; i < 10; i++){
    //   var id = i + 0;
      const bot = await createBotInstance({ config, username: `Tuinbouwah${id}`, id: id });
      await createControlSocket(bot, {host: config.hostTCP, port: config.portTCP})
      initBot(bot)

      bot.on("chat", (username, message) => {
        if(message.toLowerCase().includes("bakkie doen")){
          forceTask = TASK.BAKKIE_DOEN;
          //bot.chat("Loop ut?")
        }

        if(message.toLowerCase().includes("werrekuh")){
          forceTask = TASK.RETURN_HOME;
        }

        if(message == 'exit'){
          process.exit(1)
          res(false)
        }
      });

    //   await delay(5000)
    // }
}


async function initBot(bot){
  console.log(`Joined as ${bot.username} at ${bot.entity.position.x} ${bot.entity.position.y} ${bot.entity.position.z}`)

  var currentTask = TASK.RETURN_HOME;
  var runLoop = true;

  while(runLoop){
    var grownWheat = []
    var emptyFarmlands = []

    if(currentTask != TASK.RETURN_HOME && currentTask != TASK.DROP_ITEMS && currentTask != TASK.BAKKIE_DOEN){
        const botInventoryFull = checkInventoryFull(bot);
        if(botInventoryFull == true) {
          currentTask = TASK.DROP_ITEMS;

        } else {
          grownWheat = await findGrownWheat(bot);
          //remove all claimed blocks from grownWheat
          grownWheat = grownWheat.filter(block => !claimedBlocks.find(claimedBlock => claimedBlock.x == block.x && claimedBlock.y == block.y && claimedBlock.z == block.z))
  
          if(grownWheat.length > 0) {
            const targetBlock = await sendControlMessage('FINDBLOCK', {blockList: grownWheat, username: bot.username})

            grownWheat = [];
            if(targetBlock?.data?.x != null) grownWheat = [targetBlock.data];
          }
  
          if(grownWheat.length > 0) currentTask = TASK.FARM_CROPS;
        }
    

    }

    if(currentTask == TASK.IDLE && currentTask != TASK.DROP_ITEMS && currentTask != TASK.BAKKIE_DOEN){
        emptyFarmlands = lookForEmptyFarmland(bot, 128);
        const seeds = bot.inventory.findInventoryItem('wheat_seeds')

        //remove all claimed blocks from emptyFarmlands
        emptyFarmlands = emptyFarmlands.filter(block => !claimedBlocks.find(claimedBlock => claimedBlock.x == block.x && claimedBlock.y == block.y && claimedBlock.z == block.z))

        if(emptyFarmlands.length > 0) {
          const targetBlock = await sendControlMessage('FINDBLOCK', {blockList: emptyFarmlands, username: bot.username})

          emptyFarmlands = [];
          if(targetBlock?.data?.x != null) emptyFarmlands = [targetBlock.data];
        }

        if(emptyFarmlands.length > 0 && seeds) currentTask = TASK.SEED_CROPS;
    }

    if(forceTask) {
      currentTask = forceTask;
      if(forceTask != TASK.BAKKIE_DOEN) forceTask = null;
    }

    var taskTimeout = setTimeout(()=>{
        if(currentTask == TASK.RETURN_HOME) return;

        console.log(`[${bot.username}] WATCHDOG TIMEOUT [@Task(${currentTask})]`)
        runLoop = false;

        setTimeout(() => {
          console.log(`[${bot.username}] WATCHDOG RESTARTING...`)
          initBot(bot)
        }, 1000);
    }, 10000)

    
    switch(currentTask){
      case TASK.BAKKIE_DOEN:
        console.log(`[${bot.username}] TASK: BAKKIE_DOEN`);

        const b1 = {x: -5, y: -156}
        const b2 = {x: 2, y: -152};

        //random x and y value between b1 and b2
        const x = Math.floor(Math.random() * (b2.x - b1.x + 1) + b1.x);
        const y = Math.floor(Math.random() * (b1.y - b2.y + 1) + b2.y);

        await walkToLocation(bot, {x: x, z: y})


        await delay(1000)
      break;
      case TASK.DROP_ITEMS:
        console.log(`[${bot.username}] TASK: DROP_ITEMS`)
        await walkToLocation(bot, {x: -4, y: 64, z: -166, range: 0})
        await bot.look(1.047198, 0);
        await dropUnneededItems(bot);

        await delay(5000)

        console.log(`[${bot.username}] TASK COMPLETE: DROP_ITEMS`)
        currentTask = TASK.RETURN_HOME;
        break;
      case TASK.RETURN_HOME:
        console.log(`[${bot.username}] TASK: RETURN_HOME`)
        await walkToLocation(bot, {x: 0, y: 64, z: -170, range: 0})
        console.log(`[${bot.username}] TASK COMPLETE: RETURN_HOME`)
        currentTask = TASK.IDLE;
        break;
      case TASK.SEED_CROPS:
        var startTime = new Date().getTime();
        const farmland = emptyFarmlands[0]
        //await sendControlMessage('CLAIMBLOCK', {x: farmland.x, y: farmland.y, z: farmland.z, username: bot.username})

        console.log(`[${bot.username}] TASK: SEED_CROPS (${farmland.x}, ${farmland.y}, ${farmland.z})`)
        await walkToLocation(bot, {x: farmland.x, y: farmland.y, z: farmland.z, range: 0})

        const seeds = bot.inventory.findInventoryItem('wheat_seeds')
        await bot.equip(seeds, 'hand');

        try{
            const position = bot.blockAt(new Vec3(farmland.x, farmland.y, farmland.z));
            await bot.placeBlock(position, new Vec3(0, 1, 0));
        } catch(err){
            console.log(err)
        }

        console.log(`[${bot.username}] TASK COMPLETE: SEED_CROPS (${farmland.x}, ${farmland.y}, ${farmland.z}) in ${new Date().getTime() - startTime}ms`)
        await sendControlMessage('RELEASEBLOCK', {x: farmland.x, y: farmland.y, z: farmland.z, username: bot.username})
        currentTask = TASK.IDLE;
        break;
      case TASK.FARM_CROPS:
        var startTime = new Date().getTime();
        const crop = grownWheat[0]
        //await sendControlMessage('CLAIMBLOCK', {x: crop.x, y: crop.y, z: crop.z, username: bot.username})
        console.log(`[${bot.username}] TASK: FARM_CROPS (${crop.x}, ${crop.y}, ${crop.z})`)
        
        await walkToLocation(bot, {x: crop.x, y: crop.y, z: crop.z, range: 0})
        const isStillGrown = checkGrownWheat(bot, crop)
        
        if(isStillGrown){
            const result = await harvestAndReplaceWheat(bot, crop)
            if(result){
                console.log(`[${bot.username}] TASK COMPLETE: FARM_CROPS (${crop.x}, ${crop.y}, ${crop.z}) in ${new Date().getTime() - startTime}ms`)
            } else {
                console.log(`[${bot.username}] TASK FAILED: FARM_CROPS (${crop.x}, ${crop.y}, ${crop.z}) in ${new Date().getTime() - startTime}ms`)
            }
        }

        await sendControlMessage('RELEASEBLOCK', {x: crop.x, y: crop.y, z: crop.z, username: bot.username})
        //farm crops
        currentTask = TASK.IDLE;
        break;
      case TASK.IDLE:
        var startTime = new Date().getTime();
        console.log(`[${bot.username}] TASK: IDLE`)
        // await walkToRandomNearLocation(bot, {allowSprint: false});
        // await delay(5000)

        //make bot crouch
        await bot.setControlState('sneak', true);
        await delay(200)
        await bot.setControlState('sneak', false);
        await delay(100)

        console.log(`[${bot.username}] TASK COMPLETE: IDLE ${new Date().getTime() - startTime}ms`)
        currentTask = TASK.BAKKIE_DOEN;
        break;
    }


    clearTimeout(taskTimeout)
  }


}

initBots()