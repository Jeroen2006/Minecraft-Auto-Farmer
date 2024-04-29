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

console.log(player);

player.on('spawn', ()=>{
    console.log('Bot spawned');

    const { HOME_POSITION } = process.env;
    const [x, y, z] = HOME_POSITION.split(',').map(Number);

    player.walkToXZ(x, z).then(()=>{
        console.log('Bot reached home');
    })

    setTimeout(() => {
        player.findEmptyFarmland(32, 100).then((farmland)=>{
            console.log(farmland);
        })

        player.findGrownCrops(32, 100, 'wheat').then((crops)=>{
            console.log(crops);
        })
    }, 1000);
})
