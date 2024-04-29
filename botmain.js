const { Farmer } = require('./utils/utils.js');
require('dotenv').config()


const slaaf = new Farmer({
    username: process.env.BOT_USERNAME,
    password: process.env.PASSOWRD,
    auth: process.env.AUTHENTICATION,
    server_ip: process.env.SERVER_IP,
    server_port: parseInt(process.env.SERVER_PORT),
    controller_ip: process.env.CONTROLLER_IP,
    controller_port: parseInt(process.env.CONTROLLER_PORT),
    reconnect: true,
});

slaaf.on('spawn', ()=>{
    console.log('Bot spawned');

    const { HOME_POSITION } = process.env;
    const [x, y, z] = HOME_POSITION.split(',').map(Number);

    slaaf.walkToXZ(x, z).then(()=>{
        console.log('Bot reached home');
    })
})
