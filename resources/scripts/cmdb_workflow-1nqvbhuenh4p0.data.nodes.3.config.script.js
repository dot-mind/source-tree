// 重新执行「脚本执行任务」中指定的「脚本执行记录」

// 输入规格：
// {
//     "task_id": "", // 可选，外部可通过此字段预指定生成的 script_task_id
//     "task_record_scope": {
//          "vars": {
//              "var.name": {"op":"=", "value":""}
//          },
//          "ql_id": "",
//          "objects": []
//     },
// }

// 输出规格：
// {
//     "result": "SUCCEEDED/FAILED",
//     "result_name": "操作成功",
//     "message": "message",
//     "task_records": [],
// }

var ctx = new WorkflowRuntimeContext();
var input = ctx.input();
var ecu = ctx.ecu;

var output = {
    "result": "",
    "result_name": "",
    "message": "",
    "task_records": [],
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

function SaveCheckpoint(checkpoint) { ctx.setLocalValue(k, v) }
function LoadCheckpoint() { v = ctx.getLocalValue(k) }

/*
返回值：
{
    "ok": true/false,
    "message": "error message",
}
*/
function validateScriptTaskReexecInput(input) {
    if (!input.task_id) {
        return {ok: false, message: "请提供脚本执行任务 ID"}
    }
    if (!input.task_record_scope) {
        return {ok: false, message: "请提供需要重新执行的脚本执行记录"}
    }
    return {ok: true}
}

/*
返回值：
{
    "ok": true/false,
    "message": "error message",
    "script_task": {
        "status": ""
    }
}
*/
function fetchScriptTaskStatus(script_task_id) {
    taskQuery = {
        objects: [script_task_id],
        conditions: [{field: ".inode.schema_id", op: "=", value: scriptTaskSchema}],
        limit: 1, selects: [".indexes.cmdb_index-3kyli9jj9w7ua"],
    }
    query_result = {}
    try { query_result = ecu.cmdb.queryObjects(taskQuery) } catch (e) {
        return {ok: false, message: "任务查询异常："+e.message}
    }
    if (!query_result || !query_result.objects || !query_result.objects.length) {
        return {ok: false, message: "任务不存在（或无查看权限），请确认"}
    }
    task_object = query_result.objects[0]
    return {ok: true, script_task: {
        status: task_object.indexes["cmdb_index-3kyli9jj9w7ua"],
    }}
}

/*
返回值：
{
    "ok": true/false,
    "message": "error message",
    "script_task_records": []
}
*/
function updateScriptTaskRecords(task_record_scope) {
    // 1. 查询符合条件的 Task Records
    ql_conds = []
    for (var v in task_record_scope.vars) {
        cond = task_record_scope.vars[v]
        if (!cond || !cond.value) {
            continue
        }
        ql_conds.push({field: v, op: cond.op, value: cond.value})
    }
    ql_input = {
        conditions: ql_conds,
        objects: task_record_scope.objects,
        selects: [".data.snapshot"]
    }
    query_result = {}
    try {
        query_result = ecu.ql.queryQlTablePack(task_record_scope.ql_id, ql_input, {count_mode: "nocount"})
    } catch (e) {
        return {ok: false, message: "获取任务记录异常："+e.message}
    }
    if (!query_result.rows || !query_result.rows.length) {
        return {ok: false, message: "未指定任何任务记录"}
    }
    var script_task_records = [];
    var task_records = [];
    query_result.rows.forEach(function(row){
        var obj = row.data[1];
        obj.id = row.data[0];
        if (obj.exec_mode === "ssh" && obj.ssh_config) {
            obj.ssh_config.target = obj.ssh_config.host + ":" + obj.ssh_config.port;
        }
        task_records.push(obj);
        script_task_records.push(row.data[0])
    })

    // 2. 更新 Task Records 的执行状态
    now = new Date().getTime() / 1000;
    taskRecordObject = {
        data: {
            exec_descr: "等待重新执行",
            output: "",
            exit_code: -1,
            stdout: "",
            stderr: "",
            elapsed_time: -1,
        },
        indexes: {
            "cmdb_index-3kyli9jj9w7ua": execStatusWaiting,
            "cmdb_index-5nmjlz3wl24o": Math.ceil(now),
            "cmdb_index-rgine0x35c64": ctx.getExecutor(),
        },
    }
    taskRecordQuery = {
        objects: script_task_records,
        conditions: [
            {field: ".inode.schema_id", op: "=", value: scriptTaskRecordSchema},
        ],
    }
    try {
        ecu.cmdb.updateObjects(taskRecordQuery, {
            object: taskRecordObject,
            updates: [
                ".data.exec_descr",
                ".data.output",
                ".data.exit_code",
                ".data.stdout",
                ".data.stderr",
                ".data.elapsed_time",
                ".indexes.cmdb_index-3kyli9jj9w7ua",
                ".indexes.cmdb_index-5nmjlz3wl24o",
                ".indexes.cmdb_index-rgine0x35c64",
            ]
        })
    } catch(e) {
        return {ok: false, message: "更新任务记录异常："+e.message}
    }
    return {ok: true, script_task_records: task_records}
}

function mainProcessFunction() {
    validate_ret = validateScriptTaskReexecInput(input)
    if (!validate_ret.ok) {
        output.result = "FAILED"
        output.result_name = "参数校验失败"
        output.message = validate_ret.message
        return
    }
    task_ret = fetchScriptTaskStatus(input.task_id)
    if (!task_ret.ok) {
        output.result = "FAILED"
        output.result_name = "参数校验失败"
        output.message = validate_ret.message
        return
    }
    if (task_ret.script_task.status != execStatusFinished) {
        output.result = "FAILED"
        output.result_name = "任务尚未结束，无法重新执行"
        output.message = validate_ret.message
        return
    }
    update_ret = updateScriptTaskRecords(input.task_record_scope)
    if (!update_ret.ok) {
        output.result = "FAILED"
        output.result_name = "更新执行记录失败"
        output.message = update_ret.message
        return
    }
    output.result = "SUCCEEDED"
    output.result_name = "操作成功"
    output.message = "指定任务记录已开始重新执行"
    output.task_records = update_ret.script_task_records
}

try {
    mainProcessFunction();
} catch (e) {
    output.result = "FAILED"
    output.result_name = "操作失败"
    output.message = "操作异常，请稍后重试："+e.message
}
ctx.output(output);