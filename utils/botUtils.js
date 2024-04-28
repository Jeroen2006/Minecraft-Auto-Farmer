const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear, GoalXZ } } = require('mineflayer-pathfinder')
var Vec3 = require('vec3').Vec3;
const delay = require('./utils').delay

const tasks = {
  IDLE: 0,
  DROP_ITEMS: 1,
  FARM_CROPS: 2,
  SEED_CROPS: 3,
  RETURN_HOME: 4,
  BAKKIE_DOEN: 5,
  TEAMLEIDER: 6
}

const fullGrownAges = {
  'wheat': 7,
  'carrots': 7,
  'potatoes': 7,
  'beetroots': 3,
  'nether_wart': 3

}

function checkInventoryFull(bot){
  return bot.inventory.slots.filter((slot) => slot).length >= 36
}


function findgrownCrops(botInstance, maxDistance = 32, count = 25){
  return new Promise(res=>{
    const mcData = require('minecraft-data')(botInstance.version)

    const { CROP_ITEM } = global.farmConfig

    console.log(CROP_ITEM)

    const result = botInstance.findBlocks({
        matching: (block) =>{
            //if(block.name != "air") console.log(block)
            return CROP_ITEM.includes(block.name) && block._properties.age >= fullGrownAges[block.name]
        },
        maxDistance: maxDistance,
        count: count,
      });

    //shuffle result array
    // result.sort(() => Math.random() - 0.5);


    res(result)
  })
}

function lookForEmptyFarmland(botInstance, maxDistance = 32, count = 25){
  return new Promise(res=>{
    const mcData = require('minecraft-data')(botInstance.version)

    const result = botInstance.findBlocks({
        useExtraInfo: (block) => {
            const blockAbove = botInstance.blockAt(block.position.offset(0,1,0))
            return !blockAbove || blockAbove.type === mcData.blocksByName.air.id
        },
        matching: botInstance.registry.blocksByName.farmland.id,
        maxDistance: maxDistance,
        count: count,
      });

      //shuffle result array
      // result.sort(() => Math.random() - 0.5);
      res(result)
  })
}

function harvestAndReplaceCrop(botInstance, {x, y, z}){
  return new Promise(async res=>{
    const block = botInstance.blockAt(new Vec3(x, y, z))

    const { SEED_ITEM } = global.farmConfig

    await botInstance.dig(block, true);
    await delay(500);
    const seeds = botInstance.inventory.findInventoryItem(SEED_ITEM)
    if(seeds){
      await botInstance.equip(seeds, 'hand');
      try{
          const position = botInstance.blockAt(new Vec3(block.position.x, block.position.y-1, block.position.z));
          await botInstance.placeBlock(position, new Vec3(0, 1, 0));
          res(true)
      } catch(err){
      }
    } else {
      console.log("No seeds found")
    }

    res(false)
  })
}

function walkToRandomNearLocation(botInstance, {allowSprint = false}){
  return new Promise(async (res, rej)=>{

    var {x, y, z} = botInstance.entity.position;

    const box1 = {x: -6, z: -169}
    const box2 = {x: 88, z: -213}

    //max distance is 8 blocks
    x += Math.floor(Math.random() * 4) - 4
    z += Math.floor(Math.random() * 4) - 4

    if(x < box1.x) x = box1.x
    if(x > box2.x) x = box2.x
    if(z < box2.z) z = box2.z
    if(z > box1.z) z = box1.z

    await walkToLocation(botInstance, {x, y, z, allowSprint})

    res(false)
  })
}

function dropUnneededItems(botInstance){
  return new Promise(async res=>{

    const { SEED_ITEM } = global.farmConfig

    //drop all unneeded items, except 1 stack of seeds and a diamond hoe
    const itemsToKeep = [SEED_ITEM, 'diamond_hoe']

    var itemsToDrop = botInstance.inventory.items().filter((item) => {
        return !itemsToKeep.includes(item.name)
    })

    var seeds = botInstance.inventory.items().filter((item) => {
        return item.name == SEED_ITEM
    })

    //remove 1 item from wheat seeds
    seeds.pop();

    itemsToDrop = itemsToDrop.concat(seeds)

    for(const item of itemsToDrop){
        await botInstance.tossStack(item)
        await delay(500)
    }

    res()
  })
}

function checkgrownCrops(bot, {x, y, z}) {
  const mcData = require('minecraft-data')(bot.version)

  const { CROP_ITEM } = global.farmConfig
  const block = bot.blockAt(new Vec3(x, y, z))
  return CROP_ITEM.includes(block.type) && block._properties.age >= 7
}

function createBotInstance({ config, username, password, id, autoRespawn = true}) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const bot = mineflayer.createBot({
        host: config.host,
        username: username,
        // password: password,
        auth: "offline",
        // auth: password != '' ? "microsoft" : "offline",
        port: config.port,
        version: '1.20.1',
        keepAlive: true,
      })
      bot.loadPlugin(pathfinder)

      //inventoryViewer(bot)
      
      const autoRetry = setTimeout(async () => {
        //reject(Error('Skill issues while spawning'))
        const botAttempt = await createBotInstance({ config, username, password, id, autoRespawn })
        resolve(botAttempt)
      }, 5000)

      bot.on('spawn', () => {
        clearTimeout(autoRetry)
        resolve(bot)
      })
      bot.on('error', (err) => reject(err))
      if(autoRespawn) bot.on('death ', () => bot.respawn());


      //on bot leave, kick etc kill process
      bot.on('end', (reason) => {
        console.log(`Bot ${id} disconnected: ${reason}`)
        process.exit(1)
      })

      
    }, config.interval * id)
  })
}

function walkToLocation(bot, {x, y, z, range = 1, allowSprint = false}){
  return new Promise((res, rej)=>{
      const mcData = require('minecraft-data')(bot.version)

      const botPosition = bot.entity.position
      if(botPosition.distanceTo(new Vec3(x, y, z)) <= 1){
          res(true)
          return
      }

      bot.pathfinder.setMovements(new Movements(bot, mcData))
      bot.pathfinder.movements.sprint = allowSprint

      //disable breaking and placing blocks
      bot.pathfinder.movements.canDig = false
      bot.pathfinder.movements.canPlaceOn = false
      bot.pathfinder.movements.canPlace = false

      bot.pathfinder.setGoal(new GoalXZ(x, z))


      bot.on('goal_reached', () => {
          res(false)
      })
  })
}

module.exports = {
  createBotInstance,
  walkToLocation,
  checkInventoryFull,
  findgrownCrops,
  checkgrownCrops,
  harvestAndReplaceCrop,
  lookForEmptyFarmland,
  walkToRandomNearLocation,
  Vec3,
  dropUnneededItems,
  tasks
}