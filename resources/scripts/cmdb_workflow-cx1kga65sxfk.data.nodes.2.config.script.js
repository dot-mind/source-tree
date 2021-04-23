// 停止一个「脚本执行任务」的运行

// 输入规格：
// {
//     "script_task_id": "",
// }

// 输出规格：
// {
//     "result": "SUCCEEDED/FAILED",
//     "result_name": "操作成功",
//     "message": "message",
// }

var ctx = new WorkflowRuntimeContext();
var input = ctx.input();
var ecu = ctx.getECU();

var output = {
    "result": "",
    "result_name": "",
    "message": "",
};

var scriptTemplateSchema = "cmdb_schema_x-3efon34td1omr"
var ticketTemplateIndex = "cmdb_index-m5rn0qhfaw4c"

var serverResourceSchema = "cmdb_schema_x-3bn8no4n0zd71"
var agentServerIndex = "cmdb_index-system_server"

var scriptTaskSchema = "cmdb_schema_x-l8a9znlzun9c"
var taskStatusIndex = "cmdb_index-3kyli9jj9w7ua"
var scriptTemplateIndex = "cmdb_index-bqwuyoxmwrzv"
var taskExecutorIndex = "cmdb_index-rgine0x35c64"
var taskWorkflowJobIndex = "cmdb_index-1jgigc11bwyyq"
var taskStarttimeIndex = "cmdb_index-5nmjlz3wl24o"

var scriptTaskRecordSchema = "cmdb_schema_x-3cu4v1w20seby"
var targetServerIndex = "cmdb_index-3d2auxg8f3gdv"
var scriptTaskIndex = "cmdb_index-2f84ou7p5ewhp"

var execStatusWaiting = "WAITING"
var execStatusRunning = "RUNNING"
var execStatusFinished = "FINISHED"
var execStatusSucceeded = "SUCCEEDED"
var execStatusFailed = "FAILED"
var execStatusCanceled = "CANCELED"

/*
返回值：
{
    "ok": true/false,
    "message": "error message",
    "task_workflow_job": ""
}
*/
function validateScriptTaskStop(script_task_id) {
    taskQuery = {
        objects: [script_task_id],
        conditions: [
            {field: ".inode.schema_id", op: "=", value: scriptTaskSchema},
        ], selects: ["."], limit: 1,
    }
    query_result = {}
    try {
        query_result = ecu.queryObjects(taskQuery, {count_mode: "no_count"})
    } catch (e) {
        return {ok: false, message: "操作异常，请稍后重试"}
    }
    if (!query_result.objects || !query_result.objects.length) {
        return {ok: false, message: "操作目标不存在（或没有操作权限）"}
    }
    task_object = query_result.objects[0]
    task_status = task_object.indexes[taskStatusIndex]
    if (task_status != execStatusRunning) {
        return {ok: false, message: "目标任务已停止"}
    }
    return {ok: true, task_workflow_job: task_object.data.workflow_job}
}

/*
返回值：
{
    "ok": true/false,
    "message": "error message",
}
*/
function stopScriptTask(script_task_id, workflow_job_id) {
    // 1. 停止正在执行的工作流任务
    cancel_result = {}
    try {
        cancel_result = ecu.cancelWorkflowJobs([workflow_job_id])
    } catch (e) {
        return {ok: false, message: "操作异常，请稍后重试："+e.message}
    }

    // 2. 更新「脚本执行记录」的状态
    taskRecordQuery = {
        objects: ["$conditions"],
        conditions: [
            {field: ".inode.schema_id", op: "=", value: scriptTaskRecordSchema},
            {field: ".indexes.cmdb_index-2f84ou7p5ewhp", op:"=", value:script_task_id},
            {field: ".indexes.cmdb_index-3kyli9jj9w7ua", op:"=-", value: [execStatusWaiting, execStatusRunning]},
        ], selects: ["."],
    }
    taskRecordObject = {
        data: {
            exec_descr: "执行过程被取消",
        },
        indexes: {
            "cmdb_index-3kyli9jj9w7ua": execStatusCanceled,
        },
    }
    update_result = {}
    try {
        update_result = ecu.updateObjects(taskRecordQuery, {
            object: taskRecordObject, updates: [
                ".data.exec_descr",
                ".indexes.cmdb_index-3kyli9jj9w7ua",
            ],
        })
    } catch (e) {
        return {ok: false, message: "操作异常，请稍后重试："+e.message}
    }

    // 3. 更新「脚本执行任务」的状态
    taskQuery = {
        objects: [script_task_id],
        conditions: [
            {field: ".inode.schema_id", op: "=", value: scriptTaskSchema},
            {field: ".indexes.cmdb_index-3kyli9jj9w7ua", op:"=", value: execStatusRunning},
        ], selects: ["."], limit: 1,
    }
    taskObject = {
        indexes: {
            "cmdb_index-3kyli9jj9w7ua": execStatusFinished,
        },
    }
    update_result = {}
    try {
        update_result = ecu.updateObjects(taskQuery, {
            object: taskObject, updates: [".indexes.cmdb_index-3kyli9jj9w7ua"],
        })
    } catch (e) {
        return {ok: false, message: "操作异常，请稍后重试："+e.message}
    }
    return {ok: true, message: "操作完成"}
}

// 注意：
// 这里要使用 KVDB 将中间状态进行持久化记录，避免重复执行
function mainProcessFunction() {
    // 1. 校验并获取相关对象配置（脚本配置 + 目标服务器）
    validate_ret = validateScriptTaskStop(input.script_task_id)
    if (!validate_ret.ok) {
        output.result = "FAILED"
        output.result_name = "操作失败"
        output.message = validate_ret.message
        return
    }
    // 2. 执行停止动作
    stop_ret = stopScriptTask(input.script_task_id, validate_ret.task_workflow_job)
    if (!stop_ret.ok) {
        output.result = "FAILED"
        output.result_name = "操作失败"
        output.message = stop_ret.message
        return
    }
    output.result = "SUCCEEDED"
    output.result_name = "操作成功"
    output.message = "任务停止成功，请查看任务详情"
}

try {
    mainProcessFunction();
} catch (e) {
    output.result = "FAILED"
    output.result_name = "操作失败"
    output.message = "操作异常，请稍后重试："+e.message
}
ctx.output(output);