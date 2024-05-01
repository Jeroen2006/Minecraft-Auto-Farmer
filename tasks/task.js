const TASK = {
    IDLE: 0,
    RETURN_HOME: 1,
    MOVE_TO: 2,
    LEADER: 3,
    toInt,
    toTask
}

function toTask(int) {
    return Object.keys(TASK).find(key => TASK[key] === int);
}

function toInt(task) {
    return TASK[task];
}

module.exports = TASK;
