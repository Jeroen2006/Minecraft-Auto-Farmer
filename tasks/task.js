const TASK = {
    0: 'IDLE',
    1: 'RETURN_HOME',
    2: 'MOVE_TO',
    toInt,
    toTask
}

function toTask(int) {
    return TASK[int];
}

function toInt(task) {
    return Object.keys(TASK).find(key => TASK[key] === task);
}

module.exports = TASK;
